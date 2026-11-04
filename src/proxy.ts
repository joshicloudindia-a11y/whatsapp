import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/admin/login", "/accept-invite"];
const PUBLIC_API  = ["/api/auth", "/api/webhook", "/api/plans", "/api/billing/webhook", "/api/admin-auth"];

const isAdminPath = (p: string) => p === "/admin" || p.startsWith("/admin/") || p.startsWith("/api/admin");

/** Hardened headers for every super admin page and API response. */
function withAdminHeaders(res: NextResponse) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const admin = isAdminPath(pathname) || pathname.startsWith("/api/admin-auth");
  const next = () => (admin ? withAdminHeaders(NextResponse.next()) : NextResponse.next());

  if (
    PUBLIC_PATHS.some(p => pathname === p || (p !== "/" && pathname.startsWith(p + "/"))) ||
    PUBLIC_API.some(p => pathname.startsWith(p))
  ) {
    return next();
  }

  let token = null;
  try {
    token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    });
  } catch {
    // If token verification fails, treat as unauthenticated
  }

  // Super admin panel requires a session created through /admin/login (OTP verified).
  if (isAdminPath(pathname) && !token?.adminAuthAt) {
    if (pathname.startsWith("/api/")) {
      return withAdminHeaders(NextResponse.json({ error: "Admin session required" }, { status: 401 }));
    }
    const loginUrl = new URL("/admin/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return withAdminHeaders(NextResponse.redirect(loginUrl));
  }

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return next();
}

export const config = {
  // Skip Next internals and public static files (images, fonts, etc.).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|txt|xml)$).*)"],
};
