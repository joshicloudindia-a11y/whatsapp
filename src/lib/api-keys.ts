import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const API_KEY_PREFIX = "cf_live_";
export const MAX_ACTIVE_KEYS = 25;

/** Keyed SHA-256 so a leaked DB can't be used to forge keys; also allows O(1) lookup. */
export function hashApiKey(plain: string) {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
  return crypto.createHmac("sha256", secret).update(plain).digest("hex");
}

export function generateApiKey() {
  const plain = API_KEY_PREFIX + crypto.randomBytes(24).toString("base64url");
  return { plain, hash: hashApiKey(plain), prefix: plain.slice(0, API_KEY_PREFIX.length + 6) };
}

/**
 * Verifies an incoming key (e.g. from `Authorization: Bearer cf_live_...`).
 * Returns the organization id, or null if the key is unknown, revoked or expired.
 */
export async function verifyApiKey(plain: string | null | undefined): Promise<{ organizationId: string; keyId: string } | null> {
  if (!plain?.startsWith(API_KEY_PREFIX)) return null;
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(plain) },
    select: { id: true, organizationId: true, isActive: true, expiresAt: true },
  });
  if (!key || !key.isActive || (key.expiresAt && key.expiresAt < new Date())) return null;
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { organizationId: key.organizationId, keyId: key.id };
}
