import { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local-storage";
import { VercelBlobProvider } from "./vercel-blob";

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (provider) return provider;

  const storageType = process.env.STORAGE_PROVIDER || "local";

  if (storageType === "vercel") {
    provider = new VercelBlobProvider();
  } else {
    provider = new LocalStorageProvider();
  }

  return provider;
}
