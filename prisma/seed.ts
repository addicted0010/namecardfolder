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
  const password = process.env.SEED_PASSWORD || "admin123";
  const displayName = process.env.SEED_DISPLAY_NAME || "Administrator";

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`User "${username}" already exists, skipping user seed.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName,
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
