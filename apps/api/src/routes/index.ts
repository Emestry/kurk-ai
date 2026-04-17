import type { Hono } from "hono";
import { createAdminRoutes } from "@/routes/admin.js";
import { authRoutes } from "@/routes/auth.js";
import { guest } from "@/routes/guest.js";
import { health } from "@/routes/health.js";
import { createStaffRoutes } from "@/routes/staff.js";
import type { HonoEnv } from "@/lib/types.js";
import type { MiddlewareHandler } from "hono";

interface RouteOptions {
  staffAuthMiddleware?: MiddlewareHandler<HonoEnv>;
  adminAuthMiddleware?: MiddlewareHandler<HonoEnv>;
}

export const routes = (app: Hono, options: RouteOptions = {}) => {
  app.route("/auth", authRoutes);
  app.route("/health", health);
  app.route("/guest", guest);
  app.route(
    "/staff",
    createStaffRoutes({ auth: options.staffAuthMiddleware }),
  );
  app.route(
    "/admin",
    createAdminRoutes({ auth: options.adminAuthMiddleware }),
  );
};
