import { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import { AliyunOSSProvider } from "@/lib/storage/aliyun-oss";
import { getLocalUploadPath } from "@/lib/storage/local-storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate();
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const image = await prisma.cardImage.findUnique({
    where: { id },
  });

  if (!image) {
    return new Response("Not found", { status: 404 });
  }

  // Verify ownership: every image (including orphans not yet attached to a
  // card) carries the uploader's userId.
  if (image.userId !== auth.userId) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    let buffer: Buffer;
    let contentType = image.mimeType || "image/jpeg";

    if (image.storageUrl.startsWith("/uploads/")) {
      // Local storage: read from the private upload directory
      const storageKey = image.storageUrl.replace(/^\/uploads\//, "");
      buffer = await readFile(getLocalUploadPath(storageKey));
    } else if (image.storageUrl.startsWith("oss://")) {
      // Aliyun OSS: redirect to signed URL for direct access (faster)
      const storageKey = image.storageUrl.replace("oss://", "");
      const ossProvider = new AliyunOSSProvider();
      const signedUrl = await ossProvider.getSignedUrl(storageKey, 3600);
      return new Response(null, {
        status: 302,
        headers: {
          Location: signedUrl,
          "Cache-Control": "private, max-age=3500",
        },
      });
    } else {
      // Vercel Blob (private): fetch with auth token
      const res = await fetch(image.storageUrl, {
        headers: {
          authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
        },
      });

      if (!res.ok) {
        return new Response("Storage error", { status: 502 });
      }

      buffer = Buffer.from(await res.arrayBuffer());
      contentType = res.headers.get("content-type") || contentType;
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Internal error", { status: 500 });
  }
}
