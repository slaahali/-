import type { Metadata } from "next";
import { CampaignPage } from "@/components/CampaignPage";
import { COPY } from "@/lib/config";
import { getInitialWall } from "@/lib/data";

const MAX_QUERY = 60;

/**
 * `?q=` as shown in titles and passed to search: first value only, control /
 * zero-width / bidi-override characters removed (they could reorder the text
 * in a share preview), whitespace collapsed, at most 60 characters.
 */
function readQuery(v: string | string[] | undefined): string {
  const raw = Array.isArray(v) ? v[0] : v;
  if (!raw) return "";
  const clean = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...clean].slice(0, MAX_QUERY).join("").trim();
}

export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const q = readQuery((await searchParams).q);
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
  const q = readQuery((await searchParams).q);
  const [wall, results] = await Promise.all([
    getInitialWall(),
    q ? getInitialWall(q) : Promise.resolve(null),
  ]);

  return (
    <CampaignPage
      initial={results ?? wall}
      initialQuery={q || undefined}
      heroLetters={wall.items}
      total={wall.total}
    />
  );
}
