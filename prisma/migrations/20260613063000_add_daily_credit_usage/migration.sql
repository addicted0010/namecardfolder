-- CreateTable
CREATE TABLE "UserDailyCreditUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDailyCreditUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDailyCreditUsage_userId_date_key" ON "UserDailyCreditUsage"("userId", "date");

-- CreateIndex
CREATE INDEX "UserDailyCreditUsage_date_idx" ON "UserDailyCreditUsage"("date");

-- AddForeignKey
ALTER TABLE "UserDailyCreditUsage" ADD CONSTRAINT "UserDailyCreditUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
