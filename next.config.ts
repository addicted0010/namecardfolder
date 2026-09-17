import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { version } from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  serverExternalPackages: ["sharp", "bcryptjs", "ali-oss"],
  // Extra dev origins (e.g. LAN IPs) can be added via DEV_ORIGINS="ip1,ip2".
  allowedDevOrigins: [
    ...(process.env.DEV_ORIGINS ? process.env.DEV_ORIGINS.split(",") : []),
    "localhost",
  ],
};

export default withNextIntl(nextConfig);
