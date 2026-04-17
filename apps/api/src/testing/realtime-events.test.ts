import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";
import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "@/lib/types.js";
import { createApp } from "@/app.js";
import { publishRealtimeEvent, subscribeToRealtimeEvents } from "@/lib/realtime.js";
import { prisma } from "@/lib/prisma.js";
import { createGuestRequest, updateStaffRequest } from "@/services/request-service.js";

const fakeStaffAuth = createMiddleware<HonoEnv>(async (c, next) => {
  c.set("user", {
    id: "staff-user",
    email: "staff@example.com",
    name: "Staff User",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
    role: "staff",
  });
  c.set("session", {
    id: "staff-session",
    userId: "staff-user",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "staff-session-token",
    ipAddress: null,
    userAgent: null,
  });
  await next();
});

const protectedApp = createApp({ staffAuthMiddleware: fakeStaffAuth });
const app = createApp();

async function readChunk(response: Response) {
  assert.ok(response.body);
  const reader = response.body.getReader();
  const chunk = await reader.read();
  reader.releaseLock();
  return new TextDecoder().decode(chunk.value);
}

test("event bus filters room-scoped listeners", async () => {
  const received: string[] = [];
  const unsubscribe = subscribeToRealtimeEvents(
    (event) => event.roomId === "room-1",
    (event) => {
      received.push(event.requestId ?? "");
    },
  );

  publishRealtimeEvent({
    type: "request.created",
    requestId: "request-1",
    roomId: "room-1",
    occurredAt: new Date().toISOString(),
    data: {},
  });
  publishRealtimeEvent({
    type: "request.created",
    requestId: "request-2",
    roomId: "room-2",
    occurredAt: new Date().toISOString(),
    data: {},
  });

  unsubscribe();
  assert.deepEqual(received, ["request-1"]);
});

test("guest and staff realtime endpoints connect", async () => {
  const room = await prisma.room.findUniqueOrThrow({ where: { number: "101" } });
  const sessionResponse = await app.request("http://localhost/guest/device-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomCode: room.code,
      deviceFingerprint: `tablet-101-${Date.now()}`,
    }),
  });
  const session = await sessionResponse.json();

  const guestResponse = await app.request("http://localhost/guest/events", {
    headers: {
      "x-room-session-token": session.token,
    },
  });
  assert.equal(guestResponse.status, 200);
  assert.match(await readChunk(guestResponse), /event: connected/);

  const staffResponse = await protectedApp.request("http://localhost/staff/events");
  assert.equal(staffResponse.status, 200);
  assert.match(await readChunk(staffResponse), /event: connected/);
});

test("request creation and status changes publish realtime events", async () => {
  const room = await prisma.room.findUniqueOrThrow({ where: { number: "102" } });
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { sku: "INV-001" } });

  const received: string[] = [];
  const unsubscribe = subscribeToRealtimeEvents(
    (event) => event.roomId === room.id,
    (event) => {
      received.push(event.type);
    },
  );

  const created = await createGuestRequest({
    roomCode: room.code,
    source: "text",
    rawText: "Need one towel",
    items: [{ inventoryItemId: item.id, quantity: 1 }],
  });

  await updateStaffRequest({
    requestId: created.requestId,
    status: "in_progress",
  });

  await updateStaffRequest({
    requestId: created.requestId,
    status: "delivered",
    items: [{ requestItemId: created.items[0]!.requestItemId, deliveredQuantity: 1 }],
  });

  unsubscribe();

  assert.ok(received.includes("request.created"));
  assert.ok(received.includes("request.updated"));
  assert.ok(received.includes("request.delivered"));
});

test.after(async () => {
  await prisma.$disconnect();
});
