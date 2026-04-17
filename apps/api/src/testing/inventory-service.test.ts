import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { prisma } from "@/lib/prisma.js";
import { withDbTransaction } from "@/lib/db.js";
import {
  adjustInventoryItem,
  createInventoryItem,
  finalizeReservations,
  listInventoryItems,
  listInventoryMovements,
  releaseReservations,
  reserveInventory,
} from "@/services/inventory-service.js";

async function createRequestWithItem(inventoryItemId: string, quantity: number) {
  const room = await prisma.room.findUnique({ where: { number: "101" } });
  assert.ok(room);

  return prisma.guestRequest.create({
    data: {
      roomId: room.id,
      source: "text",
      rawText: `Inventory test ${randomUUID()}`,
      items: {
        create: {
          inventoryItemId,
          requestedQuantity: quantity,
        },
      },
    },
    include: {
      items: true,
    },
  });
}

test("reserve, release, and finalize maintain stock and reservation counts", async () => {
  const item = await createInventoryItem({
    sku: `INV-TEST-${randomUUID()}`,
    name: "Inventory Test Item",
    category: "room_service",
    unit: "piece",
    quantityInStock: 5,
    lowStockThreshold: 1,
  });

  const request = await createRequestWithItem(item.id, 2);

  const reserved = await withDbTransaction((db) =>
    reserveInventory(db, [
      {
        inventoryItemId: item.id,
        quantity: 2,
        requestId: request.id,
        requestItemId: request.items[0]!.id,
      },
    ]),
  );

  assert.equal(reserved[0]?.reservedQuantity, 2);

  let refreshed = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(refreshed.quantityInStock, 5);
  assert.equal(refreshed.quantityReserved, 2);

  await withDbTransaction((db) =>
    releaseReservations(db, [reserved[0]!.reservationId], "release test"),
  );

  refreshed = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(refreshed.quantityInStock, 5);
  assert.equal(refreshed.quantityReserved, 0);

  const secondRequest = await createRequestWithItem(item.id, 2);
  const secondReserved = await withDbTransaction((db) =>
    reserveInventory(db, [
      {
        inventoryItemId: item.id,
        quantity: 2,
        requestId: secondRequest.id,
        requestItemId: secondRequest.items[0]!.id,
      },
    ]),
  );

  await withDbTransaction((db) =>
    finalizeReservations(
      db,
      [{ reservationId: secondReserved[0]!.reservationId, deliveredQuantity: 1 }],
      "deliver test",
    ),
  );

  refreshed = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(refreshed.quantityInStock, 4);
  assert.equal(refreshed.quantityReserved, 0);
});

test("inventory list and movements expose professional stock information", async () => {
  const item = await createInventoryItem({
    sku: `INV-TEST-${randomUUID()}`,
    name: "Adjustment Test Item",
    category: "housekeeping",
    unit: "piece",
    quantityInStock: 4,
    lowStockThreshold: 1,
  });

  const adjusted = await adjustInventoryItem({
    inventoryItemId: item.id,
    quantityDelta: -1,
    reason: "damaged",
    note: "Broken during handling",
  });

  assert.equal(adjusted.quantityInStock, 3);
  assert.equal(adjusted.quantityAvailable, 3);

  const items = await listInventoryItems();
  const listed = items.find((entry) => entry.id === item.id);
  assert.ok(listed);
  assert.equal(listed.quantityAvailable, 3);

  const movements = await listInventoryMovements({ inventoryItemId: item.id });
  assert.ok(movements.some((movement) => movement.reason === "damaged"));
});

test.after(async () => {
  await prisma.$disconnect();
});
