import { defineConfig } from "prisma/config";

// 迁移必须使用直连（非连接池）端点，否则 advisory lock 会超时
const migrateUrl =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5433/namecard";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: migrateUrl,
  },
});
