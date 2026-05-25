export interface StorageProvider {
  upload(
    file: Buffer,
    filename: string,
    mimeType: string
  ): Promise<{ storageKey: string; url: string }>;

  delete(storageKey: string): Promise<void>;

  getUrl(storageKey: string): string;
}
