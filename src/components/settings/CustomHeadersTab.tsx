import { useState } from "react";
import type { CustomHeader } from "@/types/crawl";
import { Section, TextInput, Checkbox } from "./SettingsForm";

interface CustomHeadersTabProps {
  headers: CustomHeader[];
  onChange: (headers: CustomHeader[]) => void;
}

const PRESETS: { label: string; name: string; value: string }[] = [
  { label: "Authorization (Bearer)", name: "Authorization", value: "Bearer " },
  { label: "Accept-Language", name: "Accept-Language", value: "en-US,en;q=0.9" },
  { label: "Cookie", name: "Cookie", value: "" },
  { label: "X-Forwarded-For", name: "X-Forwarded-For", value: "" },
  { label: "Referer", name: "Referer", value: "" },
  { label: "Accept", name: "Accept", value: "text/html,application/xhtml+xml" },
];

const emptyHeader: CustomHeader = {
  name: "",
  value: "",
  enabled: true,
};

export function CustomHeadersTab({ headers, onChange }: CustomHeadersTabProps) {
  const [presetValue, setPresetValue] = useState("");

  const addHeader = () => {
    onChange([...headers, { ...emptyHeader }]);
  };

  const addPreset = (presetIdx: string) => {
    if (!presetIdx) return;
    const preset = PRESETS[Number(presetIdx)];
    if (preset) {
      onChange([...headers, { name: preset.name, value: preset.value, enabled: true }]);
    }
    setPresetValue("");
  };

  const updateHeader = (index: number, updates: Partial<CustomHeader>) => {
    const updated = headers.map((h, i) =>
      i === index ? { ...h, ...updates } : h
    );
    onChange(updated);
  };

  const removeHeader = (index: number) => {
    onChange(headers.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <Section
        title="Custom HTTP Headers"
        description="Add custom HTTP headers to all crawler requests. Useful for authentication, language targeting, or custom identification."
      >
        <div className="space-y-4">
          {headers.map((header, i) => (
            <div
              key={i}
              className="bg-surface-2 border border-surface-3 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <Checkbox
                  label="Enabled"
                  checked={header.enabled}
                  onChange={(v) => updateHeader(i, { enabled: v })}
                />
                <button
                  onClick={() => removeHeader(i)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <TextInput
                  label="Header Name"
                  value={header.name}
                  onChange={(v) => updateHeader(i, { name: v })}
                  placeholder="e.g. Authorization"
                  monospace
                />
                <TextInput
                  label="Header Value"
                  value={header.value}
                  onChange={(v) => updateHeader(i, { value: v })}
                  placeholder="e.g. Bearer token123"
                  monospace
                />
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <button
              onClick={addHeader}
              className="flex-1 py-2 border border-dashed border-surface-3 rounded-lg text-sm text-gray-400 hover:text-accent hover:border-accent transition-colors"
            >
              + Add Header
            </button>

            <select
              value={presetValue}
              onChange={(e) => addPreset(e.target.value)}
              className="bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-accent transition-colors"
            >
              <option value="">Add Preset...</option>
              {PRESETS.map((p, i) => (
                <option key={i} value={String(i)}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {headers.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-2">
              No custom headers defined. Headers will be sent with every request
              made by the crawler.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
