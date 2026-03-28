import { useState } from "react";
import type { RenderingConfig, RenderingMode } from "@/types/crawl";
import {
  Section,
  SelectInput,
  NumberInput,
  Checkbox,
  Divider,
} from "./SettingsForm";

interface RenderingTabProps {
  config: RenderingConfig;
  onChange: (v: RenderingConfig) => void;
}

// ── Resolution presets ──

interface ResolutionPreset {
  label: string;
  category: "desktop" | "tablet" | "mobile";
  width: number;
  height: number;
}

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  // Desktop — most popular worldwide
  { label: "1920 × 1080 (Full HD)", category: "desktop", width: 1920, height: 1080 },
  { label: "1366 × 768", category: "desktop", width: 1366, height: 768 },
  { label: "1536 × 864", category: "desktop", width: 1536, height: 864 },
  { label: "1440 × 900", category: "desktop", width: 1440, height: 900 },
  { label: "1280 × 720 (HD)", category: "desktop", width: 1280, height: 720 },
  { label: "1280 × 800", category: "desktop", width: 1280, height: 800 },
  { label: "1600 × 900", category: "desktop", width: 1600, height: 900 },
  { label: "2560 × 1440 (QHD)", category: "desktop", width: 2560, height: 1440 },
  { label: "3840 × 2160 (4K UHD)", category: "desktop", width: 3840, height: 2160 },
  // Tablet
  { label: "768 × 1024 (iPad)", category: "tablet", width: 768, height: 1024 },
  { label: "810 × 1080 (iPad 10th gen)", category: "tablet", width: 810, height: 1080 },
  { label: "820 × 1180 (iPad Air)", category: "tablet", width: 820, height: 1180 },
  { label: "1024 × 1366 (iPad Pro 12.9\")", category: "tablet", width: 1024, height: 1366 },
  { label: "800 × 1280 (Android tablet)", category: "tablet", width: 800, height: 1280 },
  // Mobile
  { label: "390 × 844 (iPhone 14)", category: "mobile", width: 390, height: 844 },
  { label: "393 × 852 (iPhone 15)", category: "mobile", width: 393, height: 852 },
  { label: "430 × 932 (iPhone 15 Pro Max)", category: "mobile", width: 430, height: 932 },
  { label: "375 × 812 (iPhone X/11 Pro)", category: "mobile", width: 375, height: 812 },
  { label: "414 × 896 (iPhone 11)", category: "mobile", width: 414, height: 896 },
  { label: "360 × 800 (Android)", category: "mobile", width: 360, height: 800 },
  { label: "412 × 915 (Samsung Galaxy)", category: "mobile", width: 412, height: 915 },
  { label: "360 × 780 (Android compact)", category: "mobile", width: 360, height: 780 },
];

const CATEGORY_LABELS: Record<string, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

function findPresetKey(w: number, h: number): string {
  const match = RESOLUTION_PRESETS.find((p) => p.width === w && p.height === h);
  return match ? `${match.width}x${match.height}` : "custom";
}

export function RenderingTab({ config, onChange }: RenderingTabProps) {
  const set = <K extends keyof RenderingConfig>(
    key: K,
    val: RenderingConfig[K]
  ) => onChange({ ...config, [key]: val });

  const isJs = config.rendering_mode === "javascript";

  const currentPresetKey = findPresetKey(config.viewport_width, config.viewport_height);
  const [isCustom, setIsCustom] = useState(currentPresetKey === "custom");

  const handlePresetChange = (key: string) => {
    if (key === "custom") {
      setIsCustom(true);
      return;
    }
    setIsCustom(false);
    const [w, h] = key.split("x").map(Number);
    onChange({ ...config, viewport_width: w, viewport_height: h });
  };

  return (
    <div className="space-y-6">
      <Section
        title="Rendering Mode"
        description="Choose how pages are processed during crawling"
      >
        <SelectInput<RenderingMode>
          label="Rendering"
          value={config.rendering_mode}
          onChange={(v) => set("rendering_mode", v)}
          options={[
            { value: "text_only", label: "Text Only" },
            { value: "javascript", label: "JavaScript" },
          ]}
          description="JavaScript mode renders pages in a headless browser before analysis"
        />
      </Section>

      {isJs && (
        <>
          <Divider />

          <Section
            title="JavaScript Settings"
            description="Configure the headless browser renderer"
          >
            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="AJAX Timeout"
                value={config.ajax_timeout_seconds}
                onChange={(v) => set("ajax_timeout_seconds", v)}
                min={1}
                max={30}
                suffix="sec"
                description="Wait time for JS execution after page load"
              />
            </div>
          </Section>

          <Divider />

          <Section
            title="Viewport"
            description="Select a device resolution or enter custom dimensions"
          >
            {/* Resolution preset selector */}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Preset</span>
              <select
                value={isCustom ? "custom" : currentPresetKey}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="bg-surface-2 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-100 w-full focus:outline-none focus:border-accent transition-colors"
              >
                {(["desktop", "tablet", "mobile"] as const).map((cat) => (
                  <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                    {RESOLUTION_PRESETS.filter((p) => p.category === cat).map(
                      (p) => (
                        <option
                          key={`${p.width}x${p.height}`}
                          value={`${p.width}x${p.height}`}
                        >
                          {p.label}
                        </option>
                      )
                    )}
                  </optgroup>
                ))}
                <optgroup label="Other">
                  <option value="custom">Custom...</option>
                </optgroup>
              </select>
            </label>

            {/* Custom dimensions — always visible so user can fine-tune */}
            <div className="grid grid-cols-2 gap-4 mt-3">
              <NumberInput
                label="Width"
                value={config.viewport_width}
                onChange={(v) => {
                  setIsCustom(true);
                  set("viewport_width", v);
                }}
                min={320}
                max={3840}
                suffix="px"
              />
              <NumberInput
                label="Height"
                value={config.viewport_height}
                onChange={(v) => {
                  setIsCustom(true);
                  set("viewport_height", v);
                }}
                min={320}
                max={2160}
                suffix="px"
              />
            </div>
          </Section>

          <Divider />

          <Section title="Storage">
            <Checkbox
              label="Store rendered HTML separately"
              checked={config.store_rendered_html}
              onChange={(v) => set("store_rendered_html", v)}
              description="Keep both raw and rendered HTML for comparison (uses more storage)"
            />
          </Section>

          <div className="p-3 bg-surface-2 rounded-lg border border-surface-3">
            <p className="text-xs text-gray-400">
              <span className="text-yellow-500 font-medium">Note:</span>{" "}
              JavaScript rendering requires a Chromium-based browser installed on
              your system (Chrome, Edge, Brave, Opera, Vivaldi, or Arc). Each page
              will be opened in a headless browser, which is significantly slower
              than text-only crawling. Recommended for sites with client-side
              rendered content (React, Angular, Vue).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
