/**
 * One-time migration helper: copies legacy uploads from public/uploads
 * (statically served, unauthenticated) into the new private upload directory
 * (data/uploads by default, override with UPLOAD_DIR).
 *
 * Run with: npx tsx scripts/migrate-uploads-dir.ts
 *
 * After verifying that images load via /api/images/[id], delete the old
 * directory manually (public/uploads) — this script never removes data.
 */
import { cp, stat } from "fs/promises";
import { join, resolve } from "path";

const source = join(process.cwd(), "public", "uploads");
const target = process.env.UPLOAD_DIR
  ? resolve(process.env.UPLOAD_DIR)
  : join(process.cwd(), "data", "uploads");

async function main() {
  const srcStat = await stat(source).catch(() => null);
  if (!srcStat || !srcStat.isDirectory()) {
    console.log("No legacy public/uploads directory found, nothing to do.");
    return;
  }

  await cp(source, target, { recursive: true });
  console.log(`Copied ${source} -> ${target}`);
  console.log(
    "Verify images load via /api/images/[id], then remove the old directory manually:"
  );
  console.log(`  rm -rf ${source}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
