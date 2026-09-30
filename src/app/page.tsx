import type { Metadata } from "next";
import { CampaignPage } from "@/components/CampaignPage";
import { COPY } from "@/lib/config";
import { getInitialWall, getSceneLetters } from "@/lib/data";
import { safeSearchQuery } from "@/lib/search-query";

export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const q = safeSearchQuery((await searchParams).q);
  if (!q) return {};

  const title = `رسائل شكر إلى «${q}» 💜 | ${COPY.brand}`;
  const description = `شوف وش كتب الطلاب لـ «${q}» في يوم المعلم، أو اكتب رسالتك.`;
  const image = `/api/og/search?q=${encodeURIComponent(q)}`;
  const url = `/?q=${encodeURIComponent(q)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    // Shareable, but an endless set of user-typed pages: keep them out of the index.
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      locale: "ar_SA",
      siteName: COPY.brand,
      url,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const q = safeSearchQuery((await searchParams).q);
  const [wall, results, heroLetters] = await Promise.all([
    getInitialWall(),
    q ? getInitialWall(q) : Promise.resolve(null),
    getSceneLetters(),
  ]);

  return (
    <CampaignPage
      initial={results ?? wall}
      initialQuery={q || undefined}
      heroLetters={heroLetters}
      total={wall.total}
    />
  );
}
