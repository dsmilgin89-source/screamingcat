import type { UserAgentConfig, UserAgentPreset } from "@/types/crawl";
import { USER_AGENT_PRESETS } from "@/types/crawl";
import { Section, SelectInput, TextInput } from "./SettingsForm";

interface UserAgentTabProps {
  config: UserAgentConfig;
  onChange: (v: UserAgentConfig) => void;
}

const PRESET_OPTIONS: { value: UserAgentPreset; label: string }[] = [
  { value: "screamingcat", label: "ScreamingCAT (Default)" },
  { value: "googlebot_desktop", label: "Googlebot (Desktop)" },
  { value: "googlebot_mobile", label: "Googlebot (Smartphone)" },
  { value: "bingbot", label: "Bingbot" },
  { value: "chrome_desktop", label: "Chrome Desktop" },
  { value: "firefox_desktop", label: "Firefox Desktop" },
  { value: "custom", label: "Custom" },
];

export function UserAgentTab({ config, onChange }: UserAgentTabProps) {
  const resolvedUA =
    config.preset === "custom"
      ? config.custom_ua
      : USER_AGENT_PRESETS[config.preset];

  return (
    <div className="space-y-6">
      <Section
        title="User-Agent"
        description="The User-Agent string sent with HTTP requests. Some sites serve different content based on this."
      >
        <SelectInput
          label="Preset"
          value={config.preset}
          onChange={(v) =>
            onChange({
              ...config,
              preset: v,
              custom_ua: v === "custom" ? config.custom_ua : "",
            })
          }
          options={PRESET_OPTIONS}
        />

        {config.preset === "custom" && (
          <TextInput
            label="Custom User-Agent"
            value={config.custom_ua}
            onChange={(v) => onChange({ ...config, custom_ua: v })}
            placeholder="Mozilla/5.0 ..."
            monospace
          />
        )}
      </Section>

      <div className="p-3 bg-surface-2 rounded-lg border border-surface-3">
        <p className="text-xs text-gray-500 mb-1">Active User-Agent:</p>
        <p className="text-xs text-gray-300 font-mono break-all">
          {resolvedUA || "Not set"}
        </p>
      </div>

      <div className="p-3 bg-surface-2 rounded-lg border border-surface-3">
        <p className="text-xs text-gray-400">
          <span className="text-info font-medium">Note:</span> Using Googlebot
          UA may trigger different server responses (e.g. cloaking). The
          Robots.txt tab controls which robots.txt rules are respected,
          independently of this setting.
        </p>
      </div>
    </div>
  );
}
