import { createAuthClient } from "better-auth/react";

/**
 * Better-auth client configured against the api's /auth mount.
 * Exposes signIn/signOut/useSession for components.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001/auth",
});

export const { signIn, signOut, useSession } = authClient;
