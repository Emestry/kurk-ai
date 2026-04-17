const DEFAULT_PORT = 3001;

export interface AppEnv {
  allowedOrigins: string[];
  authBaseUrl?: string;
  authCookieDomain?: string;
  databaseSchema?: string;
  databaseUrl: string;
  openAiApiKey?: string;
  port: number;
}

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
  };
}

export function parseAllowedOrigins(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

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

function parseDatabaseSchema(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    const schema = url.searchParams.get("schema")?.trim();
    return schema || undefined;
  } catch {
    return undefined;
  }
}
