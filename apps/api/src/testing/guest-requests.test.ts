import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "@/app.js";
import { prisma } from "@/lib/prisma.js";

const app = createApp();

async function createGuestSession(roomNumber: string) {
  const pairingCode = "123456";
  const room = await prisma.room.update({
    where: { number: roomNumber },
    data: {
      pairingCode,
      pairingCodeExpiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });

  const response = await app.request("http://localhost/guest/device-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomCode: room.code,
      pairingCode,
      deviceFingerprint: `tablet-${roomNumber}-${Date.now()}`,
    }),
  });

  assert.equal(response.status, 201);
  return response.json();
}

test("guest current and history endpoints return room-scoped data", async () => {
  const towel = await prisma.inventoryItem.findUniqueOrThrow({ where: { sku: "INV-001" } });
  const session = await createGuestSession("201");

  for (const rawText of ["First request", "Second request"]) {
    const response = await app.request("http://localhost/guest/requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-room-session-token": session.token,
      },
      body: JSON.stringify({
        source: "text",
        rawText,
        items: [{ inventoryItemId: towel.id, quantity: 1 }],
      }),
    });

    assert.equal(response.status, 201);
  }

  const current = await app.request("http://localhost/guest/requests/current", {
    headers: {
      "x-room-session-token": session.token,
    },
  });
  assert.equal(current.status, 200);
  const currentPayload = await current.json();
  assert.equal(currentPayload.roomNumber, "201");
  assert.ok(currentPayload.request);

  const history = await app.request("http://localhost/guest/requests/history?limit=2", {
    headers: {
      "x-room-session-token": session.token,
    },
  });
  assert.equal(history.status, 200);
  const historyPayload = await history.json();
  assert.equal(historyPayload.requests.length, 2);
  assert.equal(historyPayload.requests[0]?.roomNumber, "201");
});

test("guest parse request returns towel clarification for estonian generic towel", async () => {
  const response = await app.request("http://localhost/guest/parse-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rawText: "Ma tahan rätikut",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.items.length, 0);
  assert.equal(payload.category, "housekeeping");
  assert.equal(payload.clarification?.prompt, "Which towel would you like?");
  assert.equal(payload.clarification?.options.length, 2);
  assert.deepEqual(
    payload.clarification?.options.map((item: { name: string }) => item.name).sort(),
    ["Bath Towel", "Hand Towel"],
  );
});

test.after(async () => {
  await prisma.$disconnect();
});
