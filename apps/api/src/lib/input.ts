import { ApiError } from "@/lib/errors.js";

const CUID_REGEX = /^c[a-z0-9]{20,}$/;

function stripUnsafeCharacters(value: string, preserveNewlines: boolean) {
  const normalizedNewlines = value.replace(/\r\n?/g, "\n");
  const withoutControlChars = normalizedNewlines.replace(
    preserveNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g,
    "",
  );

  return withoutControlChars
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sanitizes text that will be stored and later shown back to users.
 *
 * @param value - Untrusted client or model-provided text.
 * @param options - Whether newlines should be preserved.
 * @returns A trimmed, HTML-escaped string safe to persist.
 */
export function sanitizeStoredText(
  value: string,
  options: { preserveNewlines?: boolean } = {},
) {
  return stripUnsafeCharacters(value.trim(), options.preserveNewlines === true);
}

/**
 * Sanitizes optional text fields and normalizes empty strings to undefined.
 *
 * @param value - Optional untrusted text.
 * @param options - Whether newlines should be preserved.
 * @returns A sanitized string or undefined when the input is blank.
 */
export function sanitizeOptionalStoredText(
  value: string | null | undefined,
  options: { preserveNewlines?: boolean } = {},
) {
  if (typeof value !== "string") {
    return undefined;
  }

  const sanitized = sanitizeStoredText(value, options);
  return sanitized ? sanitized : undefined;
}

/**
 * Ensures a required string field is present, sanitized, and non-empty.
 *
 * @param value - Untrusted raw text value.
 * @param label - Human-readable field name for error messages.
 * @param options - Whether newlines should be preserved.
 * @returns A sanitized non-empty string.
 * @throws ApiError when the field is missing or blank.
 */
export function requireStoredText(
  value: string | null | undefined,
  label: string,
  options: { preserveNewlines?: boolean } = {},
) {
  const sanitized = sanitizeOptionalStoredText(value, options);

  if (!sanitized) {
    throw new ApiError(400, `${label} is required`);
  }

  return sanitized;
}

/**
 * Validates that a route/entity id uses the Prisma cuid format used by this API.
 *
 * @param value - Untrusted path/query id value.
 * @param label - Human-readable field name for error messages.
 * @returns The original id when valid.
 * @throws ApiError when the id is missing or malformed.
 */
export function requireCuid(value: string | null | undefined, label: string) {
  if (!value || !CUID_REGEX.test(value)) {
    throw new ApiError(400, `${label} is invalid`);
  }

  return value;
}
