import crypto from "crypto";

/**
 * Encryption at rest for client WhatsApp access tokens (AES-256-GCM).
 * Format: enc:v1:<iv>:<tag>:<ciphertext> (base64url). Values without the prefix are treated as
 * legacy plaintext and returned unchanged, so existing rows keep working until they are re-saved.
 *
 * Key: TOKEN_ENCRYPTION_KEY (32 bytes as 64 hex chars or base64). Without it, a key is derived from
 * NEXTAUTH_SECRET. Decryption tries every configured key, so adding TOKEN_ENCRYPTION_KEY later does
 * not break tokens that were encrypted with the derived key.
 */
const PREFIX = "enc:v1:";

function parseKey(raw: string): Buffer | null {
  const s = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, "hex");
  const b = Buffer.from(s, "base64");
  return b.length === 32 ? b : null;
}

function keys(): Buffer[] {
  const out: Buffer[] = [];
  const explicit = process.env.TOKEN_ENCRYPTION_KEY ? parseKey(process.env.TOKEN_ENCRYPTION_KEY) : null;
  if (explicit) out.push(explicit);
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (secret) out.push(crypto.createHash("sha256").update(`${secret}:chatflow:wa-token:v1`).digest());
  return out;
}

export const isEncryptedToken = (v: unknown): v is string => typeof v === "string" && v.startsWith(PREFIX);

export function encryptToken(plain: string): string {
  if (!plain || isEncryptedToken(plain)) return plain;
  const key = keys()[0];
  if (!key) throw new Error("Set TOKEN_ENCRYPTION_KEY or NEXTAUTH_SECRET to store access tokens securely");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

export function decryptToken(value: string): string {
  if (!isEncryptedToken(value)) return value;
  const [iv, tag, ct] = value.slice(PREFIX.length).split(":");
  for (const key of keys()) {
    try {
      const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
    } catch { /* try the next key */ }
  }
  console.error("[token-crypto] could not decrypt an access token (encryption key changed?)");
  return ""; // behaves like a missing token: Meta calls fail with an auth error and the UI asks for a new token
}

/** Replaces every `accessToken` string in a query result (any nesting depth) with its decrypted value. */
export function decryptTokensDeep<T>(value: T, depth = 0): T {
  if (!value || typeof value !== "object" || depth > 8) return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = decryptTokensDeep(value[i], depth + 1);
    return value;
  }
  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (k === "accessToken" && isEncryptedToken(v)) obj[k] = decryptToken(v);
    else if (v && typeof v === "object") obj[k] = decryptTokensDeep(v, depth + 1);
  }
  return value;
}

/** Encrypts `accessToken` in WhatsappAccount write arguments (data / create / update). */
export function encryptTokenArgs(args: unknown) {
  const visit = (d: unknown) => {
    if (!d || typeof d !== "object") return;
    if (Array.isArray(d)) { d.forEach(visit); return; }
    const o = d as Record<string, unknown>;
    if (typeof o.accessToken === "string") o.accessToken = encryptToken(o.accessToken);
    else if (o.accessToken && typeof o.accessToken === "object" && typeof (o.accessToken as { set?: unknown }).set === "string") {
      (o.accessToken as { set: string }).set = encryptToken((o.accessToken as { set: string }).set);
    }
  };
  const a = args as { data?: unknown; create?: unknown; update?: unknown } | undefined;
  visit(a?.data); visit(a?.create); visit(a?.update);
}
