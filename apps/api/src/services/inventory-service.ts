import {
  InventoryAdjustmentReason,
  InventoryMovementType,
  ReservationStatus,
} from "@/generated/prisma/enums.js";
import type { DbClient } from "@/lib/db.js";
import { withDbTransaction } from "@/lib/db.js";
import { ApiError } from "@/lib/errors.js";
import { publishRealtimeEvent } from "@/lib/realtime.js";

interface LockedInventoryItem {
  id: string;
  quantityInStock: number;
  quantityReserved: number;
  lowStockThreshold: number;
  name: string;
}

interface ReservationRecord {
  id: string;
  inventoryItemId: string;
  quantity: number;
  requestId: string;
  requestItemId: string;
}

export interface ReserveInventoryInput {
  inventoryItemId: string;
  quantity: number;
  requestId: string;
  requestItemId: string;
  note?: string;
}

export interface InventoryItemSummary {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  quantityInStock: number;
  quantityReserved: number;
  quantityAvailable: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isActive: boolean;
}

export interface InventoryMovementSummary {
  id: string;
  inventoryItemId: string;
  type: string;
  reason: string | null;
  quantityDelta: number;
  note: string | null;
  createdAt: Date;
  requestId: string | null;
  stocktakeSessionId: string | null;
}

function assertPositiveQuantity(quantity: number, label: string) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ApiError(400, `${label} must be a positive integer`);
  }
}

function assertNonNegativeQuantity(quantity: number, label: string) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new ApiError(400, `${label} must be a non-negative integer`);
  }
}

function qualifyTable(tableName: string) {
  const schemaName = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/db")
    .searchParams.get("schema") ?? "public";
  const quotedSchema = schemaName.replaceAll('"', '""');
  const quotedTable = tableName.replaceAll('"', '""');
  return `"${quotedSchema}"."${quotedTable}"`;
}

function toInventoryItemSummary(item: {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  quantityInStock: number;
  quantityReserved: number;
  lowStockThreshold: number;
  isActive: boolean;
}): InventoryItemSummary {
  const quantityAvailable = item.quantityInStock - item.quantityReserved;

  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: item.category,
    unit: item.unit,
    quantityInStock: item.quantityInStock,
    quantityReserved: item.quantityReserved,
    quantityAvailable,
    lowStockThreshold: item.lowStockThreshold,
    isLowStock: quantityAvailable <= item.lowStockThreshold,
    isActive: item.isActive,
  };
}

async function lockInventoryItem(db: DbClient, inventoryItemId: string) {
  const rows = await db.$queryRawUnsafe<LockedInventoryItem[]>(
    `SELECT id, "quantityInStock", "quantityReserved", "lowStockThreshold", name
     FROM ${qualifyTable("inventory_item")}
     WHERE id = $1
     FOR UPDATE`,
    inventoryItemId,
  );

  const item = rows[0];

  if (!item) {
    throw new ApiError(404, `Inventory item ${inventoryItemId} was not found`);
  }

  return item;
}

async function lockActiveReservation(db: DbClient, reservationId: string) {
  const rows = await db.$queryRawUnsafe<ReservationRecord[]>(
    `SELECT id, "inventoryItemId", quantity, "requestId", "requestItemId"
     FROM ${qualifyTable("inventory_reservation")}
     WHERE id = $1
       AND status = $2
     FOR UPDATE`,
    reservationId,
    ReservationStatus.active,
  );

  return rows[0];
}

async function createMovement(
  db: DbClient,
  input: {
    inventoryItemId: string;
    requestId?: string;
    requestItemId?: string;
    reservationId?: string;
    stocktakeSessionId?: string;
    createdByUserId?: string;
    type: InventoryMovementType;
    reason?: InventoryAdjustmentReason;
    quantityDelta: number;
    note?: string;
  },
) {
  return db.inventoryMovement.create({
    data: {
      inventoryItemId: input.inventoryItemId,
      requestId: input.requestId,
      requestItemId: input.requestItemId,
      reservationId: input.reservationId,
      stocktakeSessionId: input.stocktakeSessionId,
      createdByUserId: input.createdByUserId,
      type: input.type,
      reason: input.reason,
      quantityDelta: input.quantityDelta,
      note: input.note,
    },
  });
}

async function emitInventoryUpdate(db: DbClient, inventoryItemId: string) {
  const item = await db.inventoryItem.findUnique({
    where: { id: inventoryItemId },
  });

  if (!item) {
    return;
  }

  publishRealtimeEvent({
    type: item.quantityInStock - item.quantityReserved <= item.lowStockThreshold
      ? "alert.low_stock"
      : "inventory.updated",
    requestId: "",
    occurredAt: new Date().toISOString(),
    data: {
      item: toInventoryItemSummary(item),
    },
  });
}

/**
 * Lists all active inventory items with physical, reserved, and available counts.
 */
export async function listInventoryItems(db?: DbClient) {
  const query = async (client: DbClient) => {
    const items = await client.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return items.map((item) => toInventoryItemSummary(item));
  };

  return db ? query(db) : withDbTransaction(query);
}

/**
 * Lists the append-only inventory movement audit trail.
 */
export async function listInventoryMovements(
  dbOrFilters?: DbClient | { inventoryItemId?: string; requestId?: string; stocktakeSessionId?: string },
  maybeFilters: { inventoryItemId?: string; requestId?: string; stocktakeSessionId?: string } = {},
) {
  const isDbClient = typeof dbOrFilters === "object" && dbOrFilters !== null && "$transaction" in dbOrFilters;
  const filters = isDbClient ? maybeFilters : (dbOrFilters ?? {});

  const query = async (client: DbClient) => {
    const movements = await client.inventoryMovement.findMany({
      where: {
        inventoryItemId: filters.inventoryItemId,
        requestId: filters.requestId,
        stocktakeSessionId: filters.stocktakeSessionId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    return movements as InventoryMovementSummary[];
  };

  if (isDbClient) {
    return query(dbOrFilters as DbClient);
  }

  return withDbTransaction(query);
}

/**
 * Creates a new inventory item.
 */
export async function createInventoryItem(input: {
  sku: string;
  name: string;
  category: "room_service" | "housekeeping" | "maintenance" | "reception";
  unit: string;
  quantityInStock: number;
  lowStockThreshold: number;
}) {
  assertNonNegativeQuantity(input.quantityInStock, "Quantity in stock");
  assertNonNegativeQuantity(input.lowStockThreshold, "Low stock threshold");

  return withDbTransaction(async (db) => {
    const item = await db.inventoryItem.create({
      data: {
        sku: input.sku.trim(),
        name: input.name.trim(),
        category: input.category,
        unit: input.unit.trim(),
        quantityInStock: input.quantityInStock,
        lowStockThreshold: input.lowStockThreshold,
      },
    });

    return toInventoryItemSummary(item);
  });
}

/**
 * Updates mutable inventory metadata and allows activating or deactivating an item.
 */
export async function updateInventoryItem(
  inventoryItemId: string,
  input: {
    name?: string;
    category?: "room_service" | "housekeeping" | "maintenance" | "reception";
    unit?: string;
    lowStockThreshold?: number;
    isActive?: boolean;
  },
) {
  if (input.lowStockThreshold !== undefined) {
    assertNonNegativeQuantity(input.lowStockThreshold, "Low stock threshold");
  }

  return withDbTransaction(async (db) => {
    const item = await db.inventoryItem.update({
      where: { id: inventoryItemId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.unit !== undefined ? { unit: input.unit.trim() } : {}),
        ...(input.lowStockThreshold !== undefined
          ? { lowStockThreshold: input.lowStockThreshold }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    return toInventoryItemSummary(item);
  });
}

/**
 * Applies a positive restock to physical inventory and logs it.
 */
export async function restockInventoryItem(input: {
  inventoryItemId: string;
  quantity: number;
  note?: string;
  createdByUserId?: string;
}) {
  assertPositiveQuantity(input.quantity, "Restock quantity");

  return withDbTransaction(async (db) => {
    const item = await lockInventoryItem(db, input.inventoryItemId);

    await db.inventoryItem.update({
      where: { id: input.inventoryItemId },
      data: {
        quantityInStock: {
          increment: input.quantity,
        },
      },
    });

    await createMovement(db, {
      inventoryItemId: input.inventoryItemId,
      createdByUserId: input.createdByUserId,
      type: InventoryMovementType.restock,
      reason: InventoryAdjustmentReason.restock,
      quantityDelta: input.quantity,
      note: input.note,
    });

    await emitInventoryUpdate(db, input.inventoryItemId);

    return {
      inventoryItemId: item.id,
      quantityAdded: input.quantity,
    };
  });
}

/**
 * Applies a signed manual adjustment to physical inventory and logs it.
 */
export async function adjustInventoryItem(input: {
  inventoryItemId: string;
  quantityDelta: number;
  reason: InventoryAdjustmentReason;
  note?: string;
  createdByUserId?: string;
}) {
  if (!Number.isInteger(input.quantityDelta) || input.quantityDelta === 0) {
    throw new ApiError(400, "Quantity delta must be a non-zero integer");
  }

  return withDbTransaction(async (db) => {
    const item = await lockInventoryItem(db, input.inventoryItemId);
    const nextQuantity = item.quantityInStock + input.quantityDelta;

    if (nextQuantity < item.quantityReserved) {
      throw new ApiError(422, "Adjustment would reduce stock below reserved quantity");
    }

    const updated = await db.inventoryItem.update({
      where: { id: input.inventoryItemId },
      data: {
        quantityInStock: nextQuantity,
      },
    });

    await createMovement(db, {
      inventoryItemId: input.inventoryItemId,
      createdByUserId: input.createdByUserId,
      type: InventoryMovementType.adjustment,
      reason: input.reason,
      quantityDelta: input.quantityDelta,
      note: input.note,
    });

    await emitInventoryUpdate(db, input.inventoryItemId);

    return toInventoryItemSummary(updated);
  });
}

export interface AvailabilityLine {
  inventoryItemId: string;
  name: string;
  requestedQuantity: number;
  availableQuantity: number;
}

/**
 * Reports what fraction of each requested line we could currently satisfy,
 * without touching inventory. Used by the guest-side confirm flow so we can
 * offer a partial order when some items are short.
 */
export async function checkInventoryAvailability(
  inputs: Array<{ inventoryItemId: string; quantity: number }>,
  db?: DbClient,
): Promise<AvailabilityLine[]> {
  if (inputs.length === 0) return [];

  const run = async (client: DbClient) => {
    const items = await client.inventoryItem.findMany({
      where: { id: { in: inputs.map((input) => input.inventoryItemId) } },
    });
    const byId = new Map(items.map((item) => [item.id, item]));

    return inputs.map((input) => {
      const item = byId.get(input.inventoryItemId);
      const availableQuantity = item
        ? Math.max(0, item.quantityInStock - item.quantityReserved)
        : 0;
      return {
        inventoryItemId: input.inventoryItemId,
        name: item?.name ?? "",
        requestedQuantity: input.quantity,
        availableQuantity,
      };
    });
  };

  return db ? run(db) : withDbTransaction(run);
}

/**
 * Reserves inventory atomically for a newly created guest request.
 */
export async function reserveInventory(
  db: DbClient,
  inputs: ReserveInventoryInput[],
) {
  for (const input of inputs) {
    assertPositiveQuantity(input.quantity, "Reservation quantity");
  }

  const sortedInputs = [...inputs].sort((left, right) =>
    left.inventoryItemId.localeCompare(right.inventoryItemId),
  );

  const lockedItems = new Map<string, LockedInventoryItem>();

  for (const input of sortedInputs) {
    lockedItems.set(input.inventoryItemId, await lockInventoryItem(db, input.inventoryItemId));
  }

  for (const input of sortedInputs) {
    const item = lockedItems.get(input.inventoryItemId)!;
    const quantityAvailable = item.quantityInStock - item.quantityReserved;

    if (quantityAvailable < input.quantity) {
      throw new ApiError(
        422,
        `Out of stock: only ${quantityAvailable} ${item.name.toLowerCase()} available, but ${input.quantity} were requested`,
      );
    }
  }

  const results: Array<{
    inventoryItemId: string;
    requestedQuantity: number;
    reservedQuantity: number;
    unavailableQuantity: number;
    reservationId: string;
  }> = [];

  for (const input of sortedInputs) {
    await db.inventoryItem.update({
      where: { id: input.inventoryItemId },
      data: {
        quantityReserved: {
          increment: input.quantity,
        },
      },
    });

    const reservation = await db.inventoryReservation.create({
      data: {
        requestId: input.requestId,
        requestItemId: input.requestItemId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
      },
    });

    await db.guestRequestItem.update({
      where: { id: input.requestItemId },
      data: {
        reservedQuantity: {
          increment: input.quantity,
        },
      },
    });

    await createMovement(db, {
      inventoryItemId: input.inventoryItemId,
      requestId: input.requestId,
      requestItemId: input.requestItemId,
      reservationId: reservation.id,
      type: InventoryMovementType.reserve,
      quantityDelta: 0,
      note: input.note,
    });

    results.push({
      inventoryItemId: input.inventoryItemId,
      requestedQuantity: input.quantity,
      reservedQuantity: input.quantity,
      unavailableQuantity: 0,
      reservationId: reservation.id,
    });

    await emitInventoryUpdate(db, input.inventoryItemId);
  }

  return results;
}

/**
 * Releases active reservations atomically without decrementing physical stock.
 */
export async function releaseReservations(
  db: DbClient,
  reservationIds: string[],
  note?: string,
) {
  const results: Array<{
    inventoryItemId: string;
    releasedQuantity: number;
    reservationId: string;
  }> = [];

  for (const reservationId of reservationIds.sort()) {
    const reservation = await lockActiveReservation(db, reservationId);

    if (!reservation) {
      continue;
    }

    await lockInventoryItem(db, reservation.inventoryItemId);

    await db.inventoryItem.update({
      where: { id: reservation.inventoryItemId },
      data: {
        quantityReserved: {
          decrement: reservation.quantity,
        },
      },
    });

    await db.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.released },
    });

    await db.guestRequestItem.update({
      where: { id: reservation.requestItemId },
      data: {
        reservedQuantity: {
          decrement: reservation.quantity,
        },
        unavailableQuantity: {
          increment: reservation.quantity,
        },
      },
    });

    await createMovement(db, {
      inventoryItemId: reservation.inventoryItemId,
      requestId: reservation.requestId,
      requestItemId: reservation.requestItemId,
      reservationId: reservation.id,
      type: InventoryMovementType.release,
      quantityDelta: 0,
      note,
    });

    results.push({
      inventoryItemId: reservation.inventoryItemId,
      releasedQuantity: reservation.quantity,
      reservationId: reservation.id,
    });

    await emitInventoryUpdate(db, reservation.inventoryItemId);
  }

  return results;
}

/**
 * Finalizes reservations by decrementing physical stock for delivered units and releasing any remainder.
 */
export async function finalizeReservations(
  db: DbClient,
  inputs: Array<{ reservationId: string; deliveredQuantity?: number }>,
  note?: string,
) {
  const results: Array<{
    inventoryItemId: string;
    deliveredQuantity: number;
    reservationId: string;
  }> = [];

  for (const input of inputs.sort((left, right) => left.reservationId.localeCompare(right.reservationId))) {
    const reservation = await lockActiveReservation(db, input.reservationId);

    if (!reservation) {
      continue;
    }

    const deliveredQuantity = input.deliveredQuantity ?? reservation.quantity;
    assertNonNegativeQuantity(deliveredQuantity, "Delivered quantity");

    if (deliveredQuantity > reservation.quantity) {
      throw new ApiError(422, "Delivered quantity cannot exceed reserved quantity");
    }

    await lockInventoryItem(db, reservation.inventoryItemId);

    const quantityToRelease = reservation.quantity - deliveredQuantity;

    await db.inventoryItem.update({
      where: { id: reservation.inventoryItemId },
      data: {
        quantityReserved: {
          decrement: reservation.quantity,
        },
        quantityInStock: {
          decrement: deliveredQuantity,
        },
      },
    });

    await db.inventoryReservation.update({
      where: { id: reservation.id },
      data: {
        status: ReservationStatus.finalized,
        quantity: deliveredQuantity,
      },
    });

    await db.guestRequestItem.update({
      where: { id: reservation.requestItemId },
      data: {
        deliveredQuantity: {
          increment: deliveredQuantity,
        },
        reservedQuantity: {
          decrement: reservation.quantity,
        },
        unavailableQuantity: {
          increment: quantityToRelease,
        },
      },
    });

    if (quantityToRelease > 0) {
      await createMovement(db, {
        inventoryItemId: reservation.inventoryItemId,
        requestId: reservation.requestId,
        requestItemId: reservation.requestItemId,
        reservationId: reservation.id,
        type: InventoryMovementType.release,
        quantityDelta: 0,
        note,
      });
    }

    await createMovement(db, {
      inventoryItemId: reservation.inventoryItemId,
      requestId: reservation.requestId,
      requestItemId: reservation.requestItemId,
      reservationId: reservation.id,
      type: InventoryMovementType.deliver,
      quantityDelta: -deliveredQuantity,
      note,
    });

    results.push({
      inventoryItemId: reservation.inventoryItemId,
      deliveredQuantity,
      reservationId: reservation.id,
    });

    await emitInventoryUpdate(db, reservation.inventoryItemId);
  }

  return results;
}
