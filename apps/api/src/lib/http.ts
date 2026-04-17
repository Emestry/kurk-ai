import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Sends a consistent JSON error payload from Hono route handlers.
 *
 * @param c - Active Hono context for the request.
 * @param statusCode - HTTP status to send with the error payload.
 * @param error - Human-readable message for the client.
 * @returns A Hono JSON response containing the error message and status code.
 */
export function jsonError(
  c: Context,
  statusCode: ContentfulStatusCode,
  error: string,
) {
  return c.json({ error, statusCode }, statusCode);
}
