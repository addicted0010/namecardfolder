import { StorageProvider } from "./types";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

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

    const ext = filename.split(".").pop() || "jpg";
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
