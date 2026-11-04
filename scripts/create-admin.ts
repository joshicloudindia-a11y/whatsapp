/**
 * Creates (or promotes) a SUPER_ADMIN user for the admin panel.
 *
 * Usage:
 *   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='Strong-Passw0rd!' ADMIN_NAME='Your Name' npx tsx scripts/create-admin.ts
 *
 * Never commit credentials to this file.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Super Admin";

  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.");
  }
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error("ADMIN_PASSWORD must be 10+ chars with upper-case, lower-case and a number.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const data = {
    passwordHash,
    emailVerified: new Date(),
    isActive: true,
    isSuperAdmin: true,
    adminRole: "SUPER_ADMIN" as const,
    failedLoginAttempts: 0,
    lockedUntil: null,
    sessionsRevokedAt: new Date(),
  };

  const user = await prisma.user.upsert({
    where: { email },
    update: data,
    create: { email, name, ...data },
  });

  console.log(`✅ ${user.email} is now a SUPER_ADMIN. Sign in at /admin/login (password + email OTP).`);
}

main()
  .catch((e) => { console.error(e.message ?? e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
