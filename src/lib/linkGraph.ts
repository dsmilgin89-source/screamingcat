import type { CrawlResult, LinkInfo } from "@/types/crawl";

/**
 * Build a map of inlinks: target_url -> array of LinkInfo pointing to it
 */
export function buildInlinksMap(
  results: CrawlResult[]
): Map<string, LinkInfo[]> {
  const map = new Map<string, LinkInfo[]>();
  for (const r of results) {
    if (!r.outlinks) continue;
    for (const link of r.outlinks) {
      const existing = map.get(link.target_url);
      if (existing) {
        existing.push(link);
      } else {
        map.set(link.target_url, [link]);
      }
    }
  }
  return map;
}

/**
 * Get unique anchor texts for a URL from an inlinks map
 */
export function getUniqueAnchorTexts(
  inlinksMap: Map<string, LinkInfo[]>,
  url: string
): string[] {
  const links = inlinksMap.get(url) || [];
  const texts = new Set<string>();
  for (const l of links) {
    if (l.anchor_text.trim()) {
      texts.add(l.anchor_text.trim());
    }
  }
  return Array.from(texts);
}

/**
 * Get inlinks count for a URL
 */
export function getInlinksCount(
  inlinksMap: Map<string, LinkInfo[]>,
  url: string
): number {
  return (inlinksMap.get(url) || []).length;
}

/** Generic/non-descriptive anchor text patterns */
const GENERIC_ANCHORS = new Set([
  "click here",
  "read more",
  "learn more",
  "here",
  "more",
  "link",
  "this",
  "continue",
  "go",
  "see more",
  "view more",
  "details",
  "more info",
  "more details",
  "find out more",
  "kliknij tutaj",
  "więcej",
  "czytaj więcej",
  "szczegóły",
  "get started",
  "sign up",
  "download",
  "visit",
  "visit website",
  "website",
  "homepage",
  "view details",
  "info",
  "start",
  "begin",
  "explore",
  "discover",
  "see all",
  "view all",
  "browse",
  "check it out",
  "try it",
  "try now",
  "get it now",
  "buy now",
  "shop now",
  "order now",
]);

export function isGenericAnchorText(text: string): boolean {
  return GENERIC_ANCHORS.has(text.toLowerCase().trim());
}
