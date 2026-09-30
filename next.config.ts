import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native module used to render share/OG images with proper Arabic shaping.
  serverExternalPackages: ["@resvg/resvg-js"],
  // The OG renderer reads TTF files from disk at runtime; make sure they ship.
  outputFileTracingIncludes: {
    "/api/og": ["./assets/fonts/**/*"],
    "/api/og/[id]": ["./assets/fonts/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
