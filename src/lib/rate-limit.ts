import { NextRequest } from "next/server";

/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Suitable for self-hosted (single-process) deployments. On serverless
 * platforms each instance keeps its own window, so this is a best-effort
 * throttle rather than a global guarantee.
 */
const windows = new Map<string, number[]>();

const MAX_TRACKED_KEYS = 10000;

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (windows.get(key) || []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    windows.set(key, hits);
    return true;
  }

  hits.push(now);
  windows.set(key, hits);

  // Bound memory: drop expired keys when the map grows too large.
  if (windows.size > MAX_TRACKED_KEYS) {
    for (const [k, v] of windows) {
      if (v.length === 0 || now - v[v.length - 1] >= windowMs) {
        windows.delete(k);
      }
    }
  }

  return false;
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
