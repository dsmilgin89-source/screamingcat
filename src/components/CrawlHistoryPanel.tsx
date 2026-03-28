import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import type { SnapshotMeta, StorageConfig, CrawlComparison } from "@/types/crawl";

interface CrawlHistoryPanelProps {
  onClose: () => void;
  storageConfig: StorageConfig;
  hasResults: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatDelta({ label, a, b }: { label: string; a: number; b: number }) {
  const delta = b - a;
  if (delta === 0) return null;
  const color = delta > 0 ? "text-green-400" : "text-red-400";
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`text-xs ${color}`} title={label}>
      {sign}{delta}
    </span>
  );
}

export function CrawlHistoryPanel({ onClose, storageConfig, hasResults }: CrawlHistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<[string | null, string | null]>([null, null]);
  const [comparison, setComparison] = useState<CrawlComparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [view, setView] = useState<"history" | "compare">("history");

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<SnapshotMeta[]>("list_crawl_snapshots", { storageConfig });
      setSnapshots(result);
    } catch (e) {
      console.error("Failed to load snapshots:", e);
    }
    setLoading(false);
  }, [storageConfig]);

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      await invoke("save_crawl_snapshot", { name: saveName.trim(), storageConfig });
      setSaveName("");
      loadSnapshots();
    } catch (e) {
      console.error("Failed to save snapshot:", e);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await ask(`Delete snapshot "${name}"?`, { title: "Delete Snapshot", kind: "warning" });
    if (!confirmed) return;
    try {
      await invoke("delete_crawl_snapshot", { id, storageConfig });
      loadSnapshots();
    } catch (e) {
      console.error("Failed to delete snapshot:", e);
    }
  };

  const handleCompare = async () => {
    const [idA, idB] = compareIds;
    if (!idA || !idB || idA === idB) return;
    setComparing(true);
    try {
      const result = await invoke<CrawlComparison>("compare_crawl_snapshots", {
        idA, idB, storageConfig
      });
      setComparison(result);
    } catch (e) {
      console.error("Failed to compare snapshots:", e);
    }
    setComparing(false);
  };

  // Group snapshots by domain with counts
  const domainCounts = new Map<string, number>();
  snapshots.forEach((s) => domainCounts.set(s.domain, (domainCounts.get(s.domain) || 0) + 1));
  const domains = Array.from(domainCounts.keys()).sort();
  const totalSnapshotCount = snapshots.length;
  const filteredSnapshots = selectedDomain
    ? snapshots.filter((s) => s.domain === selectedDomain)
    : snapshots;
  const sortedSnapshots = [...filteredSnapshots].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-surface-1 border border-surface-3 rounded-xl shadow-2xl w-[950px] h-[650px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-3">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-gray-200">Crawl History</h2>
            <div className="flex bg-surface-2 rounded-md p-0.5">
              <button
                onClick={() => setView("history")}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  view === "history" ? "bg-accent/20 text-accent" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                History
              </button>
              <button
                onClick={() => setView("compare")}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  view === "compare" ? "bg-accent/20 text-accent" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Compare
              </button>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close crawl history" className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>

        {/* Save bar */}
        <div className="px-5 py-2.5 border-b border-surface-3 flex items-center gap-3">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Snapshot name..."
            className="flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-surface-3 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={handleSave}
            disabled={saving || !saveName.trim() || !hasResults}
            className="px-4 py-1.5 text-xs font-medium bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save Snapshot"}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {view === "history" ? (
            <HistoryView
              snapshots={sortedSnapshots}
              domains={domains}
              domainCounts={domainCounts}
              totalCount={totalSnapshotCount}
              selectedDomain={selectedDomain}
              onSelectDomain={setSelectedDomain}
              onDelete={handleDelete}
              loading={loading}
            />
          ) : (
            <CompareView
              snapshots={snapshots}
              compareIds={compareIds}
              onChangeIds={setCompareIds}
              onCompare={handleCompare}
              comparison={comparison}
              comparing={comparing}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryView({
  snapshots,
  domains,
  domainCounts,
  totalCount,
  selectedDomain,
  onSelectDomain,
  onDelete,
  loading,
}: {
  snapshots: SnapshotMeta[];
  domains: string[];
  domainCounts: Map<string, number>;
  totalCount: number;
  selectedDomain: string | null;
  onSelectDomain: (d: string | null) => void;
  onDelete: (id: string, name: string) => void;
  loading: boolean;
}) {
  return (
    <>
      {/* Domain sidebar */}
      <div className="w-52 border-r border-surface-3 overflow-y-auto shrink-0">
        <div className="p-2">
          <button
            onClick={() => onSelectDomain(null)}
            className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors flex items-center justify-between ${
              !selectedDomain ? "bg-accent/20 text-accent" : "text-gray-400 hover:text-gray-200 hover:bg-surface-2"
            }`}
          >
            <span>All Domains</span>
            <span className="bg-surface-3 px-1.5 py-0.5 rounded text-[10px] font-mono">{totalCount}</span>
          </button>
          {domains.map((d) => (
            <button
              key={d}
              onClick={() => onSelectDomain(d)}
              className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors flex items-center justify-between gap-1 ${
                selectedDomain === d ? "bg-accent/20 text-accent" : "text-gray-400 hover:text-gray-200 hover:bg-surface-2"
              }`}
              title={d}
            >
              <span className="truncate">{d || "Unknown"}</span>
              <span className="bg-surface-3 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0">{domainCounts.get(d) || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Snapshots table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">Loading...</div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <svg className="w-10 h-10 mb-3 opacity-30" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
            </svg>
            <span className="text-sm">No snapshots yet</span>
            <span className="text-xs mt-1">Save your first crawl snapshot above</span>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-1 border-b border-surface-3">
              <tr className="text-gray-500">
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Domain</th>
                <th className="text-right px-3 py-2 font-medium">URLs</th>
                <th className="text-right px-3 py-2 font-medium">2xx</th>
                <th className="text-right px-3 py-2 font-medium">3xx</th>
                <th className="text-right px-3 py-2 font-medium">4xx</th>
                <th className="text-right px-3 py-2 font-medium">5xx</th>
                <th className="text-right px-3 py-2 font-medium">Avg ms</th>
                <th className="text-right px-3 py-2 font-medium">Indexable</th>
                <th className="text-right px-3 py-2 font-medium">Size</th>
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap, i) => {
                const prev = snapshots[i + 1]; // next in time order (older)
                return (
                  <tr key={snap.id} className="border-b border-surface-3/50 hover:bg-surface-2/50 transition-colors">
                    <td className="px-3 py-2 text-gray-200 font-medium max-w-[140px] truncate" title={snap.name}>
                      {snap.name}
                    </td>
                    <td className="px-3 py-2 text-gray-400 max-w-[120px] truncate" title={snap.domain}>
                      {snap.domain}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">
                      {snap.url_count}
                      {prev && prev.domain === snap.domain && <> <StatDelta label="URLs" a={prev.url_count} b={snap.url_count} /></>}
                    </td>
                    <td className="px-3 py-2 text-right text-green-400">{snap.status_2xx || "-"}</td>
                    <td className="px-3 py-2 text-right text-yellow-400">{snap.status_3xx || "-"}</td>
                    <td className="px-3 py-2 text-right text-red-400">{snap.status_4xx || "-"}</td>
                    <td className="px-3 py-2 text-right text-red-500">{snap.status_5xx || "-"}</td>
                    <td className="px-3 py-2 text-right text-gray-400">{snap.avg_response_ms || "-"}</td>
                    <td className="px-3 py-2 text-right text-gray-300">
                      {snap.indexable_count || "-"}
                      {prev && prev.domain === snap.domain && <> <StatDelta label="Indexable" a={prev.indexable_count} b={snap.indexable_count} /></>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{formatBytes(snap.size_bytes)}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(snap.created_at)}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => onDelete(snap.id, snap.name)}
                        className="text-gray-600 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function CompareView({
  snapshots,
  compareIds,
  onChangeIds,
  onCompare,
  comparison,
  comparing,
}: {
  snapshots: SnapshotMeta[];
  compareIds: [string | null, string | null];
  onChangeIds: (ids: [string | null, string | null]) => void;
  onCompare: () => void;
  comparison: CrawlComparison | null;
  comparing: boolean;
}) {
  const sorted = [...snapshots].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const snapA = snapshots.find((s) => s.id === compareIds[0]);
  const snapB = snapshots.find((s) => s.id === compareIds[1]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Selectors */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-gray-400 mb-1 block">Snapshot A (baseline)</label>
          <select
            value={compareIds[0] || ""}
            onChange={(e) => onChangeIds([e.target.value || null, compareIds[1]])}
            className="w-full px-3 py-2 text-sm bg-surface-2 border border-surface-3 rounded text-gray-200 focus:outline-none focus:border-accent/50"
          >
            <option value="">Select...</option>
            {sorted.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.domain} ({s.url_count} URLs, {formatDate(s.created_at)})
              </option>
            ))}
          </select>
        </div>
        <div className="text-gray-500 text-lg pb-2">vs</div>
        <div className="flex-1">
          <label className="text-xs text-gray-400 mb-1 block">Snapshot B (current)</label>
          <select
            value={compareIds[1] || ""}
            onChange={(e) => onChangeIds([compareIds[0], e.target.value || null])}
            className="w-full px-3 py-2 text-sm bg-surface-2 border border-surface-3 rounded text-gray-200 focus:outline-none focus:border-accent/50"
          >
            <option value="">Select...</option>
            {sorted.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.domain} ({s.url_count} URLs, {formatDate(s.created_at)})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onCompare}
          disabled={comparing || !compareIds[0] || !compareIds[1] || compareIds[0] === compareIds[1]}
          className="px-4 py-2 text-xs font-medium bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {comparing ? "Comparing..." : "Compare"}
        </button>
      </div>

      {/* Stats comparison */}
      {snapA && snapB && (
        <div className="grid grid-cols-6 gap-2 text-center">
          {([
            ["URLs", snapA.url_count, snapB.url_count],
            ["2xx", snapA.status_2xx, snapB.status_2xx],
            ["4xx", snapA.status_4xx, snapB.status_4xx],
            ["Avg ms", snapA.avg_response_ms, snapB.avg_response_ms],
            ["Indexable", snapA.indexable_count, snapB.indexable_count],
            ["Words", snapA.total_word_count, snapB.total_word_count],
          ] as [string, number, number][]).map(([label, a, b]) => (
            <div key={label} className="bg-surface-2 rounded p-2 border border-surface-3">
              <div className="text-[10px] text-gray-500 mb-1">{label}</div>
              <div className="flex justify-center gap-2 text-xs">
                <span className="text-gray-400">{a}</span>
                <span className="text-gray-600">&rarr;</span>
                <span className="text-gray-200">{b}</span>
                {a !== b && <StatDelta label={label} a={a} b={b} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comparison results */}
      {comparison && (
        <div className="space-y-3">
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20">
              +{comparison.added_urls.length} added
            </span>
            <span className="px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20">
              -{comparison.removed_urls.length} removed
            </span>
            <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
              ~{comparison.changed.length} changed
            </span>
          </div>

          {comparison.added_urls.length > 0 && (
            <details className="group">
              <summary className="text-xs text-green-400 cursor-pointer hover:text-green-300 select-none">
                Added URLs ({comparison.added_urls.length})
              </summary>
              <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                {comparison.added_urls.map((url) => (
                  <div key={url} className="text-xs text-gray-400 pl-4 truncate">{url}</div>
                ))}
              </div>
            </details>
          )}

          {comparison.removed_urls.length > 0 && (
            <details className="group">
              <summary className="text-xs text-red-400 cursor-pointer hover:text-red-300 select-none">
                Removed URLs ({comparison.removed_urls.length})
              </summary>
              <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5">
                {comparison.removed_urls.map((url) => (
                  <div key={url} className="text-xs text-gray-400 pl-4 truncate line-through">{url}</div>
                ))}
              </div>
            </details>
          )}

          {comparison.changed.length > 0 && (
            <details className="group">
              <summary className="text-xs text-yellow-400 cursor-pointer hover:text-yellow-300 select-none">
                Changed Fields ({comparison.changed.length})
              </summary>
              <div className="mt-1 max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-1">
                    <tr className="text-gray-500">
                      <th className="text-left px-2 py-1">URL</th>
                      <th className="text-left px-2 py-1">Field</th>
                      <th className="text-left px-2 py-1">Old</th>
                      <th className="text-left px-2 py-1">New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.changed.map((diff, i) => (
                      <tr key={i} className="border-t border-surface-3/30">
                        <td className="px-2 py-1 text-gray-400 max-w-[200px] truncate" title={diff.url}>{diff.url}</td>
                        <td className="px-2 py-1 text-gray-300">{diff.field}</td>
                        <td className="px-2 py-1 text-red-400 max-w-[150px] truncate" title={diff.old_value}>{diff.old_value}</td>
                        <td className="px-2 py-1 text-green-400 max-w-[150px] truncate" title={diff.new_value}>{diff.new_value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
