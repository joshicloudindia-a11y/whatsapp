import { PrismaClient } from "@prisma/client";
import { decryptTokensDeep, encryptTokenArgs } from "@/lib/token-crypto";

/** Sets optOutAt / optInAt (+ default optInSource) when a write flips Contact.optedOut. */
function stampConsent(args: unknown, operation: string) {
  const stamp = (d: Record<string, unknown> | undefined) => {
    if (!d || typeof d !== "object") return;
    const v = typeof d.optedOut === "object" && d.optedOut !== null ? (d.optedOut as { set?: unknown }).set : d.optedOut;
    if (v === true && d.optOutAt === undefined) d.optOutAt = new Date();
    if (v === false) {
      if (d.optInAt === undefined) d.optInAt = new Date();
      if (d.optOutAt === undefined) d.optOutAt = null;
      if (d.optInSource === undefined) d.optInSource = "manual";
    }
  };
  const a = args as { data?: Record<string, unknown>; update?: Record<string, unknown> };
  if (operation === "upsert") stamp(a.update);
  else stamp(a.data);
}

const WRITE_OPS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "upsert"]);

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    name: "secure-access-tokens",
    query: {
      // WhatsApp access tokens are encrypted on every write…
      whatsappAccount: {
        async $allOperations({ operation, args, query }) {
          if (WRITE_OPS.has(operation)) encryptTokenArgs(args);
          return query(args);
        },
      },
      // Opt-in record: every change of Contact.optedOut stamps when (and, if given, how) consent changed.
      contact: {
        async $allOperations({ operation, args, query }) {
          if (operation === "update" || operation === "updateMany" || operation === "upsert") stampConsent(args, operation);
          return query(args);
        },
      },
      // …and decrypted wherever they are read, including nested includes (conversation.whatsappAccount, etc.).
      $allModels: {
        async $allOperations({ args, query }) {
          return decryptTokensDeep(await query(args));
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { prisma?: ExtendedClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Interactive-transaction client type for the extended client (use instead of Prisma.TransactionClient). */
export type DbTx = Omit<ExtendedClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
