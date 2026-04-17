import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";
import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "@/lib/types.js";
import { createApp } from "@/app.js";
import { prisma } from "@/lib/prisma.js";
import { createGuestRequest, updateStaffRequest } from "@/services/request-service.js";

const fakeStaffAuth = createMiddleware<HonoEnv>(async (c, next) => {
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

const app = createApp({ staffAuthMiddleware: fakeStaffAuth });

test("monthly report includes delivered usage and reconciliation summary", async () => {
  const room = await prisma.room.findUniqueOrThrow({ where: { number: "202" } });
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { sku: "INV-008" } });

  const created = await createGuestRequest({
    roomCode: room.code,
    source: "text",
    rawText: "Two bottled waters",
    items: [{ inventoryItemId: item.id, quantity: 2 }],
  });

  await updateStaffRequest({
    requestId: created.requestId,
    status: "in_progress",
  });

  await updateStaffRequest({
    requestId: created.requestId,
    status: "delivered",
    items: [{ requestItemId: created.items[0]!.requestItemId, deliveredQuantity: 2 }],
  });

  const stocktake = await app.request("http://localhost/staff/stocktakes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note: "Monthly count" }),
  });
  assert.equal(stocktake.status, 201);
  const createdStocktake = await stocktake.json();
  const stocktakeLines = createdStocktake.lines as Array<{
    inventoryItemId: string;
    expectedQuantity: number;
  }>;

  const lines = await app.request(`http://localhost/staff/stocktakes/${createdStocktake.id}/lines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lines: stocktakeLines.map((line) =>
        line.inventoryItemId === item.id
          ? {
              inventoryItemId: line.inventoryItemId,
              physicalCount: line.expectedQuantity - 1,
              reason: "miscounted",
            }
          : {
              inventoryItemId: line.inventoryItemId,
              physicalCount: line.expectedQuantity,
            },
      ),
    }),
  });
  assert.equal(lines.status, 200);

  const finalize = await app.request(`http://localhost/staff/stocktakes/${createdStocktake.id}/finalize`, {
    method: "POST",
  });
  assert.equal(finalize.status, 200);

  const month = new Date().toISOString().slice(0, 7);
  const reportResponse = await app.request(`http://localhost/staff/reports/monthly?month=${month}`);
  assert.equal(reportResponse.status, 200);

  const report = await reportResponse.json();
  assert.ok(report.totalRequests >= 1);
  assert.ok(report.reconciliations.length >= 1);
  assert.equal(typeof report.averageResponseTimeSeconds, "number");
  assert.ok(report.averageResponseTimeSeconds >= 0);
});

test("stocktake rejects discrepancies without reasons", async () => {
  const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { sku: "INV-001" } });
  const createResponse = await app.request("http://localhost/staff/stocktakes", {
    method: "POST",
  });
  const session = await createResponse.json();

  const lines = await app.request(`http://localhost/staff/stocktakes/${session.id}/lines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lines: [
        {
          inventoryItemId: item.id,
          physicalCount: item.quantityInStock - 1,
        },
      ],
    }),
  });

  assert.equal(lines.status, 422);
});

test.after(async () => {
  await prisma.$disconnect();
});
