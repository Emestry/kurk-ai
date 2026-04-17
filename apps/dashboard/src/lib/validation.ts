/**
 * Shared client-side form validators. The API performs the authoritative
 * check; these rules drive immediate UI feedback and disable submit until
 * all fields pass.
 */

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Require a non-empty trimmed string.
 *
 * @param value - Candidate string (may be undefined).
 * @param label - Label used in the error message.
 */
export function validateRequired(
  value: string | undefined | null,
  label: string,
): ValidationResult {
  if (!value || value.trim().length === 0) {
    return { ok: false, error: `${label} is required` };
  }
  return { ok: true };
}

/**
 * Require a non-negative integer.
 *
 * @param value - Candidate number as entered.
 * @param label - Label used in the error message.
 */
export function validateNonNegativeInt(
  value: number | string,
  label: string,
): ValidationResult {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { ok: false, error: `${label} must be a non-negative whole number` };
  }
  return { ok: true };
}

/**
 * Require a strictly-positive integer.
 */
export function validatePositiveInt(
  value: number | string,
  label: string,
): ValidationResult {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { ok: false, error: `${label} must be a positive whole number` };
  }
  return { ok: true };
}

/**
 * Enforce a maximum string length (for notes, rejection reasons).
 */
export function validateMaxLength(
  value: string | undefined | null,
  max: number,
  label: string,
): ValidationResult {
  if (value && value.length > max) {
    return { ok: false, error: `${label} must be ${max} characters or fewer` };
  }
  return { ok: true };
}

/**
 * Combine multiple validation results, returning the first error or ok.
 */
export function combine(...results: ValidationResult[]): ValidationResult {
  for (const r of results) if (!r.ok) return r;
  return { ok: true };
}
