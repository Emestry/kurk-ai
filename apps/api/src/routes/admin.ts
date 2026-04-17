import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { adminMiddleware } from "@/middlewares/auth.js";
import type { HonoEnv } from "@/lib/types.js";
import { jsonError } from "@/lib/http.js";
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

export function createAdminRoutes(options: AdminRouteOptions = {}) {
  const admin = new Hono<HonoEnv>();
  const requireAdminAuth = options.auth ?? adminMiddleware;

  admin.use("/*", requireAdminAuth);

  admin.get("/rooms", async (c) => {
    const rooms = await listRoomsWithDevices();
    return c.json({ rooms });
  });

  admin.post("/rooms/:roomId/pairing-code", async (c) => {
    const pairing = await issueRoomPairingCode(c.req.param("roomId"));
    return c.json(pairing, 201);
  });

  admin.delete("/rooms/:roomId/pairing-code", async (c) => {
    const pairing = await revokeRoomPairingCode(c.req.param("roomId"));
    return c.json(pairing);
  });

  admin.patch("/rooms/:roomId", async (c) => {
    const body = await c.req.json<UpdateRoomBody>();
    const room = await updateRoom(c.req.param("roomId"), body);
    return c.json({ room });
  });

  admin.post("/rooms/:roomId/devices", async (c) => {
    const body = await c.req.json<CreateRoomDeviceBody>();

    if (!body.name?.trim() || !body.deviceFingerprint?.trim()) {
      return jsonError(c, 400, "Device name and fingerprint are required");
    }

    const device = await createRoomDevice(c.req.param("roomId"), {
      name: body.name.trim(),
      deviceFingerprint: body.deviceFingerprint.trim(),
      isActive: body.isActive,
    });

    return c.json({ device }, 201);
  });

  admin.patch("/rooms/:roomId/devices/:deviceId", async (c) => {
    const body = await c.req.json<UpdateRoomDeviceBody>();
    const device = await updateRoomDevice(
      c.req.param("roomId"),
      c.req.param("deviceId"),
      body,
    );

    return c.json({ device });
  });

  admin.post("/rooms/:roomId/reset-history", async (c) => {
    const roomId = c.req.param("roomId");
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
    const session = await revokeRoomDeviceSession(c.req.param("sessionId"));
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
