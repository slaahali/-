import { normalizeArabic, stripTitles, tokenizeQuery } from "@/lib/text/normalize";

/**
 * Whether the raw query may be printed on the search preview image.
 *
 * Search is an AND of substring tokens, but tokenizeQuery keeps only the first
 * few tokens, so "ا ل م ن و ي <anything>" still matches letters while the tail
 * was never checked. Only draw q when every word took part in the match (and
 * isn't a lone letter), so the branded image can't be used to print arbitrary
 * text.
 */
export function isDrawableQuery(q: string): boolean {
  const words = new Set(stripTitles(normalizeArabic(q)).split(" ").filter(Boolean));
  if (words.size === 0) return false;
  const tokens = new Set(tokenizeQuery(q));
  for (const w of words) {
    if (!tokens.has(w) || Array.from(w).length < 2) return false;
  }
  return true;
}
