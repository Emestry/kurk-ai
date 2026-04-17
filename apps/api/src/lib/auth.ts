import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getEnv } from "./env.js";
import { prisma } from "./prisma.js";

const env = getEnv();

function getCookieDomain() {
  if (env.authCookieDomain) return env.authCookieDomain;
  if (!env.authBaseUrl) return undefined;

  try {
    const { hostname } = new URL(env.authBaseUrl);

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".localhost")
    ) {
      return undefined;
    }

    return hostname;
  } catch {
    return undefined;
  }
}

const cookieDomain = getCookieDomain();

export const auth = betterAuth({
  basePath: "/auth",
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      // Surface the `role` column from the user table on the session so
      // adminMiddleware can read `session.user.role` without a DB lookup.
      // `input: false` prevents any client-facing signup/update form from
      // self-assigning a role.
      role: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  advanced: {
    ...(cookieDomain
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: cookieDomain,
          },
        }
      : {}),
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
  },
  baseURL: env.authBaseUrl,
  trustedOrigins: env.allowedOrigins,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
});
