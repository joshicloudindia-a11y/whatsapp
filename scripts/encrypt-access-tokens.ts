/**
 * One-time migration: encrypts WhatsApp access tokens that are still stored as plain text.
 * Safe to run more than once (already-encrypted rows are skipped). Prints counts only, never tokens.
 *
 *   npx tsx scripts/encrypt-access-tokens.ts            # dry run
 *   npx tsx scripts/encrypt-access-tokens.ts --apply    # write changes
 *
 * Needs DATABASE_URL and the same NEXTAUTH_SECRET / TOKEN_ENCRYPTION_KEY as production.
 */
import { PrismaClient } from "@prisma/client";
import { encryptToken, isEncryptedToken } from "../src/lib/token-crypto";

const apply = process.argv.includes("--apply");
const db = new PrismaClient(); // plain client: we want the raw stored values

async function main() {
  const rows = await db.whatsappAccount.findMany({ select: { id: true, accessToken: true } });
  const todo = rows.filter((r) => r.accessToken && !isEncryptedToken(r.accessToken));
  console.log(`${rows.length} account(s); ${todo.length} with a plain-text token.`);
  if (!apply) { console.log("Dry run. Re-run with --apply to encrypt them."); return; }
  for (const r of todo) {
    await db.whatsappAccount.update({ where: { id: r.id }, data: { accessToken: encryptToken(r.accessToken) } });
  }
  console.log(`Encrypted ${todo.length} token(s).`);
}

main().finally(() => db.$disconnect());
