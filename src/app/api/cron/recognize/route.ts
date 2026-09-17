import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { processRecognitionQueue } from "@/lib/recognition-queue";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";

/** Orphan images (uploaded but never attached to a card) older than this are purged. */
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel Cron security). Fail CLOSED: without a
  // configured secret the endpoint would be anonymously callable and could
  // burn paid LLM quota.
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return Response.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }

  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const providedBytes = new TextEncoder().encode(provided);
  const expectedBytes = new TextEncoder().encode(cronSecret);

  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const stats = await processRecognitionQueue();

    // Purge orphan uploads that were never attached to a card.
    const cutoff = new Date(Date.now() - ORPHAN_TTL_MS);
    const orphans = await prisma.cardImage.findMany({
      where: { cardId: null, createdAt: { lt: cutoff } },
      select: { id: true, storageKey: true },
    });
    let cleanedOrphans = 0;
    if (orphans.length > 0) {
      const storage = getStorageProvider();
      for (const orphan of orphans) {
        await storage.delete(orphan.storageKey).catch(() => {});
      }
      const deleted = await prisma.cardImage.deleteMany({
        where: { id: { in: orphans.map((o) => o.id) } },
      });
      cleanedOrphans = deleted.count;
    }

    return Response.json({
      ok: true,
      ...stats,
      cleanedOrphans,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron recognition error:", error);
    return Response.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
