export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
