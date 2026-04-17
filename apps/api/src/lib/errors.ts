export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

/**
 * Narrows unknown errors to the API-specific error type used by the backend.
 *
 * @param error - Value caught in an exception handler.
 * @returns True when the value is an ApiError instance.
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
