import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getEnv } from "./env.js";
import { prisma } from "./prisma.js";

const env = getEnv();

function getCookieDomain() {
  if (env.authCookieDomain) {
    return normalizeCookieDomain(env.authCookieDomain);
  }

  const hostnames = [
    extractHostname(env.authBaseUrl),
    ...env.allowedOrigins.map((origin) => extractHostname(origin)),
  ].filter((hostname): hostname is string => Boolean(hostname));

  if (hostnames.length === 0) {
    return undefined;
  }

  const sharedDomain = getSharedHostnameSuffix(hostnames);
  return sharedDomain ? normalizeCookieDomain(sharedDomain) : undefined;
}

function extractHostname(url?: string) {
  if (!url) return undefined;

  try {
    const { hostname } = new URL(url);
    return isLocalHostname(hostname) ? undefined : hostname;
  } catch {
    return undefined;
  }
}

function getSharedHostnameSuffix(hostnames: string[]) {
  const uniqueHostnames = [...new Set(hostnames)];

  if (uniqueHostnames.length === 1) {
    return uniqueHostnames[0];
  }

  const labelSets = uniqueHostnames.map((hostname) =>
    hostname
      .split(".")
      .map((label) => label.trim().toLowerCase())
      .filter(Boolean)
      .reverse(),
  );
  const sharedLabels: string[] = [];

  for (let index = 0; index < Math.min(...labelSets.map((labels) => labels.length)); index += 1) {
    const label = labelSets[0][index];

    if (!labelSets.every((labels) => labels[index] === label)) {
      break;
    }

    sharedLabels.push(label);
  }

  if (sharedLabels.length < 2) {
    return undefined;
  }

  return sharedLabels.reverse().join(".");
}

function normalizeCookieDomain(domain: string) {
  const normalized = domain.trim().replace(/^\.+/, "").toLowerCase();
  return normalized || undefined;
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
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
    trustedProxyHeaders: env.trustProxy,
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
