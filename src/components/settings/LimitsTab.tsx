import type { CrawlLimits } from "@/types/crawl";
import { Section, NumberInput } from "./SettingsForm";

interface LimitsTabProps {
  limits: CrawlLimits;
  onChange: (v: CrawlLimits) => void;
}

export function LimitsTab({ limits, onChange }: LimitsTabProps) {
  const set = (key: keyof CrawlLimits, val: number) =>
    onChange({ ...limits, [key]: val });

  return (
    <div className="space-y-6">
      <Section
        title="Crawl Limits"
        description="Set to 0 for unlimited. Limits help control crawl scope on large sites."
      >
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label="Max Total URLs"
            value={limits.max_urls}
            onChange={(v) => set("max_urls", v)}
            min={0}
            description="Maximum number of URLs to crawl"
          />
          <NumberInput
            label="Max Crawl Depth"
            value={limits.max_depth}
            onChange={(v) => set("max_depth", v)}
            min={1}
            max={100}
            description="How many clicks deep to crawl"
          />
          <NumberInput
            label="Max Folder Depth"
            value={limits.max_folder_depth}
            onChange={(v) => set("max_folder_depth", v)}
            min={0}
            description="Max path segments (e.g. /a/b/c = 3)"
          />
          <NumberInput
            label="Max Query Strings"
            value={limits.max_query_strings}
            onChange={(v) => set("max_query_strings", v)}
            min={0}
            description="Max query params per URL to allow"
          />
        </div>
      </Section>

      <Section title="URL & Page Limits">
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label="Max Redirects to Follow"
            value={limits.max_redirects}
            onChange={(v) => set("max_redirects", v)}
            min={1}
            max={50}
            description="Stop following redirect chains after N hops"
          />
          <NumberInput
            label="Max URL Length"
            value={limits.max_url_length}
            onChange={(v) => set("max_url_length", v)}
            min={0}
            suffix="chars"
            description="Skip URLs longer than this"
          />
          <NumberInput
            label="Max Page Size"
            value={limits.max_page_size_kb}
            onChange={(v) => set("max_page_size_kb", v)}
            min={0}
            suffix="KB"
            description="Skip pages larger than this"
          />
          <NumberInput
            label="Max Links Per URL"
            value={limits.max_links_per_url}
            onChange={(v) => set("max_links_per_url", v)}
            min={0}
            description="Max outlinks to extract per page"
          />
        </div>
      </Section>
    </div>
  );
}
