-- Add owner (userId) to CardImage so orphan (not-yet-attached) uploads are
-- access-controlled, and a claim timestamp to recover stuck PROCESSING cards.

-- 1) CardImage.userId: backfill from attached card, drop unowned orphans.
ALTER TABLE "CardImage" ADD COLUMN "userId" TEXT;

UPDATE "CardImage" ci
SET "userId" = c."userId"
FROM "Card" c
WHERE ci."cardId" = c."id";

DELETE FROM "CardImage" WHERE "userId" IS NULL;

ALTER TABLE "CardImage" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "CardImage" ADD CONSTRAINT "CardImage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CardImage_userId_idx" ON "CardImage"("userId");

-- 2) Card.processingStartedAt: written when a worker claims a card, used to
--    reclaim stale PROCESSING slots after crashes/timeouts.
ALTER TABLE "Card" ADD COLUMN "processingStartedAt" TIMESTAMP(3);
