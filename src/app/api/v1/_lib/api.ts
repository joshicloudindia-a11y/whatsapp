import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiKey } from "@/lib/api-keys";

/** Shared plumbing for the public REST API v1: auth, rate limiting, usage metering and errors. */

export const RATE_LIMIT = 60; // requests
export const RATE_WINDOW_MS = 60_000; // per minute, per API key

export interface ApiContext { organizationId: string; keyId: string }

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers });
}

// Best-effort, per-instance fixed window. Good enough to stop runaway scripts; not a distributed limiter.
const buckets = new Map<string, { start: number; count: number }>();

function rateLimit(keyId: string) {
  const now = Date.now();
  let b = buckets.get(keyId);
  if (!b || now - b.start >= RATE_WINDOW_MS) {
    b = { start: now, count: 0 };
    buckets.set(keyId, b);
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now - v.start >= RATE_WINDOW_MS) buckets.delete(k);
    }
  }
  b.count++;
  const reset = Math.ceil((b.start + RATE_WINDOW_MS) / 1000);
  return { ok: b.count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - b.count), reset, retryAfter: Math.max(1, Math.ceil((b.start + RATE_WINDOW_MS - now) / 1000)) };
}

function bearer(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m?.[1] ?? null;
}

type Handler<P> = (req: NextRequest, ctx: ApiContext, params: P) => Promise<NextResponse>;

/** Wraps a v1 route handler with API-key auth, rate limiting, usage metering and a JSON error boundary. */
export function withApiKey<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    const token = bearer(req);
    if (!token) return apiError(401, "UNAUTHORIZED", "Missing API key. Send `Authorization: Bearer cf_live_...`.", undefined, { "WWW-Authenticate": "Bearer" });
    const auth = await verifyApiKey(token).catch(() => null);
    if (!auth) return apiError(401, "UNAUTHORIZED", "Invalid, revoked or expired API key.", undefined, { "WWW-Authenticate": "Bearer" });

    const rl = rateLimit(auth.keyId);
    const rlHeaders = { "X-RateLimit-Limit": String(RATE_LIMIT), "X-RateLimit-Remaining": String(rl.remaining), "X-RateLimit-Reset": String(rl.reset) };
    if (!rl.ok) {
      return apiError(429, "RATE_LIMITED", `Rate limit of ${RATE_LIMIT} requests per minute exceeded.`, undefined, { ...rlHeaders, "Retry-After": String(rl.retryAfter) });
    }

    // Meter every authenticated, non-throttled request.
    after(async () => {
      try {
        await Promise.all([
          prisma.subscription.updateMany({ where: { organizationId: auth.organizationId }, data: { apiCallsUsed: { increment: 1 } } }),
          prisma.usageLog.create({
            data: { organizationId: auth.organizationId, type: "API_CALL", metadata: { keyId: auth.keyId, method: req.method, path: req.nextUrl.pathname } },
          }),
        ]);
      } catch (e) {
        console.error("[api/v1] usage metering failed", e);
      }
    });

    let res: NextResponse;
    try {
      res = await handler(req, auth, await route.params);
    } catch (e) {
      console.error("[api/v1] unhandled error", req.method, req.nextUrl.pathname, e);
      res = apiError(500, "INTERNAL_ERROR", "Something went wrong on our side. Please retry.");
    }
    for (const [k, v] of Object.entries(rlHeaders)) res.headers.set(k, v);
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
}

/** Parses a JSON object body or returns null. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
}

export function pagination(sp: URLSearchParams) {
  const page = Math.max(1, parseInt(sp.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "25") || 25));
  return { page, limit, skip: (page - 1) * limit };
}
