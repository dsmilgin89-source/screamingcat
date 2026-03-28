import type { RobotsConfig, RobotsMode } from "@/types/crawl";
import { Section, SelectInput, Checkbox, Divider } from "./SettingsForm";

interface RobotsTabProps {
  config: RobotsConfig;
  onChange: (v: RobotsConfig) => void;
}

const MODE_OPTIONS: { value: RobotsMode; label: string }[] = [
  { value: "respect", label: "Respect robots.txt" },
  { value: "ignore", label: "Ignore robots.txt" },
  {
    value: "ignore_but_report",
    label: "Ignore robots.txt but report status",
  },
];

export function RobotsTab({ config, onChange }: RobotsTabProps) {
  const set = <K extends keyof RobotsConfig>(key: K, val: RobotsConfig[K]) =>
    onChange({ ...config, [key]: val });

  return (
    <div className="space-y-6">
      <Section
        title="Robots.txt Handling"
        description="How the crawler should treat robots.txt directives"
      >
        <SelectInput
          label="Mode"
          value={config.mode}
          onChange={(v) => set("mode", v)}
          options={MODE_OPTIONS}
          description={
            config.mode === "respect"
              ? "URLs blocked by robots.txt will not be crawled."
              : config.mode === "ignore"
                ? "Robots.txt will be completely ignored. All URLs will be crawled."
                : "URLs will be crawled regardless, but blocked status will be flagged."
          }
        />
      </Section>

      <Divider />

      <Section title="Reporting">
        <Checkbox
          label="Show internal URLs blocked by robots.txt"
          checked={config.show_blocked_internal}
          onChange={(v) => set("show_blocked_internal", v)}
          description="Include blocked internal URLs in results (flagged as blocked)"
        />
        <Checkbox
          label="Show external URLs blocked by robots.txt"
          checked={config.show_blocked_external}
          onChange={(v) => set("show_blocked_external", v)}
          description="Include blocked external URLs in results"
        />
      </Section>

      {config.mode === "ignore" && (
        <div className="p-3 bg-yellow-900/20 rounded-lg border border-yellow-700/30">
          <p className="text-xs text-yellow-400">
            <span className="font-medium">Warning:</span> Ignoring robots.txt
            may crawl areas that the site owner has intentionally blocked.
            Only use this on your own sites or with explicit permission.
          </p>
        </div>
      )}
    </div>
  );
}
