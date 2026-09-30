import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { COPY, SITE_URL } from "@/lib/config";
import "./globals.css";

// Only Molhim (everything above the fold) is preloaded. Plex covers Latin /
// «» / punctuation fallbacks and Ruqaa a few handwritten touches: both load on
// demand (display: swap), so ~350 KB stays off the critical path on phones.
const plex = localFont({
  variable: "--font-plex",
  display: "swap",
  preload: false,
  src: [
    { path: "../fonts/IBMPlexSansArabic-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexSansArabic-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/IBMPlexSansArabic-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../fonts/IBMPlexSansArabic-Bold.woff2", weight: "700", style: "normal" },
  ],
});

// Brand font (Molhim, supplied by The Chefz). Arabic + digits only: Latin text,
// «» quotes, dashes and ellipses fall back to IBM Plex Sans Arabic.
const molhim = localFont({
  variable: "--font-molhim",
  display: "swap",
  src: [
    { path: "../fonts/Molhim-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Molhim-Bold.woff2", weight: "700", style: "normal" },
  ],
});

const ruqaa = localFont({
  variable: "--font-ruqaa",
  display: "swap",
  preload: false,
  src: [
    { path: "../fonts/ArefRuqaa-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ArefRuqaa-Bold.woff2", weight: "700", style: "normal" },
  ],
});

const title = `${COPY.heroTitle} ${COPY.heroTitleEmoji} | ${COPY.brand}`;
const description =
  "اكتب رسالة شكر لمعلمك أو دكتورك اللي أثّر فيك، وشوف رسائل الناس لمعلميهم. حملة يوم المعلم من ذا شفز.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  // The home page's canonical: tracking params (?fbclid, ?utm_…) and rejected
  // ?q= values fold into "/". Letter and search pages set their own.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName: COPY.brand,
    url: "/",
    title,
    description,
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/api/og"] },
};

export const viewport: Viewport = {
  themeColor: "#fbf7f2",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${molhim.variable} ${plex.variable} ${ruqaa.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
