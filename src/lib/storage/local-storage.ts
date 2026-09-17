import { StorageProvider } from "./types";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join, resolve, basename } from "path";
import { randomUUID } from "crypto";

// Uploads live OUTSIDE public/ so they are never served statically without
// authentication; all reads go through /api/images/[id].
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? resolve(process.env.UPLOAD_DIR)
  : join(process.cwd(), "data", "uploads");

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

/** Absolute filesystem path for a local storage key (e.g. "2026/09/x.jpg"). */
export function getLocalUploadPath(storageKey: string): string {
  return join(UPLOAD_DIR, storageKey);
}

export class LocalStorageProvider implements StorageProvider {
  async upload(
    file: Buffer,
    filename: string,
    mimeType: string
  ): Promise<{ storageKey: string; url: string }> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const dir = join(UPLOAD_DIR, String(year), month);

    await mkdir(dir, { recursive: true });

    const rawExt = (basename(filename).split(".").pop() || "").toLowerCase();
    const ext = ALLOWED_EXTENSIONS.includes(rawExt) ? rawExt : "jpg";
    const uniqueName = `${randomUUID()}.${ext}`;
    const storageKey = `${year}/${month}/${uniqueName}`;
    const filePath = join(dir, uniqueName);

    await writeFile(filePath, file);

    const url = `/uploads/${storageKey}`;
    return { storageKey, url };
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = join(UPLOAD_DIR, storageKey);
    try {
      await unlink(filePath);
    } catch {
      // File may already be deleted
    }
  }

  getUrl(storageKey: string): string {
    return `/uploads/${storageKey}`;
  }
}
