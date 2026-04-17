/**
 * Typed fetch wrapper for the staff dashboard. Sends the better-auth
 * session cookie with every request and normalizes errors into
 * `ApiError` instances so TanStack Query can surface them uniformly.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Represents an API failure returned by the staff backend.
 */
export class ApiError extends Error {
  /**
   * @param message - Human-readable error text.
   * @param statusCode - HTTP status returned by the API.
   */
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

/**
 * Perform a typed fetch against apps/api. Serializes JSON bodies,
 * sends credentials, and throws `ApiError` on non-2xx responses.
 *
 * @param path - Path starting with `/` (e.g. `/staff/requests`).
 * @param options - Standard fetch init plus an optional JSON body.
 * @returns The parsed JSON response typed as `T`.
 * @throws ApiError when the server returns a non-2xx status.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, headers, ...rest } = options;
  const init: RequestInit = {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${path}`, init);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      /* swallow JSON parse error — use default message */
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
