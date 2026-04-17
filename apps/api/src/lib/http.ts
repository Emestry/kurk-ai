import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function jsonError(
  c: Context,
  statusCode: ContentfulStatusCode,
  error: string,
) {
  return c.json({ error, statusCode }, statusCode);
}
