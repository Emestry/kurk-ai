import {
  InventoryAdjustmentReason,
  InventoryMovementType,
  StocktakeStatus,
} from "@/generated/prisma/enums.js";
import type { DbClient } from "@/lib/db.js";
import { withDbTransaction } from "@/lib/db.js";
import { ApiError } from "@/lib/errors.js";
import { sanitizeOptionalStoredText } from "@/lib/input.js";
import { publishRealtimeEvent } from "@/lib/realtime.js";

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new ApiError(400, `${label} must be a non-negative integer`);
  }
}

async function resolveExistingUserId(
  db: DbClient,
  userId?: string,
) {
  if (!userId) {
    return undefined;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  return user?.id;
}

/**
 * Returns all stocktake sessions with their lines, most recent first.
 */
export async function listStocktakeSessions() {
  return withDbTransaction(async (db) => {
    return db.stocktakeSession.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
          },
        },
      },
    });
  });
}

/**
 * Opens a stocktake session and freezes the current expected counts as editable lines.
 */
export async function createStocktakeSession(note?: string, startedByUserId?: string) {
  return withDbTransaction(async (db) => {
    const safeStartedByUserId = await resolveExistingUserId(db, startedByUserId);
    const session = await db.stocktakeSession.create({
      data: {
        note: sanitizeOptionalStoredText(note, { preserveNewlines: true }),
        startedByUserId: safeStartedByUserId,
      },
    });

    const inventoryItems = await db.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    if (inventoryItems.length > 0) {
      await db.stocktakeLine.createMany({
        data: inventoryItems.map((item) => ({
          sessionId: session.id,
          inventoryItemId: item.id,
          expectedQuantity: item.quantityInStock,
        })),
      });
    }

    return db.stocktakeSession.findUniqueOrThrow({
      where: { id: session.id },
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
          },
        },
      },
    });
  });
}

/**
 * Records physical counts and discrepancy reasons for an open stocktake session.
 */
export async function upsertStocktakeLines(
  sessionId: string,
  lines: Array<{
    inventoryItemId: string;
    physicalCount: number;
    reason?: "damaged" | "theft" | "miscounted" | "supplier_error";
  }>,
) {
  if (lines.length === 0) {
    throw new ApiError(400, "Stocktake must include at least one line");
  }

  return withDbTransaction(async (db) => {
    const session = await db.stocktakeSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new ApiError(404, "Stocktake session not found");
    }

    if (session.status !== StocktakeStatus.open) {
      throw new ApiError(409, "Stocktake session has already been finalized");
    }

    const uniqueItemIds = new Set<string>();

    for (const line of lines) {
      if (!line.inventoryItemId) {
        throw new ApiError(400, "Stocktake lines must reference inventory items");
      }

      assertNonNegativeInteger(line.physicalCount, "Physical count");

      if (uniqueItemIds.has(line.inventoryItemId)) {
        throw new ApiError(400, "Stocktake lines must reference unique inventory items");
      }

      uniqueItemIds.add(line.inventoryItemId);
    }

    const existingLines = await db.stocktakeLine.findMany({
      where: {
        sessionId,
        inventoryItemId: {
          in: [...uniqueItemIds],
        },
      },
    });
    const lineMap = new Map(existingLines.map((line) => [line.inventoryItemId, line]));

    if (existingLines.length !== uniqueItemIds.size) {
      throw new ApiError(404, "One or more inventory items were not found");
    }

    for (const line of lines) {
      const stocktakeLine = lineMap.get(line.inventoryItemId)!;
      const discrepancyQuantity = line.physicalCount - stocktakeLine.expectedQuantity;

      if (discrepancyQuantity !== 0 && !line.reason) {
        throw new ApiError(422, "Discrepancy reason is required");
      }

      await db.stocktakeLine.update({
        where: { id: stocktakeLine.id },
        data: {
          physicalCount: line.physicalCount,
          discrepancyQuantity,
          reason: line.reason,
        },
      });
    }

    return db.stocktakeSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
            reconciliation: true,
          },
        },
      },
    });
  });
}

/**
 * Fetches a stocktake session with all lines and reconciliation records.
 */
export async function getStocktakeSession(sessionId: string) {
  return withDbTransaction(async (db) => {
    const session = await db.stocktakeSession.findUnique({
      where: { id: sessionId },
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
            reconciliation: true,
          },
        },
        reconciliations: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    if (!session) {
      throw new ApiError(404, "Stocktake session not found");
    }

    return session;
  });
}

/**
 * Finalizes a stocktake by applying reconciliations atomically and logging stock adjustments.
 */
export async function finalizeStocktakeSession(
  sessionId: string,
  finalizedByUserId?: string,
) {
  const session = await withDbTransaction(async (db) => {
    const safeFinalizedByUserId = await resolveExistingUserId(db, finalizedByUserId);
    const stocktakeSession = await db.stocktakeSession.findUnique({
      where: { id: sessionId },
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
            reconciliation: true,
          },
        },
      },
    });

    if (!stocktakeSession) {
      throw new ApiError(404, "Stocktake session not found");
    }

    if (stocktakeSession.status !== StocktakeStatus.open) {
      throw new ApiError(409, "Stocktake session has already been finalized");
    }

    if (stocktakeSession.lines.length === 0) {
      throw new ApiError(409, "Stocktake session must include at least one line");
    }

    for (const line of stocktakeSession.lines) {
      if (line.physicalCount === null || line.discrepancyQuantity === null) {
        throw new ApiError(422, "Every stocktake line must include a physical count");
      }

      if (line.discrepancyQuantity !== 0 && !line.reason) {
        throw new ApiError(422, "Discrepancy reason is required");
      }
    }

    for (const line of stocktakeSession.lines) {
      if (line.physicalCount === null || line.discrepancyQuantity === null) {
        continue;
      }

      await db.inventoryItem.update({
        where: { id: line.inventoryItemId },
        data: {
          quantityInStock: line.physicalCount,
        },
      });

      if (line.discrepancyQuantity !== 0 && line.reason) {
        await db.stocktakeReconciliation.upsert({
          where: { stocktakeLineId: line.id },
          update: {
            expectedQuantity: line.expectedQuantity,
            physicalCount: line.physicalCount,
            discrepancyQuantity: line.discrepancyQuantity,
            reason: line.reason,
            createdByUserId: safeFinalizedByUserId,
          },
          create: {
            sessionId: sessionId,
            stocktakeLineId: line.id,
            inventoryItemId: line.inventoryItemId,
            expectedQuantity: line.expectedQuantity,
            physicalCount: line.physicalCount,
            discrepancyQuantity: line.discrepancyQuantity,
            reason: line.reason,
            createdByUserId: safeFinalizedByUserId,
          },
        });
      }

      await db.inventoryMovement.create({
        data: {
          inventoryItemId: line.inventoryItemId,
          stocktakeSessionId: sessionId,
          createdByUserId: safeFinalizedByUserId,
          type: InventoryMovementType.stocktake,
          reason: line.reason
            ? ({
                damaged: InventoryAdjustmentReason.damaged,
                theft: InventoryAdjustmentReason.theft,
                miscounted: InventoryAdjustmentReason.miscounted,
                supplier_error: InventoryAdjustmentReason.supplier_error,
              }[line.reason])
            : InventoryAdjustmentReason.manual_adjustment,
          quantityDelta: line.discrepancyQuantity,
          note: `Stocktake ${sessionId}`,
        },
      });
    }

    return db.stocktakeSession.update({
      where: { id: sessionId },
      data: {
        status: StocktakeStatus.finalized,
        finalizedAt: new Date(),
        finalizedByUserId: safeFinalizedByUserId,
      },
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
            reconciliation: true,
          },
        },
        reconciliations: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
          },
        },
      },
    });
  });

  publishRealtimeEvent({
    type: "stocktake.finalized",
    requestId: "",
    occurredAt: new Date().toISOString(),
    data: {
      stocktakeSessionId: session.id,
      reconciliationCount: session.reconciliations.length,
    },
  });

  return session;
}
