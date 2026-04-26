import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "joshicloudindia@gmail.com";
  const password = "1234567890";
  const name = "Vivek Joshi";
  const orgName = "ChatFlow Admin";
  const slug = "chatflow-admin";

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Check if already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("✓ User already exists, updating password...");
    await prisma.user.update({
      where: { email },
      data: { passwordHash, emailVerified: new Date() },
    });
    console.log("✓ Password updated.");
    return;
  }

  // Create org + user + admin member
  const org = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: {
      name: orgName,
      slug,
      plan: "BUSINESS",
      subscription: {
        create: {
          plan: "BUSINESS",
          status: "ACTIVE",
        },
      },
    },
  });

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      emailVerified: new Date(), // pre-verified
      memberships: {
        create: {
          organizationId: org.id,
          role: "ADMIN",
          joinedAt: new Date(),
        },
      },
    },
  });

  console.log("✅ Super admin created!");
  console.log(`   Email   : ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Org     : ${orgName} (${slug})`);
  console.log(`   Plan    : BUSINESS`);
  console.log(`   User ID : ${user.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
