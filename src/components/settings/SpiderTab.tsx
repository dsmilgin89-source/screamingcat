import type { ResourceCrawlOptions, PageLinkOptions } from "@/types/crawl";
import { Section, Checkbox, Divider } from "./SettingsForm";

interface SpiderTabProps {
  resources: ResourceCrawlOptions;
  pageLinks: PageLinkOptions;
  onResourcesChange: (v: ResourceCrawlOptions) => void;
  onPageLinksChange: (v: PageLinkOptions) => void;
}

export function SpiderTab({
  resources,
  pageLinks,
  onResourcesChange,
  onPageLinksChange,
}: SpiderTabProps) {
  const setRes = (key: keyof ResourceCrawlOptions, val: boolean) =>
    onResourcesChange({ ...resources, [key]: val });
  const setPage = (key: keyof PageLinkOptions, val: boolean) =>
    onPageLinksChange({ ...pageLinks, [key]: val });

  return (
    <div className="space-y-6">
      <Section
        title="Resource Links"
        description="Which resource types to crawl and analyze"
      >
        <div className="grid grid-cols-2 gap-2">
          <Checkbox
            label="Check Images"
            checked={resources.check_images}
            onChange={(v) => setRes("check_images", v)}
            description="Crawl images and check for alt text, size"
          />
          <Checkbox
            label="Check CSS"
            checked={resources.check_css}
            onChange={(v) => setRes("check_css", v)}
            description="Crawl external stylesheets"
          />
          <Checkbox
            label="Check JavaScript"
            checked={resources.check_javascript}
            onChange={(v) => setRes("check_javascript", v)}
            description="Crawl external JavaScript files"
          />
          <Checkbox
            label="Check Media"
            checked={resources.check_media}
            onChange={(v) => setRes("check_media", v)}
            description="Crawl video, audio, and other media"
          />
        </div>
      </Section>

      <Divider />

      <Section
        title="Page Links"
        description="Which link types to discover and follow"
      >
        <div className="grid grid-cols-2 gap-2">
          <Checkbox
            label="Internal Hyperlinks"
            checked={pageLinks.internal_links}
            onChange={(v) => setPage("internal_links", v)}
          />
          <Checkbox
            label="External Links"
            checked={pageLinks.external_links}
            onChange={(v) => setPage("external_links", v)}
          />
          <Checkbox
            label="Canonicals"
            checked={pageLinks.canonicals}
            onChange={(v) => setPage("canonicals", v)}
          />
          <Checkbox
            label="Pagination (rel next/prev)"
            checked={pageLinks.pagination}
            onChange={(v) => setPage("pagination", v)}
          />
          <Checkbox
            label="Hreflang"
            checked={pageLinks.hreflang}
            onChange={(v) => setPage("hreflang", v)}
          />
          <Checkbox
            label="Meta Refresh"
            checked={pageLinks.meta_refresh}
            onChange={(v) => setPage("meta_refresh", v)}
          />
        </div>
      </Section>

      <Divider />

      <Section title="Crawl Scope">
        <div className="grid grid-cols-2 gap-2">
          <Checkbox
            label="Follow internal nofollow"
            checked={pageLinks.follow_internal_nofollow}
            onChange={(v) => setPage("follow_internal_nofollow", v)}
            description="Crawl internal links marked as nofollow"
          />
          <Checkbox
            label="Follow external nofollow"
            checked={pageLinks.follow_external_nofollow}
            onChange={(v) => setPage("follow_external_nofollow", v)}
            description="Crawl external links marked as nofollow"
          />
          <Checkbox
            label="Crawl outside start folder"
            checked={pageLinks.crawl_outside_start_folder}
            onChange={(v) => setPage("crawl_outside_start_folder", v)}
            description="Follow links to paths outside the start URL's directory"
          />
          <Checkbox
            label="Crawl all subdomains"
            checked={pageLinks.crawl_all_subdomains}
            onChange={(v) => setPage("crawl_all_subdomains", v)}
            description="Treat subdomains of the start domain as internal"
          />
          <Checkbox
            label="Crawl linked XML Sitemaps"
            checked={pageLinks.crawl_linked_sitemaps}
            onChange={(v) => setPage("crawl_linked_sitemaps", v)}
            description="Auto-discover and crawl URLs from XML sitemaps"
          />
        </div>
      </Section>
    </div>
  );
}
