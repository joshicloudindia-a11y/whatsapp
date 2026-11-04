import crypto from "crypto";

// Same base as src/lib/whatsapp.ts (not exported there).
const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v24.0";
const META_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

const CACHE_TTL_MS = 10 * 60 * 1000;
const EXPIRING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

/**
 * ok                 – token works (and is not about to expire)
 * expiring           – token works but expires within 3 days
 * expired_or_invalid – Meta rejected the token (expired, revoked, wrong permissions)
 * unknown            – Meta could not be reached; not treated as a failure
 */
export type TokenHealthStatus = "ok" | "expiring" | "expired_or_invalid" | "unknown";

export interface WhatsappAccountHealth {
  id: string;
  status: TokenHealthStatus;
  /** ISO date, or null when the token never expires / expiry is unknown. */
  expiresAt: string | null;
  neverExpires: boolean;
  daysLeft: number | null;
  qualityRating: string | null;
  displayPhoneNumber: string | null;
  error: string | null;
  checkedAt: string;
}

interface AccountInput {
  id: string;
  phoneNumberId: string;
  accessToken: string;
}

const cache = new Map<string, { at: number; value: WhatsappAccountHealth }>();

async function graphGet(path: string, token?: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${META_API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
  } finally {
    clearTimeout(timer);
  }
}

function graphError(data: Record<string, unknown>): { message: string; code?: number } {
  const e = data?.error as { message?: string; code?: number } | undefined;
  return { message: e?.message ?? "Meta API error", code: e?.code };
}

async function checkOne(acc: AccountInput): Promise<WhatsappAccountHealth> {
  const base: WhatsappAccountHealth = {
    id: acc.id, status: "unknown", expiresAt: null, neverExpires: false, daysLeft: null,
    qualityRating: null, displayPhoneNumber: null, error: null, checkedAt: new Date().toISOString(),
  };

  // 1) Does the token work against the phone number at all?
  let phone;
  try {
    phone = await graphGet(`/${encodeURIComponent(acc.phoneNumberId)}?fields=display_phone_number,quality_rating`, acc.accessToken);
  } catch (e) {
    return { ...base, error: `Could not reach Meta: ${(e as Error).message}` };
  }
  if (!phone.ok) {
    const { message, code } = graphError(phone.data);
    // 4xx from Graph (incl. OAuth code 190 / 102 / 10 / 200) means the token can't be used.
    const authFailure = code === 190 || code === 102 || code === 10 || code === 200 || (phone.status >= 400 && phone.status < 500);
    return { ...base, status: authFailure ? "expired_or_invalid" : "unknown", error: message };
  }
  base.qualityRating = (phone.data.quality_rating as string | undefined) ?? null;
  base.displayPhoneNumber = (phone.data.display_phone_number as string | undefined) ?? null;

  // 2) When does it expire? (self-inspection; failure here is non-fatal)
  try {
    const t = encodeURIComponent(acc.accessToken);
    const dbg = await graphGet(`/debug_token?input_token=${t}&access_token=${t}`);
    const info = (dbg.data?.data ?? {}) as { is_valid?: boolean; expires_at?: number; error?: { message?: string } };
    if (dbg.ok && info) {
      if (info.is_valid === false) {
        return { ...base, status: "expired_or_invalid", error: info.error?.message ?? "Token is no longer valid" };
      }
      if (info.expires_at === 0) {
        base.neverExpires = true;
      } else if (typeof info.expires_at === "number") {
        const ms = info.expires_at * 1000;
        base.expiresAt = new Date(ms).toISOString();
        base.daysLeft = Math.max(0, Math.floor((ms - Date.now()) / 86400000));
        if (ms <= Date.now()) return { ...base, status: "expired_or_invalid", error: "Token has expired" };
        if (ms - Date.now() <= EXPIRING_WINDOW_MS) return { ...base, status: "expiring" };
      }
    }
  } catch {
    /* expiry unknown – the token still works */
  }
  return { ...base, status: "ok" };
}

/** Checks token health for each account. Results are cached in memory ~10 min per account+token. */
export async function checkWhatsappAccountsHealth(accounts: AccountInput[], opts: { force?: boolean } = {}): Promise<WhatsappAccountHealth[]> {
  return Promise.all(
    accounts.map(async (acc) => {
      const key = `${acc.id}:${crypto.createHash("sha256").update(acc.accessToken).digest("hex").slice(0, 16)}`;
      const hit = cache.get(key);
      if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
      let value: WhatsappAccountHealth;
      try {
        value = await checkOne(acc);
      } catch (e) {
        value = {
          id: acc.id, status: "unknown", expiresAt: null, neverExpires: false, daysLeft: null,
          qualityRating: null, displayPhoneNumber: null, error: (e as Error).message, checkedAt: new Date().toISOString(),
        };
      }
      // Don't cache transient failures for the full TTL.
      cache.set(key, { at: value.status === "unknown" ? Date.now() - CACHE_TTL_MS + 60_000 : Date.now(), value });
      return value;
    })
  );
}
