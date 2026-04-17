import { createMiddleware } from "hono/factory";
import { auth } from "../lib/auth.js";
import { jsonError } from "../lib/http.js";
import type { HonoEnv } from "../lib/types.js";

export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) return jsonError(c, 401, "Unauthorized");

  c.set("user", session.user as typeof session.user & { role?: "admin" | "staff" });
  c.set("session", session.session);

  return next();
});

export const adminMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return jsonError(c, 401, "Unauthorized");
  }

  const user = session.user as typeof session.user & { role?: "admin" | "staff" };

  if (user.role !== "admin") {
    return jsonError(c, 403, "Forbidden");
  }

  c.set("user", user);
  c.set("session", session.session);

  return next();
});
