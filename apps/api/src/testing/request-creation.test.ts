import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "@/app.js";
import { prisma } from "@/lib/prisma.js";

const app = createApp();

async function createGuestSession(roomCode: string, deviceFingerprint: string) {
  const response = await app.request("http://localhost/guest/device-sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      roomCode,
      deviceFingerprint,
      deviceName: "Tablet",
    }),
  });

  assert.equal(response.status, 201);

  return response.json();
}

test("valid room session can create a fully reserved request", async () => {
  const room = await prisma.room.findUnique({ where: { number: "101" } });
  const towel = await prisma.inventoryItem.findUnique({ where: { sku: "INV-001" } });
  assert.ok(room);
  assert.ok(towel);

  const session = await createGuestSession(room.code, `tablet-${Date.now()}-1`);

  const response = await app.request("http://localhost/guest/requests", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-room-session-token": session.token,
    },
    body: JSON.stringify({
      source: "text",
      rawText: "Need two bath towels",
      items: [{ inventoryItemId: towel.id, quantity: 2 }],
    }),
  });

  assert.equal(response.status, 201);

  const payload = await response.json();
  assert.equal(payload.status, "received");
  assert.equal(payload.items[0]?.reservedQuantity, 2);
});

test("request is rejected with 422 when stock is insufficient", async () => {
  const room = await prisma.room.findUnique({ where: { number: "102" } });
  assert.ok(room);

  const session = await createGuestSession(room.code, `tablet-${Date.now()}-2`);

  const item = await prisma.inventoryItem.create({
    data: {
      sku: `INV-ZERO-${Date.now()}`,
      name: "Rare Item",
      category: "room_service",
      unit: "piece",
      quantityInStock: 0,
      lowStockThreshold: 0,
    },
  });

  const response = await app.request("http://localhost/guest/requests", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-room-session-token": session.token,
    },
    body: JSON.stringify({
      source: "text",
      rawText: "Need rare item",
      items: [{ inventoryItemId: item.id, quantity: 1 }],
    }),
  });

  assert.equal(response.status, 422);

  const payload = await response.json();
  assert.match(payload.error, /Out of stock/);
});

test.after(async () => {
  await prisma.$disconnect();
});
