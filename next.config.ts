import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Support for FFmpeg.wasm — use credentialless to avoid blocking external images
  async headers() {
    return [
      {
        source: "/:path((?!api/).*)",  // Only apply to non-API routes
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
