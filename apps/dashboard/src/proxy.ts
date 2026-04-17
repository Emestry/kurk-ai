import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIES = [
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
];
const LOGIN_PATH = "/login";

/**
 * Guards staff routes by redirecting anonymous requests to the login page.
 *
 * @param request - Incoming Next.js middleware request.
 * @returns A pass-through response for public/internal routes or a redirect for anonymous staff traffic.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login page and all Next.js internals to pass through.
  if (
    pathname === LOGIN_PATH ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // If there is no session cookie, redirect to /login.
  const sessionCookie = SESSION_COOKIES
    .map((name) => request.cookies.get(name))
    .find((cookie) => cookie?.value);
  if (!sessionCookie?.value) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
