import { createMiddleware } from "hono/factory";
import { jsonError } from "@/lib/http.js";
import type { HonoEnv } from "@/lib/types.js";
import { getActiveRoomDeviceSession } from "@/services/room-service.js";

export const roomDeviceAuthMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const token =
    c.req.header("x-room-session-token")?.trim() ??
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();

  const session = await getActiveRoomDeviceSession(token);

  if (!session) {
    return jsonError(c, 401, "Unauthorized");
  }

  c.set("roomDeviceSession", {
    id: session.id,
    roomId: session.roomId,
    roomDeviceId: session.roomDeviceId,
    token: session.token,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
  });

  return next();
});
