import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import type { StorageConfig, StorageStats } from "@/types/crawl";
import { Section, NumberInput, Checkbox } from "./SettingsForm";

interface StorageTabProps {
  config: StorageConfig;
  onChange: (v: StorageConfig) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function StorageTab({ config, onChange }: StorageTabProps) {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const set = <K extends keyof StorageConfig>(key: K, val: StorageConfig[K]) =>
    onChange({ ...config, [key]: val });

  useEffect(() => {
    invoke<StorageStats>("get_storage_stats", { storageConfig: config })
      .then(setStats)
      .catch(() => {});
  }, [config.custom_path]);

  const [cleanupMsg, setCleanupMsg] = useState("");

  const handleCleanup = async () => {
    if (config.retention_days === 0 && config.max_snapshots === 0) {
      setCleanupMsg("Set retention days or max snapshots first to define cleanup rules.");
      return;
    }
    setCleaning(true);
    setCleanupMsg("");
    try {
      const removed = await invoke<number>("cleanup_snapshots", { storageConfig: config });
      if (removed > 0) {
        const updated = await invoke<StorageStats>("get_storage_stats", { storageConfig: config });
        setStats(updated);
        setCleanupMsg(`Removed ${removed} snapshot${removed > 1 ? "s" : ""}.`);
      } else {
        setCleanupMsg("Nothing to clean up — all snapshots are within retention limits.");
      }
    } catch (e) {
      setCleanupMsg("Cleanup failed: " + String(e));
    }
    setCleaning(false);
  };

  return (
    <div className="space-y-6">
      <Section
        title="Storage Location"
        description="Where crawl snapshots and history are saved."
      >
        <div className="space-y-2">
          <label className="block text-xs text-gray-400">Custom Path (empty = default)</label>
          <input
            type="text"
            value={config.custom_path}
            onChange={(e) => set("custom_path", e.target.value)}
            placeholder={stats?.storage_path || "Default app data directory"}
            className="w-full px-3 py-2 text-sm bg-surface-2 border border-surface-3 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent/50"
          />
          {stats && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500 flex-1 truncate">
                Current: {stats.storage_path}
              </p>
              <button
                onClick={() => open(stats.storage_path)}
                className="shrink-0 px-3 py-1 text-xs bg-surface-2 border border-surface-3 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors flex items-center gap-1.5"
                title="Open in file explorer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                Open Folder
              </button>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Retention Policy"
        description="Control how long snapshots are kept."
      >
        <div className="grid grid-cols-2 gap-4">
          <NumberInput
            label="Retention (days)"
            value={config.retention_days}
            onChange={(v) => set("retention_days", v)}
            min={0}
            max={3650}
            description="0 = keep forever"
          />
          <NumberInput
            label="Max Snapshots"
            value={config.max_snapshots}
            onChange={(v) => set("max_snapshots", v)}
            min={0}
            max={10000}
            description="0 = unlimited"
          />
        </div>
      </Section>

      <Section title="Automation">
        <Checkbox
          label="Auto-save snapshot after each crawl"
          checked={config.auto_save}
          onChange={(v) => set("auto_save", v)}
          description="Automatically create a snapshot when a crawl completes."
        />
      </Section>

      {stats && (
        <Section title="Storage Statistics">
          <div className="bg-surface-2 rounded-lg border border-surface-3 p-4 space-y-3">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-gray-200">{stats.total_snapshots}</div>
                <div className="text-xs text-gray-500">Snapshots</div>
              </div>
              <div>
                <div className="text-lg font-bold text-gray-200">{formatBytes(stats.total_size_bytes)}</div>
                <div className="text-xs text-gray-500">Total Size</div>
              </div>
              <div>
                <div className="text-lg font-bold text-gray-200">{stats.domains.length}</div>
                <div className="text-xs text-gray-500">Domains</div>
              </div>
            </div>

            {stats.domains.length > 0 && (
              <div className="border-t border-surface-3 pt-3">
                <div className="text-xs text-gray-400 mb-2">By Domain</div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {stats.domains.map((d) => (
                    <div key={d.domain} className="flex justify-between text-xs">
                      <span className="text-gray-300 truncate">{d.domain || "Unknown"}</span>
                      <span className="text-gray-500 shrink-0 ml-2">
                        {d.snapshot_count} snapshots &middot; {formatBytes(d.total_size_bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-surface-3 pt-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">
                  {stats.oldest_snapshot && `Oldest: ${new Date(stats.oldest_snapshot).toLocaleDateString()}`}
                </span>
                <button
                  onClick={handleCleanup}
                  disabled={cleaning}
                  className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {cleaning ? "Cleaning..." : "Run Cleanup Now"}
                </button>
              </div>
              {cleanupMsg && (
                <p className="text-xs text-gray-400">{cleanupMsg}</p>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
