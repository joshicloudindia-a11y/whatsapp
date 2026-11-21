import { PrismaClient } from "@prisma/client";
import { decryptTokensDeep, encryptTokenArgs } from "@/lib/token-crypto";

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
