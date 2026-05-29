import { StorageProvider } from "./types";
import OSS from "ali-oss";
import crypto from "crypto";

/**
 * STS temporary credentials cache
 */
interface STSCredentials {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: Date;
}

let cachedCredentials: STSCredentials | null = null;
let ossClient: OSS | null = null;

/**
 * Call Alibaba Cloud STS AssumeRole API to get temporary credentials.
 * Uses API Signature V1 (HMAC-SHA1).
 */
async function assumeRole(): Promise<STSCredentials> {
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID!;
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET!;
  const roleArn = process.env.ALIYUN_OSS_ROLE_ARN!;
  const stsEndpoint = process.env.ALIYUN_OSS_STS_ENDPOINT || "https://sts.aliyuncs.com";
  const durationSeconds = 3600; // 1 hour

  // Build request parameters
  const params: Record<string, string> = {
    Action: "AssumeRole",
    Version: "2015-04-01",
    Format: "JSON",
    RoleArn: roleArn,
    RoleSessionName: `cardvault-${Date.now()}`,
    DurationSeconds: String(durationSeconds),
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };

  // Calculate signature
  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys
    .map((k) => `${encodeRFC3986(k)}=${encodeRFC3986(params[k])}`)
    .join("&");

  const stringToSign = `GET&${encodeRFC3986("/")}&${encodeRFC3986(canonicalQuery)}`;
  const signature = crypto
    .createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");

  // Send request
  const url = `${stsEndpoint}/?${canonicalQuery}&Signature=${encodeURIComponent(signature)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`STS AssumeRole failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const credentials = data.Credentials;

  return {
    accessKeyId: credentials.AccessKeyId,
    accessKeySecret: credentials.AccessKeySecret,
    securityToken: credentials.SecurityToken,
    expiration: new Date(credentials.Expiration),
  };
}

/**
 * RFC 3986 percent-encoding (Alibaba Cloud API signature requires this)
 */
function encodeRFC3986(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/**
 * Get or refresh OSS client with valid STS credentials.
 * Caches credentials and refreshes 5 minutes before expiry.
 */
async function getOSSClient(): Promise<OSS> {
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minutes buffer

  if (cachedCredentials && cachedCredentials.expiration.getTime() - now.getTime() > bufferMs && ossClient) {
    return ossClient;
  }

  // Refresh STS credentials
  cachedCredentials = await assumeRole();

  ossClient = new OSS({
    region: process.env.ALIYUN_OSS_REGION!,
    bucket: process.env.ALIYUN_OSS_BUCKET!,
    accessKeyId: cachedCredentials.accessKeyId,
    accessKeySecret: cachedCredentials.accessKeySecret,
    stsToken: cachedCredentials.securityToken,
    secure: true,
  });

  return ossClient;
}

export class AliyunOSSProvider implements StorageProvider {
  async upload(
    file: Buffer,
    filename: string,
    mimeType: string
  ): Promise<{ storageKey: string; url: string }> {
    const ext = filename.split(".").pop() || "jpg";
    const storageKey = `cards/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const client = await getOSSClient();
    await client.put(storageKey, file, {
      headers: {
        "Content-Type": mimeType,
      },
    });

    // Return storageKey as url (actual access via signed URL or proxy)
    return { storageKey, url: `oss://${storageKey}` };
  }

  async delete(storageKey: string): Promise<void> {
    try {
      const client = await getOSSClient();
      await client.delete(storageKey);
    } catch {
      // File may already be deleted
    }
  }

  getUrl(storageKey: string): string {
    return `oss://${storageKey}`;
  }

  /**
   * Generate a signed URL for direct client access (faster than proxy).
   * Default expiration: 1 hour.
   */
  async getSignedUrl(storageKey: string, expires: number = 3600): Promise<string> {
    const client = await getOSSClient();
    return client.signatureUrl(storageKey, { expires });
  }

  /**
   * Fetch image content from OSS (server-side, for recognition queue etc.)
   */
  async fetch(storageKey: string): Promise<Buffer> {
    const client = await getOSSClient();
    const result = await client.get(storageKey);
    return result.content as Buffer;
  }
}
