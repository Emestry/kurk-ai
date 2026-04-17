import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { adminMiddleware } from "@/middlewares/auth.js";
import type { HonoEnv } from "@/lib/types.js";
import { jsonError } from "@/lib/http.js";
import { requireCuid, requireStoredText } from "@/lib/input.js";
import { publishRealtimeEvent } from "@/lib/realtime.js";
import {
  createRoomDevice,
  issueRoomPairingCode,
  listRoomsWithDevices,
  revokeRoomPairingCode,
  revokeRoomDeviceSession,
  updateRoom,
  updateRoomDevice,
} from "@/services/room-service.js";

interface AdminRouteOptions {
  auth?: MiddlewareHandler<HonoEnv>;
}

interface UpdateRoomBody {
  number?: string;
  code?: string;
  accessToken?: string;
  isActive?: boolean;
}

interface CreateRoomDeviceBody {
  name?: string;
  deviceFingerprint?: string;
  isActive?: boolean;
}

interface UpdateRoomDeviceBody {
  name?: string;
  isActive?: boolean;
}

/**
 * Builds the authenticated admin route group for room and tablet management.
 *
 * @param options - Optional auth middleware override, primarily for tests.
 * @returns A Hono router mounted under `/admin`.
 */
export function createAdminRoutes(options: AdminRouteOptions = {}) {
  const admin = new Hono<HonoEnv>();
  const requireAdminAuth = options.auth ?? adminMiddleware;

  admin.use("/*", requireAdminAuth);

  admin.get("/rooms", async (c) => {
    const rooms = await listRoomsWithDevices();
    return c.json({ rooms });
  });

  admin.post("/rooms/:roomId/pairing-code", async (c) => {
    const pairing = await issueRoomPairingCode(requireCuid(c.req.param("roomId"), "Room id"));
    return c.json(pairing, 201);
  });

  admin.delete("/rooms/:roomId/pairing-code", async (c) => {
    const pairing = await revokeRoomPairingCode(requireCuid(c.req.param("roomId"), "Room id"));
    return c.json(pairing);
  });

  admin.patch("/rooms/:roomId", async (c) => {
    const body = await c.req.json<UpdateRoomBody>();
    const room = await updateRoom(requireCuid(c.req.param("roomId"), "Room id"), {
      number: body.number === undefined ? undefined : requireStoredText(body.number, "Room number"),
      code: body.code === undefined ? undefined : requireStoredText(body.code, "Room code"),
      accessToken:
        body.accessToken === undefined
          ? undefined
          : requireStoredText(body.accessToken, "Room access token"),
      isActive: body.isActive,
    });
    return c.json({ room });
  });

  admin.post("/rooms/:roomId/devices", async (c) => {
    const body = await c.req.json<CreateRoomDeviceBody>();

    if (!body.name?.trim() || !body.deviceFingerprint?.trim()) {
      return jsonError(c, 400, "Device name and fingerprint are required");
    }

    const device = await createRoomDevice(requireCuid(c.req.param("roomId"), "Room id"), {
      name: requireStoredText(body.name, "Device name"),
      deviceFingerprint: requireStoredText(body.deviceFingerprint, "Device fingerprint"),
      isActive: body.isActive,
    });

    return c.json({ device }, 201);
  });

  admin.patch("/rooms/:roomId/devices/:deviceId", async (c) => {
    const body = await c.req.json<UpdateRoomDeviceBody>();
    const device = await updateRoomDevice(
      requireCuid(c.req.param("roomId"), "Room id"),
      requireCuid(c.req.param("deviceId"), "Device id"),
      {
        name:
          body.name === undefined
            ? undefined
            : requireStoredText(body.name, "Device name"),
        isActive: body.isActive,
      },
    );

    return c.json({ device });
  });

  admin.post("/rooms/:roomId/reset-history", async (c) => {
    const roomId = requireCuid(c.req.param("roomId"), "Room id");
    const occurredAt = new Date().toISOString();
    publishRealtimeEvent({
      type: "room.history.reset",
      requestId: "",
      roomId,
      occurredAt,
      data: { roomId, hiddenBefore: occurredAt },
    });
    return c.json({ roomId, hiddenBefore: occurredAt });
  });

  admin.post("/device-sessions/:sessionId/revoke", async (c) => {
    const session = await revokeRoomDeviceSession(
      requireCuid(c.req.param("sessionId"), "Session id"),
    );
    return c.json({
      sessionId: session.id,
      revokedAt: session.revokedAt,
      roomId: session.roomId,
      roomDeviceId: session.roomDeviceId,
    });
  });

  admin.get("/device-sessions", async (c) => {
    const rooms = await listRoomsWithDevices();

    return c.json({
      sessions: rooms.flatMap((room) =>
        room.devices.flatMap((device) =>
          device.sessions.map((session) => ({
            sessionId: session.id,
            roomId: room.id,
            roomNumber: room.number,
            deviceId: device.id,
            deviceName: device.name,
            expiresAt: session.expiresAt,
            revokedAt: session.revokedAt,
          })),
        ),
      ),
    });
  });

  return admin;
}
