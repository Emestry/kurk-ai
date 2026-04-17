import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { streamSSE } from "hono/streaming";
import type { InventoryAdjustmentReason } from "@/generated/prisma/enums.js";
import { authMiddleware } from "@/middlewares/auth.js";
import type { HonoEnv } from "@/lib/types.js";
import { jsonError } from "@/lib/http.js";
import { subscribeToRealtimeEvents } from "@/lib/realtime.js";
import {
  adjustInventoryItem,
  createInventoryItem,
  listInventoryItems,
  listInventoryMovements,
  restockInventoryItem,
  updateInventoryItem,
} from "@/services/inventory-service.js";
import { getMonthlyUsageReport } from "@/services/report-service.js";
import {
  listStaffRequests,
  updateStaffRequest,
  type UpdateStaffRequestInput,
} from "@/services/request-service.js";
import {
  createStocktakeSession,
  finalizeStocktakeSession,
  getStocktakeSession,
  listStocktakeSessions,
  upsertStocktakeLines,
} from "@/services/stocktake-service.js";

interface StaffRouteOptions {
  auth?: MiddlewareHandler<HonoEnv>;
}

interface UpdateStaffRequestBody {
  status?: string;
  rejectionReason?: string;
  staffNote?: string;
  etaMinutes?: number | null;
  items?: Array<{
    requestItemId?: string;
    deliveredQuantity?: number;
  }>;
}

interface InventoryBody {
  sku?: string;
  name?: string;
  category?: "room_service" | "housekeeping" | "maintenance" | "reception";
  unit?: string;
  quantityInStock?: number;
  lowStockThreshold?: number;
  isActive?: boolean;
}

interface RestockBody {
  quantity?: number;
  note?: string;
}

interface AdjustmentBody {
  quantityDelta?: number;
  reason?: InventoryAdjustmentReason;
  note?: string;
}

interface UpsertStocktakeLinesBody {
  lines?: Array<{
    inventoryItemId?: string;
    physicalCount?: number;
    reason?: "damaged" | "theft" | "miscounted" | "supplier_error";
  }>;
}

function createStatusInput(
  requestId: string,
  body: UpdateStaffRequestBody,
): UpdateStaffRequestInput | null {
  if (
    body.status !== undefined &&
    body.status !== "received" &&
    body.status !== "in_progress" &&
    body.status !== "delivered" &&
    body.status !== "rejected"
  ) {
    return null;
  }

  const items =
    body.items?.map((item) => ({
      requestItemId: item.requestItemId?.trim() ?? "",
      deliveredQuantity: item.deliveredQuantity ?? 0,
    })) ?? [];

  if (
    items.some(
      (item) =>
        !item.requestItemId ||
        !Number.isInteger(item.deliveredQuantity) ||
        item.deliveredQuantity < 0,
    )
  ) {
    return null;
  }

  if (
    body.etaMinutes !== undefined &&
    body.etaMinutes !== null &&
    (!Number.isInteger(body.etaMinutes) || body.etaMinutes < 0)
  ) {
    return null;
  }

  return {
    requestId,
    status: body.status as UpdateStaffRequestInput["status"],
    rejectionReason: body.rejectionReason?.trim(),
    staffNote: body.staffNote?.trim(),
    etaMinutes: body.etaMinutes,
    items,
  };
}

export function createStaffRoutes(options: StaffRouteOptions = {}) {
  const staff = new Hono<HonoEnv>();
  const requireStaffAuth = options.auth ?? authMiddleware;

  staff.use("/*", requireStaffAuth);

  staff.get("/requests", async (c) => {
    const requests = await listStaffRequests();
    return c.json({ requests });
  });

  staff.patch("/requests/:requestId", async (c) => {
    const body = createStatusInput(
      c.req.param("requestId"),
      await c.req.json<UpdateStaffRequestBody>(),
    );

    if (!body) {
      return jsonError(c, 400, "Invalid staff request payload");
    }

    const request = await updateStaffRequest(body);
    return c.json(request);
  });

  staff.get("/inventory", async (c) => {
    const items = await listInventoryItems();
    return c.json({ items });
  });

  staff.post("/inventory", async (c) => {
    const body = await c.req.json<InventoryBody>();

    if (
      !body.sku?.trim() ||
      !body.name?.trim() ||
      !body.category ||
      !body.unit?.trim() ||
      body.quantityInStock === undefined ||
      body.lowStockThreshold === undefined
    ) {
      return jsonError(c, 400, "Invalid inventory payload");
    }

    const item = await createInventoryItem({
      sku: body.sku.trim(),
      name: body.name.trim(),
      category: body.category,
      unit: body.unit.trim(),
      quantityInStock: body.quantityInStock,
      lowStockThreshold: body.lowStockThreshold,
    });

    return c.json(item, 201);
  });

  staff.patch("/inventory/:inventoryItemId", async (c) => {
    const body = await c.req.json<InventoryBody>();
    const item = await updateInventoryItem(c.req.param("inventoryItemId"), body);
    return c.json(item);
  });

  staff.post("/inventory/:inventoryItemId/restock", async (c) => {
    const body = await c.req.json<RestockBody>();

    if (!Number.isInteger(body.quantity) || (body.quantity ?? 0) <= 0) {
      return jsonError(c, 400, "Restock quantity must be a positive integer");
    }

    const result = await restockInventoryItem({
      inventoryItemId: c.req.param("inventoryItemId"),
      quantity: body.quantity!,
      note: body.note?.trim(),
      createdByUserId: c.get("user").id,
    });

    return c.json(result);
  });

  staff.post("/inventory/:inventoryItemId/adjustments", async (c) => {
    const body = await c.req.json<AdjustmentBody>();

    if (!Number.isInteger(body.quantityDelta) || body.quantityDelta === 0 || !body.reason) {
      return jsonError(c, 400, "Invalid inventory adjustment payload");
    }

    const result = await adjustInventoryItem({
      inventoryItemId: c.req.param("inventoryItemId"),
      quantityDelta: body.quantityDelta!,
      reason: body.reason,
      note: body.note?.trim(),
      createdByUserId: c.get("user").id,
    });

    return c.json(result);
  });

  staff.get("/inventory/movements", async (c) => {
    const movements = await listInventoryMovements({
      inventoryItemId: c.req.query("inventoryItemId")?.trim(),
      requestId: c.req.query("requestId")?.trim(),
      stocktakeSessionId: c.req.query("stocktakeSessionId")?.trim(),
    });

    return c.json({ movements });
  });

  staff.get("/reports/monthly", async (c) => {
    const month = c.req.query("month");

    if (!month) {
      return jsonError(c, 400, "Month query parameter is required");
    }

    const report = await getMonthlyUsageReport(month);
    return c.json(report);
  });

  staff.get("/events", async (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ scope: "staff" }),
      });

      const unsubscribe = subscribeToRealtimeEvents(
        () => true,
        (event) => {
          void stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });
        },
      );

      await new Promise<void>((resolve) => {
        const abort = () => {
          unsubscribe();
          resolve();
        };

        c.req.raw.signal.addEventListener("abort", abort, { once: true });
      });
    });
  });

  staff.get("/stocktakes", async (c) => {
    const sessions = await listStocktakeSessions();
    return c.json({ stocktakes: sessions });
  });

  staff.post("/stocktakes", async (c) => {
    const body = await c.req
      .json<{ note?: string }>()
      .catch((): { note?: string } => ({}));
    const session = await createStocktakeSession(body.note, c.get("user").id);
    return c.json(session, 201);
  });

  staff.post("/stocktakes/:stocktakeId/lines", async (c) => {
    const body = await c.req.json<UpsertStocktakeLinesBody>();
    const session = await upsertStocktakeLines(
      c.req.param("stocktakeId"),
      body.lines?.map((line) => ({
        inventoryItemId: line.inventoryItemId?.trim() ?? "",
        physicalCount: line.physicalCount ?? -1,
        reason: line.reason,
      })) ?? [],
    );

    return c.json(session);
  });

  staff.get("/stocktakes/:stocktakeId", async (c) => {
    const session = await getStocktakeSession(c.req.param("stocktakeId"));
    return c.json(session);
  });

  staff.post("/stocktakes/:stocktakeId/finalize", async (c) => {
    const session = await finalizeStocktakeSession(
      c.req.param("stocktakeId"),
      c.get("user").id,
    );
    return c.json(session);
  });

  return staff;
}
