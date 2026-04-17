import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";
import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "@/lib/types.js";
import { createApp } from "@/app.js";
import { prisma } from "@/lib/prisma.js";

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

async function createGuestRequest() {
  const room = await prisma.room.findUniqueOrThrow({ where: { number: "301" } });
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { sku: "INV-008" } });

  const sessionResponse = await app.request("http://localhost/guest/device-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomCode: room.code,
      deviceFingerprint: `tablet-301-${Date.now()}`,
    }),
  });

  const session = await sessionResponse.json();

  const response = await app.request("http://localhost/guest/requests", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-room-session-token": session.token,
    },
    body: JSON.stringify({
      source: "text",
      rawText: "One bottled water",
      items: [{ inventoryItemId: item.id, quantity: 1 }],
    }),
  });

  assert.equal(response.status, 201);
  return response.json();
}

test("staff auth is required", async () => {
  const response = await app.request("http://localhost/staff/requests");
  assert.equal(response.status, 401);
});

test("staff can progress and deliver a request", async () => {
  const created = await createGuestRequest();

  const listResponse = await protectedApp.request("http://localhost/staff/requests");
  assert.equal(listResponse.status, 200);

  const requestsPayload = await listResponse.json();
  const listed = requestsPayload.requests.find(
    (entry: { requestId: string }) => entry.requestId === created.requestId,
  );

  assert.ok(listed);

  const inProgress = await protectedApp.request(
    `http://localhost/staff/requests/${created.requestId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "in_progress",
        etaMinutes: 10,
        staffNote: "On the way",
      }),
    },
  );

  assert.equal(inProgress.status, 200);

  const requestItemId = created.items[0]?.requestItemId;
  assert.ok(requestItemId);

  const delivered = await protectedApp.request(
    `http://localhost/staff/requests/${created.requestId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "delivered",
        items: [{ requestItemId, deliveredQuantity: 1 }],
      }),
    },
  );

  assert.equal(delivered.status, 200);

  const payload = await delivered.json();
  assert.equal(payload.status, "delivered");
});

test.after(async () => {
  await prisma.$disconnect();
});
