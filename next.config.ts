import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "unavatar.io"
      },
    ],
  },
  turbopack: {
    root: "D:\\Software\\other\\GitHub\\lm-speed",
  },
};

export default withNextIntl(nextConfig);