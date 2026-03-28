import type { CrawlResult } from "@/types/crawl";

export function generateXmlSitemap(results: CrawlResult[]): string {
  const indexable = results.filter(
    (r) =>
      r.indexable &&
      r.status_code >= 200 &&
      r.status_code < 300 &&
      r.content_type.includes("text/html")
  );

  const urls = indexable
    .map(
      (r) =>
        `  <url>\n    <loc>${escapeXml(r.url)}</loc>\n  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
