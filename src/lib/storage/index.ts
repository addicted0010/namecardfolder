import { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local-storage";
import { VercelBlobProvider } from "./vercel-blob";
import { AliyunOSSProvider } from "./aliyun-oss";

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (provider) return provider;

  const storageType = process.env.STORAGE_PROVIDER || "local";

  switch (storageType) {
    case "vercel":
      provider = new VercelBlobProvider();
      break;
    case "aliyun-oss":
      provider = new AliyunOSSProvider();
      break;
    default:
      provider = new LocalStorageProvider();
      break;
  }

  return provider;
}
