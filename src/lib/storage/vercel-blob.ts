import { StorageProvider } from "./types";
import { put, del } from "@vercel/blob";

export class VercelBlobProvider implements StorageProvider {
  async upload(
    file: Buffer,
    filename: string,
    mimeType: string
  ): Promise<{ storageKey: string; url: string }> {
    const ext = filename.split(".").pop() || "jpg";
    const key = `cards/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const blob = await put(key, file, {
      access: "public",
      contentType: mimeType,
    });

    return {
      storageKey: blob.pathname,
      url: blob.url,
    };
  }

  async delete(storageKey: string): Promise<void> {
    await del(storageKey);
  }

  getUrl(storageKey: string): string {
    return storageKey;
  }
}
