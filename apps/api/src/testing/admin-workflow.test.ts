import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";
import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "@/lib/types.js";
import { createApp } from "@/app.js";
import { prisma } from "@/lib/prisma.js";

const fakeAdminAuth = createMiddleware<HonoEnv>(async (c, next) => {
  c.set("user", {
    id: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    image: null,
    role: "admin",
  });
  c.set("session", {
    id: "admin-session",
    userId: "admin-user",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "admin-session-token",
    ipAddress: null,
    userAgent: null,
  });
  await next();
});

const protectedApp = createApp({ adminAuthMiddleware: fakeAdminAuth });
const app = createApp();

async function createRoomSession() {
  const room = await prisma.room.findUniqueOrThrow({ where: { number: "201" } });

  const response = await app.request("http://localhost/guest/device-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomCode: room.code,
      deviceFingerprint: `tablet-admin-${Date.now()}`,
      deviceName: "Admin Test Tablet",
    }),
  });

  assert.equal(response.status, 201);
  return response.json();
}

test("admin can manage rooms, devices, and revoke room sessions", async () => {
  const room = await prisma.room.findUniqueOrThrow({ where: { number: "201" } });
  const towel = await prisma.inventoryItem.findUniqueOrThrow({ where: { sku: "INV-001" } });

  const listResponse = await protectedApp.request("http://localhost/admin/rooms");
  assert.equal(listResponse.status, 200);

  const createdDeviceResponse = await protectedApp.request(
    `http://localhost/admin/rooms/${room.id}/devices`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Hallway Backup Tablet",
        deviceFingerprint: `backup-${Date.now()}`,
      }),
    },
  );

  assert.equal(createdDeviceResponse.status, 201);
  const createdDevicePayload = await createdDeviceResponse.json();
  assert.equal(createdDevicePayload.device.name, "Hallway Backup Tablet");

  const updatedRoomResponse = await protectedApp.request(
    `http://localhost/admin/rooms/${room.id}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        isActive: true,
        code: room.code,
        accessToken: room.accessToken,
      }),
    },
  );

  assert.equal(updatedRoomResponse.status, 200);

  const updatedDeviceResponse = await protectedApp.request(
    `http://localhost/admin/rooms/${room.id}/devices/${createdDevicePayload.device.id}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        isActive: false,
      }),
    },
  );

  assert.equal(updatedDeviceResponse.status, 200);
  const updatedDevicePayload = await updatedDeviceResponse.json();
  assert.equal(updatedDevicePayload.device.isActive, false);

  const session = await createRoomSession();

  const requestResponse = await app.request("http://localhost/guest/requests", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-room-session-token": session.token,
    },
    body: JSON.stringify({
      source: "text",
      rawText: "Please send a towel",
      items: [{ inventoryItemId: towel.id, quantity: 1 }],
    }),
  });

  assert.equal(requestResponse.status, 201);
  const requestPayload = await requestResponse.json();

  const sessionsResponse = await protectedApp.request("http://localhost/admin/device-sessions");
  assert.equal(sessionsResponse.status, 200);
  const sessionsPayload = await sessionsResponse.json();
  const listedSession = sessionsPayload.sessions.find(
    (entry: { sessionId: string }) => entry.sessionId === session.sessionId,
  );

  assert.ok(listedSession);

  const revokeResponse = await protectedApp.request(
    `http://localhost/admin/device-sessions/${session.sessionId}/revoke`,
    {
      method: "POST",
    },
  );

  assert.equal(revokeResponse.status, 200);

  const revokedRequest = await prisma.guestRequest.findUniqueOrThrow({
    where: { id: requestPayload.requestId },
  });

  assert.equal(revokedRequest.status, "rejected");
  assert.equal(
    revokedRequest.rejectionReason,
    "Room session was revoked before the request was completed.",
  );

  const currentResponse = await app.request("http://localhost/guest/requests/current", {
    headers: {
      "x-room-session-token": session.token,
    },
  });

  assert.equal(currentResponse.status, 401);
});

test("admin can disable an issued room pairing code", async () => {
  const room = await prisma.room.findUniqueOrThrow({ where: { number: "201" } });

  const issueResponse = await protectedApp.request(
    `http://localhost/admin/rooms/${room.id}/pairing-code`,
    { method: "POST" },
  );

  assert.equal(issueResponse.status, 201);
  const issuePayload = await issueResponse.json();
  assert.match(issuePayload.pairingCode, /^\d{6}$/);

  const revokeResponse = await protectedApp.request(
    `http://localhost/admin/rooms/${room.id}/pairing-code`,
    { method: "DELETE" },
  );

  assert.equal(revokeResponse.status, 200);

  const updatedRoom = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
  assert.equal(updatedRoom.pairingCode, null);
  assert.equal(updatedRoom.pairingCodeExpiresAt, null);

  const sessionResponse = await app.request("http://localhost/guest/device-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomCode: room.code,
      pairingCode: issuePayload.pairingCode,
      deviceFingerprint: `tablet-disabled-code-${Date.now()}`,
      deviceName: "Disabled Code Tablet",
    }),
  });

  assert.equal(sessionResponse.status, 401);
});

test.after(async () => {
  await prisma.$disconnect();
});
