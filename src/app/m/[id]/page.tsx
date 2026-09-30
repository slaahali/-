import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CampaignPage } from "@/components/CampaignPage";
import { COPY } from "@/lib/config";
import { getInitialWall, getPublicMessage, getSceneLetters } from "@/lib/data";
import { displayTo, excerpt } from "@/lib/format";

// generateMetadata and the page both need the letter: one lookup per request.
const loadMessage = cache(getPublicMessage);

export async function generateMetadata({ params }: PageProps<"/m/[id]">): Promise<Metadata> {
  const { id } = await params;
  const message = await loadMessage(id);
  if (!message) notFound();

  const to = displayTo(message);
  const title = `${
    message.inMemory ? COPY.memoryShareText(to) : COPY.shareTitle(to)
  } | ${COPY.brand}`;
  const description = excerpt(message.body, 150);
  const url = `/m/${message.id}`;
  const image = `/api/og/${message.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      locale: "ar_SA",
      siteName: COPY.brand,
      url,
      title,
      description,
      publishedTime: message.createdAt,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function LetterPage({ params }: PageProps<"/m/[id]">) {
  const { id } = await params;
  const [message, wall, heroLetters] = await Promise.all([
    loadMessage(id),
    getInitialWall(),
    getSceneLetters(),
  ]);
  if (!message) notFound();

  return (
    <CampaignPage
      initial={wall}
      heroLetters={heroLetters}
      initialOpen={message}
      total={wall.total}
    />
  );
}
