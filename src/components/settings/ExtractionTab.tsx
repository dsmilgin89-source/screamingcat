import type { ExtractionConfig } from "@/types/crawl";
import { Section, Checkbox, Divider } from "./SettingsForm";

interface ExtractionTabProps {
  config: ExtractionConfig;
  onChange: (v: ExtractionConfig) => void;
}

export function ExtractionTab({ config, onChange }: ExtractionTabProps) {
  const set = (key: keyof ExtractionConfig, val: boolean) =>
    onChange({ ...config, [key]: val });

  return (
    <div className="space-y-6">
      <Section
        title="Page Details"
        description="What data to extract from each crawled page"
      >
        <div className="grid grid-cols-2 gap-2">
          <Checkbox
            label="Page Titles"
            checked={config.page_titles}
            onChange={(v) => set("page_titles", v)}
          />
          <Checkbox
            label="Meta Descriptions"
            checked={config.meta_descriptions}
            onChange={(v) => set("meta_descriptions", v)}
          />
          <Checkbox
            label="Meta Keywords"
            checked={config.meta_keywords}
            onChange={(v) => set("meta_keywords", v)}
          />
          <Checkbox
            label="H1 Headings"
            checked={config.h1}
            onChange={(v) => set("h1", v)}
          />
          <Checkbox
            label="H2 Headings"
            checked={config.h2}
            onChange={(v) => set("h2", v)}
          />
          <Checkbox
            label="Word Count"
            checked={config.word_count}
            onChange={(v) => set("word_count", v)}
          />
          <Checkbox
            label="Indexability"
            checked={config.indexability}
            onChange={(v) => set("indexability", v)}
          />
          <Checkbox
            label="Response Time"
            checked={config.response_time}
            onChange={(v) => set("response_time", v)}
          />
        </div>
      </Section>

      <Divider />

      <Section title="Directives & Structured Data">
        <div className="grid grid-cols-2 gap-2">
          <Checkbox
            label="Canonical URLs"
            checked={config.canonicals}
            onChange={(v) => set("canonicals", v)}
          />
          <Checkbox
            label="Meta Robots"
            checked={config.meta_robots}
            onChange={(v) => set("meta_robots", v)}
            description="noindex, nofollow, etc."
          />
          <Checkbox
            label="Open Graph Tags"
            checked={config.open_graph}
            onChange={(v) => set("open_graph", v)}
            description="og:title, og:description, og:image"
          />
          <Checkbox
            label="Twitter Cards"
            checked={config.twitter_cards}
            onChange={(v) => set("twitter_cards", v)}
            description="twitter:card, twitter:title"
          />
          <Checkbox
            label="Structured Data (JSON-LD)"
            checked={config.structured_data}
            onChange={(v) => set("structured_data", v)}
            description="Schema.org markup"
          />
        </div>
      </Section>
    </div>
  );
}
