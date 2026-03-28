import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SpeedConfig } from "@/types/crawl";
import { Section, NumberInput } from "./SettingsForm";

interface SpeedTabProps {
  speed: SpeedConfig;
  onChange: (v: SpeedConfig) => void;
}

export function SpeedTab({ speed, onChange }: SpeedTabProps) {
  const set = (key: keyof SpeedConfig, val: number) =>
    onChange({ ...speed, [key]: val });

  const [systemInfo, setSystemInfo] = useState<{ cpu_cores: number; suggested_threads: number } | null>(null);

  useEffect(() => {
    invoke<{ cpu_cores: number; suggested_threads: number }>("detect_system_info")
      .then(setSystemInfo)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <Section
        title="Crawl Speed"
        description="Balance between speed and server load. Be polite to servers — use reasonable limits."
      >
        {systemInfo && (
          <div className="mb-3 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-300">
            Detected: {systemInfo.cpu_cores} CPU cores — suggested threads: {systemInfo.suggested_threads}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4">
          <NumberInput
            label="Max Threads"
            value={speed.max_threads}
            onChange={(v) => set("max_threads", v)}
            min={0}
            max={50}
            description={`0 = auto-detect (CPU cores × 2${systemInfo ? ` = ${systemInfo.suggested_threads}` : ''}). Default: 8.`}
          />
          <NumberInput
            label="Max URLs / Second"
            value={speed.max_urls_per_second}
            onChange={(v) => set("max_urls_per_second", v)}
            min={0}
            max={100}
            description="Rate limit. 0 = no limit (only constrained by threads)."
          />
          <NumberInput
            label="Delay Between Requests"
            value={speed.delay_ms}
            onChange={(v) => set("delay_ms", v)}
            min={0}
            max={10000}
            suffix="ms"
            description="Wait time between requests. 0 = no delay."
          />
        </div>
      </Section>

      <div className="p-3 bg-surface-2 rounded-lg border border-surface-3">
        <p className="text-xs text-gray-400">
          <span className="text-warning font-medium">Tip:</span> For crawling
          your own sites, 8-16 threads with no delay is fine. For external
          sites, use 2-5 threads with 100-500ms delay to avoid being blocked.
        </p>
      </div>
    </div>
  );
}
