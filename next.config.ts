import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const https = (host: string | undefined) => (host?.trim() ? `https://${host.trim().replace(/\/+$/, "")}` : undefined);

/**
 * NEXT_PUBLIC_SITE_URL is inlined into the bundles at BUILD time (share links,
 * canonical / og:url / og:image). When it isn't set, derive it from Vercel's
 * system env: production builds use the project's production domain, preview
 * builds their own deployment URL (so previews don't point shares at prod).
 */
function siteUrlDefault(): string | undefined {
  if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) return undefined;
  const production = https(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  const deployment = https(process.env.VERCEL_URL);
  const url = process.env.VERCEL_ENV === "production" ? (production ?? deployment) : (deployment ?? production);
  if (url) return url;

  if (process.env.VERCEL) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set and no Vercel URL is available — share links and link previews would point at localhost.",
    );
  }
  if (process.env.NODE_ENV === "production" && process.argv.includes("build")) {
    console.warn(
      "\n⚠️  NEXT_PUBLIC_SITE_URL is not set: this build's share links, canonical URLs and link-preview\n" +
        "⚠️  images point at http://localhost:3000. Set it to the campaign URL and rebuild before going live.\n",
    );
  }
  return undefined;
}

const siteUrl = siteUrlDefault();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: siteUrl ? { NEXT_PUBLIC_SITE_URL: siteUrl } : {},
  // Native module used to render share/OG images with proper Arabic shaping.
  serverExternalPackages: ["@resvg/resvg-js"],
  // The OG renderer reads TTF files from disk at runtime; make sure they ship.
  outputFileTracingIncludes: {
    "/api/og": ["./assets/fonts/**/*", "./assets/brand-thechefz-logo.png"],
    "/api/og/[id]": ["./assets/fonts/**/*", "./assets/brand-thechefz-logo.png"],
    "/api/og/search": ["./assets/fonts/**/*", "./assets/brand-thechefz-logo.png"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
};

export default nextConfig;
