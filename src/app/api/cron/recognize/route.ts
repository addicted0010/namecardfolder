import { NextRequest } from "next/server";
import { processRecognitionQueue } from "@/lib/recognition-queue";

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel Cron security)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const stats = await processRecognitionQueue();

    return Response.json({
      ok: true,
      ...stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron recognition error:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
