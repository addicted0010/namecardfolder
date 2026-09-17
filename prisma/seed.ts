import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const username = process.env.SEED_USERNAME || "admin";
  const password = process.env.SEED_PASSWORD;
  const displayName = process.env.SEED_DISPLAY_NAME || "Administrator";

  // Never create the well-known admin/admin123 account in production.
  if (process.env.NODE_ENV === "production" && !password) {
    throw new Error(
      "SEED_PASSWORD is required in production; refusing to seed the default weak credentials."
    );
  }
  const effectivePassword = password || "admin123";
  const isProduction = process.env.NODE_ENV === "production";

  // The admin account is linked to the first email in ADMIN_EMAILS so that
  // signing in with that Google account binds to (and unlocks admin on) this
  // user. The email is no longer hardcoded in a migration.
  const adminEmail =
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean)[0] || null;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`User "${username}" already exists, skipping user seed.`);
  } else {
    const passwordHash = await bcrypt.hash(effectivePassword, 12);

    await prisma.user.create({
      data: {
        username,
        email: adminEmail,
        passwordHash,
        displayName,
        // Local trials get an admin; production seeds a regular user and
        // admin rights come from ADMIN_EMAILS via Google sign-in.
        isAdmin: !isProduction,
      },
    });

    console.log(`Seed user "${username}" created successfully.`);
  }

  // Seed SystemConfig for recognition queue
  const configs = [
    { key: "recognition_max_concurrency", value: "5" },
    { key: "recognition_min_interval_ms", value: "100" },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config,
    });
  }

  console.log("SystemConfig seeded successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
