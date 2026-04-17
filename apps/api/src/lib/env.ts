const DEFAULT_PORT = 3001;

export interface AppEnv {
  allowedOrigins: string[];
  authBaseUrl?: string;
  authCookieDomain?: string;
  databaseSchema?: string;
  databaseUrl: string;
  openAiApiKey?: string;
  port: number;
  trustProxy: boolean;
}

/**
 * Reads and validates the API environment variables used at runtime.
 *
 * @returns A normalized environment object for database, auth, CORS, and OpenAI settings.
 * @throws Error when required variables are missing or malformed.
 */
export function getEnv(): AppEnv {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const port = parsePort(process.env.PORT);

  return {
    allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    authBaseUrl: process.env.BETTER_AUTH_URL?.trim() || undefined,
    authCookieDomain: process.env.BETTER_AUTH_COOKIE_DOMAIN?.trim() || undefined,
    databaseSchema: parseDatabaseSchema(databaseUrl),
    databaseUrl,
    openAiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    port,
    trustProxy: parseBoolean(process.env.TRUST_PROXY, true),
  };
}

/**
 * Splits the comma-delimited origin list used by the API CORS configuration.
 *
 * @param value - Raw ALLOWED_ORIGINS string from the environment.
 * @returns Sanitized origins without trailing slashes.
 */
export function parseAllowedOrigins(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * Parses the HTTP port for the API server, falling back to the default port.
 *
 * @param value - Raw PORT value from the environment.
 * @returns A positive integer port number.
 * @throws Error when the value is not a positive integer.
 */
export function parsePort(value?: string): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return parsed;
}

/**
 * Parses a boolean-like environment variable with a fallback.
 *
 * @param value - Raw environment variable value.
 * @param fallback - Value to use when the variable is unset.
 * @returns The parsed boolean value.
 * @throws Error when the provided value is not a recognized boolean token.
 */
export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parseDatabaseSchema(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    const schema = url.searchParams.get("schema")?.trim();
    return schema || undefined;
  } catch {
    return undefined;
  }
}
