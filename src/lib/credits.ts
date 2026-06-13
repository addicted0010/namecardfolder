import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_DAILY_CREDIT_LIMIT = 100;
const DAILY_CREDIT_LIMIT_KEY = "daily_credit_limit";
const CREDIT_TIME_ZONE = process.env.CREDIT_TIME_ZONE || "Asia/Tokyo";

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

export interface DailyCreditStatus {
  date: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  isUnlimited: boolean;
}

export class DailyCreditLimitExceededError extends Error {
  constructor(public status: DailyCreditStatus, public requiredCredits: number) {
    super(
      `Daily credit limit exceeded. Required ${requiredCredits}, remaining ${status.remaining ?? 0}.`
    );
    this.name = "DailyCreditLimitExceededError";
  }
}

export function getCreditCostForImageIds(imageIds: Array<string | null | undefined>): number {
  return new Set(imageIds.filter((id): id is string => typeof id === "string" && id.length > 0)).size;
}

export async function getDailyCreditStatus(
  userId: string,
  client: PrismaClientLike = prisma
): Promise<DailyCreditStatus> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const date = getCreditDate();
  if (user.isAdmin) {
    return {
      date,
      limit: null,
      used: 0,
      remaining: null,
      isUnlimited: true,
    };
  }

  const limit = await getDailyCreditLimit(client);
  const usage = await getCreditsUsed(userId, date, client);

  return {
    date,
    limit,
    used: usage,
    remaining: Math.max(0, limit - usage),
    isUnlimited: false,
  };
}

export async function reserveDailyCredits(
  userId: string,
  credits: number,
  client: PrismaClientLike = prisma
): Promise<DailyCreditStatus> {
  if (credits <= 0) {
    return getDailyCreditStatus(userId, client);
  }

  const user = await client.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const date = getCreditDate();
  if (user.isAdmin) {
    return {
      date,
      limit: null,
      used: 0,
      remaining: null,
      isUnlimited: true,
    };
  }

  const limit = await getDailyCreditLimit(client);
  if (credits > limit) {
    const used = await getCreditsUsed(userId, date, client);
    throw new DailyCreditLimitExceededError(toStatus(date, limit, used), credits);
  }

  const rows = await client.$queryRaw<Array<{ creditsUsed: number }>>`
    INSERT INTO "UserDailyCreditUsage" ("id", "userId", "date", "creditsUsed", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${userId}, CAST(${date} AS date), ${credits}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId", "date") DO UPDATE
    SET
      "creditsUsed" = "UserDailyCreditUsage"."creditsUsed" + ${credits},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "UserDailyCreditUsage"."creditsUsed" + ${credits} <= ${limit}
    RETURNING "creditsUsed"
  `;

  const updated = rows[0]?.creditsUsed;
  if (typeof updated !== "number") {
    const used = await getCreditsUsed(userId, date, client);
    throw new DailyCreditLimitExceededError(toStatus(date, limit, used), credits);
  }

  return toStatus(date, limit, updated);
}

async function getDailyCreditLimit(client: PrismaClientLike): Promise<number> {
  const config = await client.systemConfig.findUnique({
    where: { key: DAILY_CREDIT_LIMIT_KEY },
    select: { value: true },
  });
  const value = Number.parseInt(config?.value || "", 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DAILY_CREDIT_LIMIT;
}

async function getCreditsUsed(
  userId: string,
  date: string,
  client: PrismaClientLike
): Promise<number> {
  const rows = await client.$queryRaw<Array<{ creditsUsed: number }>>`
    SELECT "creditsUsed"
    FROM "UserDailyCreditUsage"
    WHERE "userId" = ${userId} AND "date" = CAST(${date} AS date)
    LIMIT 1
  `;
  return rows[0]?.creditsUsed ?? 0;
}

function toStatus(date: string, limit: number, used: number): DailyCreditStatus {
  return {
    date,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    isUnlimited: false,
  };
}

function getCreditDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CREDIT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to resolve credit date");
  }

  return `${year}-${month}-${day}`;
}
