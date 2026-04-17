import { RequestCategory, RequestStatus } from "@/generated/prisma/enums.js";
import { withDbTransaction } from "@/lib/db.js";
import { ApiError } from "@/lib/errors.js";

function getMonthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new ApiError(400, "Month must use YYYY-MM format");
  }

  const start = new Date(`${month}-01T00:00:00.000Z`);

  if (Number.isNaN(start.getTime())) {
    throw new ApiError(400, "Month must use YYYY-MM format");
  }

  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  return { start, end };
}

export async function getMonthlyUsageReport(month: string) {
  const { start, end } = getMonthRange(month);

  return withDbTransaction(async (db) => {
    const [requests, stocktakeSessions] = await Promise.all([
      db.guestRequest.findMany({
        where: {
          createdAt: {
            gte: start,
            lt: end,
          },
        },
        include: {
          room: true,
          items: {
            include: {
              inventoryItem: true,
            },
          },
          events: {
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      db.stocktakeSession.findMany({
        where: {
          status: "finalized",
          finalizedAt: {
            gte: start,
            lt: end,
          },
        },
        include: {
          reconciliations: {
            include: {
              inventoryItem: true,
            },
          },
        },
      }),
    ]);

    // --- legacy aggregations (kept for backwards compat) ---
    const requestsByStatus = Object.values(RequestStatus).reduce<Record<string, number>>(
      (accumulator, status) => {
        accumulator[status] = 0;
        return accumulator;
      },
      {},
    );
    const requestsByRoom = new Map<
      string,
      { roomId: string; roomNumber: string; requestCount: number }
    >();
    const itemUsage = new Map<
      string,
      {
        inventoryItemId: string;
        sku: string;
        name: string;
        requestedQuantity: number;
        deliveredQuantity: number;
      }
    >();
    const requestsByCategoryLegacy = Object.values(RequestCategory).reduce<Record<string, number>>(
      (accumulator, category) => {
        accumulator[category] = 0;
        return accumulator;
      },
      {},
    );

    // --- new analytics aggregations ---
    const byDay = new Map<
      string,
      { date: string; delivered: number; partiallyDelivered: number; rejected: number; inProgress: number; received: number }
    >();
    const byHour = new Map<number, number>();
    const requestsByCategoryNew = new Map<string, number>();
    const consumptionMap = new Map<
      string,
      {
        inventoryItemId: string;
        itemName: string;
        category: string;
        unitsRequested: number;
        unitsDelivered: number;
        requests: number;
      }
    >();

    let totalResponseTimeSecs = 0;
    let responseTimeCount = 0;

    for (const request of requests) {
      // legacy status count
      requestsByStatus[request.status] += 1;
      if (request.category) {
        requestsByCategoryLegacy[request.category] += 1;
      }

      const roomEntry = requestsByRoom.get(request.roomId) ?? {
        roomId: request.roomId,
        roomNumber: request.room.number,
        requestCount: 0,
      };
      roomEntry.requestCount += 1;
      requestsByRoom.set(request.roomId, roomEntry);

      for (const item of request.items) {
        const usage = itemUsage.get(item.inventoryItemId) ?? {
          inventoryItemId: item.inventoryItemId,
          sku: item.inventoryItem.sku,
          name: item.inventoryItem.name,
          requestedQuantity: 0,
          deliveredQuantity: 0,
        };
        usage.requestedQuantity += item.requestedQuantity;
        usage.deliveredQuantity += item.deliveredQuantity;
        itemUsage.set(item.inventoryItemId, usage);
      }

      // --- new: by-day ---
      const dateKey = request.createdAt.toISOString().slice(0, 10);
      const dayEntry = byDay.get(dateKey) ?? {
        date: dateKey,
        delivered: 0,
        partiallyDelivered: 0,
        rejected: 0,
        inProgress: 0,
        received: 0,
      };
      switch (request.status) {
        case "delivered":
          dayEntry.delivered += 1;
          break;
        case "partially_delivered":
          dayEntry.partiallyDelivered += 1;
          break;
        case "rejected":
          dayEntry.rejected += 1;
          break;
        case "in_progress":
          dayEntry.inProgress += 1;
          break;
        case "received":
          dayEntry.received += 1;
          break;
      }
      byDay.set(dateKey, dayEntry);

      // --- new: by-hour ---
      const hour = request.createdAt.getUTCHours();
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1);

      // --- new: by-category ---
      if (request.category) {
        requestsByCategoryNew.set(
          request.category,
          (requestsByCategoryNew.get(request.category) ?? 0) + 1,
        );
      }

      // --- new: consumption per item ---
      for (const item of request.items) {
        const entry = consumptionMap.get(item.inventoryItemId) ?? {
          inventoryItemId: item.inventoryItemId,
          itemName: item.inventoryItem.name,
          category: item.inventoryItem.category,
          unitsRequested: 0,
          unitsDelivered: 0,
          requests: 0,
        };
        entry.unitsRequested += item.requestedQuantity;
        entry.unitsDelivered += item.deliveredQuantity;
        entry.requests += 1;
        consumptionMap.set(item.inventoryItemId, entry);
      }

      // --- new: average response time (createdAt → first in_progress event) ---
      const inProgressEvent = request.events.find(
        (e) => {
          if (e.type !== "status_changed") {
            return false;
          }

          const payload = e.payload as Record<string, unknown> | null;
          return (
            payload?.["status"] === "in_progress" ||
            payload?.["to"] === "in_progress"
          );
        },
      );
      if (inProgressEvent) {
        const secs =
          (inProgressEvent.createdAt.getTime() - request.createdAt.getTime()) / 1000;
        if (secs >= 0) {
          totalResponseTimeSecs += secs;
          responseTimeCount += 1;
        }
      }
    }

    // --- reconciliations per session ---
    const reconciliations = stocktakeSessions.map((session) => {
      const discrepant = session.reconciliations.filter(
        (r) => r.discrepancyQuantity !== 0,
      );
      const netAdjustment = session.reconciliations.reduce(
        (sum, r) => sum + r.discrepancyQuantity,
        0,
      );
      const reasons: Record<string, number> = {};
      for (const r of discrepant) {
        reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
      }
      return {
        sessionId: session.id,
        itemCount: session.reconciliations.length,
        discrepantItemCount: discrepant.length,
        netAdjustment,
        reasons,
        finalizedAt: session.finalizedAt!.toISOString(),
      };
    });

    // Build sorted requestsByDay array (fill in 0s is not required — client renders what it gets)
    const requestsByDay = [...byDay.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // Build requestsByHour array for all 24 hours
    const requestsByHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: byHour.get(h) ?? 0,
    }));

    // Build requestsByCategory array
    const requestsByCategory = [...requestsByCategoryNew.entries()].map(
      ([category, count]) => ({ category, count }),
    );

    // Build consumption array
    const consumption = [...consumptionMap.values()].map((entry) => ({
      ...entry,
      unitsUnfulfilled: entry.unitsRequested - entry.unitsDelivered,
    }));

    const averageResponseTimeSeconds =
      responseTimeCount > 0
        ? Math.round(totalResponseTimeSecs / responseTimeCount)
        : null;

    return {
      month,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      // --- DTO fields ---
      totalRequests: requests.length,
      outcomes: {
        delivered: requestsByStatus["delivered"] ?? 0,
        partiallyDelivered: requestsByStatus["partially_delivered"] ?? 0,
        rejected: requestsByStatus["rejected"] ?? 0,
      },
      totalUnitsDelivered: [...itemUsage.values()].reduce(
        (sum, item) => sum + item.deliveredQuantity,
        0,
      ),
      averageResponseTimeSeconds,
      requestsByDay,
      requestsByHour,
      requestsByCategory,
      consumption,
      reconciliations,
      // --- legacy fields (kept for backwards compat) ---
      totals: {
        requestCount: requests.length,
        deliveredItemQuantity: [...itemUsage.values()].reduce(
          (sum, item) => sum + item.deliveredQuantity,
          0,
        ),
        reconciliationCount: reconciliations.length,
      },
      requestsByStatus,
      requestsByRoom: [...requestsByRoom.values()].sort(
        (left, right) => right.requestCount - left.requestCount,
      ),
      itemUsage: [...itemUsage.values()].sort(
        (left, right) =>
          right.requestedQuantity - left.requestedQuantity ||
          right.deliveredQuantity - left.deliveredQuantity,
      ),
      mostRequestedItems: [...itemUsage.values()]
        .sort(
          (left, right) =>
            right.requestedQuantity - left.requestedQuantity ||
            right.deliveredQuantity - left.deliveredQuantity,
        )
        .slice(0, 5),
    };
  });
}
