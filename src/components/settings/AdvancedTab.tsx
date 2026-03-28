import type { AdvancedConfig } from "@/types/crawl";
import { Section, Checkbox, NumberInput, Divider } from "./SettingsForm";

interface AdvancedTabProps {
  config: AdvancedConfig;
  onChange: (v: AdvancedConfig) => void;
}

export function AdvancedTab({ config, onChange }: AdvancedTabProps) {
  const set = <K extends keyof AdvancedConfig>(
    key: K,
    val: AdvancedConfig[K]
  ) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-6">
      <Section title="HTTP Settings">
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label="Response Timeout"
            value={config.response_timeout_seconds}
            onChange={(v) => set("response_timeout_seconds", v)}
            min={1}
            max={120}
            suffix="sec"
            description="Timeout for HTTP responses"
          />
          <NumberInput
            label="5xx Retry Count"
            value={config.retry_5xx}
            onChange={(v) => set("retry_5xx", v)}
            min={0}
            max={5}
            description="Retry server errors N times"
          />
        </div>
      </Section>

      <Divider />

      <Section title="Crawl Behavior">
        <div className="grid grid-cols-2 gap-2">
          <Checkbox
            label="Respect noindex"
            checked={config.respect_noindex}
            onChange={(v) => set("respect_noindex", v)}
            description="Mark noindex pages as non-indexable"
          />
          <Checkbox
            label="Respect canonical"
            checked={config.respect_canonical}
            onChange={(v) => set("respect_canonical", v)}
            description="Use canonical tag for indexability checks"
          />
          <Checkbox
            label="Always follow redirects"
            checked={config.always_follow_redirects}
            onChange={(v) => set("always_follow_redirects", v)}
            description="Follow 3xx redirects to final URL"
          />
          <Checkbox
            label="Crawl fragment identifiers"
            checked={config.crawl_fragment_identifiers}
            onChange={(v) => set("crawl_fragment_identifiers", v)}
            description="Treat URLs with #fragments as separate pages"
          />
          <Checkbox
            label="Store HTML source"
            checked={config.store_html}
            onChange={(v) => set("store_html", v)}
            description="Save full HTML of crawled pages (uses more storage)"
          />
        </div>
      </Section>

      <Divider />

      <Section
        title="SEO Thresholds"
        description="Character length thresholds for SEO warnings"
      >
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label="Title Min Length"
            value={config.title_min_length}
            onChange={(v) => set("title_min_length", v)}
            min={0}
            suffix="chars"
          />
          <NumberInput
            label="Title Max Length"
            value={config.title_max_length}
            onChange={(v) => set("title_max_length", v)}
            min={0}
            suffix="chars"
          />
          <NumberInput
            label="Description Min Length"
            value={config.description_min_length}
            onChange={(v) => set("description_min_length", v)}
            min={0}
            suffix="chars"
          />
          <NumberInput
            label="Description Max Length"
            value={config.description_max_length}
            onChange={(v) => set("description_max_length", v)}
            min={0}
            suffix="chars"
          />
          <NumberInput
            label="H1 Max Length"
            value={config.h1_max_length}
            onChange={(v) => set("h1_max_length", v)}
            min={0}
            suffix="chars"
          />
          <NumberInput
            label="Low Content Threshold"
            value={config.low_content_word_count}
            onChange={(v) => set("low_content_word_count", v)}
            min={0}
            suffix="words"
            description="Pages below this word count flagged as thin"
          />
          <NumberInput
            label="Max Image Size"
            value={config.max_image_size_kb}
            onChange={(v) => set("max_image_size_kb", v)}
            min={0}
            suffix="KB"
            description="Images above this threshold flagged as oversized"
          />
        </div>
      </Section>
    </div>
  );
}
