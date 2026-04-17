import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getEnv } from "@/lib/env.js";
import { isApiError } from "@/lib/errors.js";
import { jsonError } from "@/lib/http.js";
import { logger as appLogger } from "@/lib/logger.js";
import { routes } from "@/routes/index.js";
import type { HonoEnv } from "@/lib/types.js";

interface AppOptions {
  staffAuthMiddleware?: MiddlewareHandler<HonoEnv>;
  adminAuthMiddleware?: MiddlewareHandler<HonoEnv>;
}

export function createApp(options: AppOptions = {}) {
  const env = getEnv();
  const app = new Hono();

  app.use(logger());

  app.use(
    "/*",
    cors({
      origin: env.allowedOrigins,
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-Room-Token",
        "X-Room-Session-Token",
      ],
      allowMethods: ["GET", "POST", "OPTIONS", "DELETE", "PATCH"],
      maxAge: 600,
      credentials: true,
    }),
  );

  app.onError((error, c) => {
    if (isApiError(error)) {
      appLogger.warn(error.message, {
        method: c.req.method,
        path: c.req.path,
        statusCode: error.statusCode,
      });
      return jsonError(c, error.statusCode as 400 | 401 | 403 | 404 | 409 | 422, error.message);
    }

    appLogger.error("Unhandled API error", {
      method: c.req.method,
      path: c.req.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(c, 500, "Internal server error");
  });

  app.notFound((c) => {
    return jsonError(c, 404, "Not found");
  });

  routes(app, {
    staffAuthMiddleware: options.staffAuthMiddleware,
    adminAuthMiddleware: options.adminAuthMiddleware,
  });

  return app;
}
