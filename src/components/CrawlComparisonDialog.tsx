import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import type { SnapshotMeta, CrawlComparison } from "@/types/crawl";

interface CrawlComparisonDialogProps {
  onClose: () => void;
  hasResults: boolean;
}

export function CrawlComparisonDialog({ onClose, hasResults }: CrawlComparisonDialogProps) {
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [comparison, setComparison] = useState<CrawlComparison | null>(null);
  const [expandedChanges, setExpandedChanges] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadSnapshots = useCallback(async () => {
    try {
      const list = await invoke<SnapshotMeta[]>("list_crawl_snapshots");
      setSnapshots(list);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const handleSave = async () => {
    if (!snapshotName.trim()) return;
    setError("");
    setLoading(true);
    try {
      await invoke("save_crawl_snapshot", { name: snapshotName.trim() });
      setSnapshotName("");
      await loadSnapshots();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await ask("Delete this snapshot?", { title: "Delete", kind: "warning" });
    if (!confirmed) return;
    setError("");
    try {
      await invoke("delete_crawl_snapshot", { id });
      await loadSnapshots();
      if (idA === id) setIdA("");
      if (idB === id) setIdB("");
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCompare = async () => {
    if (!idA || !idB) return;
    setError("");
    setLoading(true);
    setComparison(null);
    setExpandedChanges(new Set());
    try {
      const result = await invoke<CrawlComparison>("compare_crawl_snapshots", { idA, idB });
      setComparison(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleChange = (url: string) => {
    setExpandedChanges((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  // Group changed diffs by URL
  const changedByUrl = comparison
    ? comparison.changed.reduce<Record<string, CrawlComparison["changed"]>>((acc, diff) => {
        if (!acc[diff.url]) acc[diff.url] = [];
        acc[diff.url].push(diff);
        return acc;
      }, {})
    : {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-1 border border-surface-3 rounded-lg shadow-2xl w-[800px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-3">
          <h2 className="text-sm font-semibold text-gray-100">Compare Crawls</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-100 text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Error */}
          {error && (
            <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* Save Section */}
          <div>
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Save Snapshot
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Snapshot name..."
                className="flex-1 bg-surface-0 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={handleSave}
                disabled={!snapshotName.trim() || !hasResults || loading}
                className="px-3 py-1.5 text-xs font-medium rounded bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save Current Crawl
              </button>
            </div>
            {!hasResults && (
              <p className="text-xs text-gray-500 mt-1">Run a crawl first to save a snapshot.</p>
            )}
          </div>

          {/* Snapshots List */}
          <div>
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Saved Snapshots ({snapshots.length})
            </h3>
            {snapshots.length === 0 ? (
              <p className="text-xs text-gray-500">No snapshots saved yet.</p>
            ) : (
              <div className="border border-surface-3 rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-2 text-gray-400">
                      <th className="text-left px-3 py-1.5 font-medium">Name</th>
                      <th className="text-left px-3 py-1.5 font-medium">Domain</th>
                      <th className="text-right px-3 py-1.5 font-medium">URLs</th>
                      <th className="text-left px-3 py-1.5 font-medium">Date</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((s) => (
                      <tr key={s.id} className="border-t border-surface-3 hover:bg-surface-2/50">
                        <td className="px-3 py-1.5 text-gray-200">{s.name}</td>
                        <td className="px-3 py-1.5 text-gray-400">{s.domain}</td>
                        <td className="px-3 py-1.5 text-gray-300 text-right">{s.url_count}</td>
                        <td className="px-3 py-1.5 text-gray-400">
                          {new Date(s.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                            title="Delete snapshot"
                            aria-label="Delete snapshot"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Compare Section */}
          <div>
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Compare
            </h3>
            <div className="flex items-center gap-2">
              <select
                value={idA}
                onChange={(e) => setIdA(e.target.value)}
                className="flex-1 bg-surface-0 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
              >
                <option value="">Select Snapshot A</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.url_count} URLs)
                  </option>
                ))}
              </select>
              <span className="text-gray-500 text-xs">vs</span>
              <select
                value={idB}
                onChange={(e) => setIdB(e.target.value)}
                className="flex-1 bg-surface-0 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
              >
                <option value="">Select Snapshot B</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.url_count} URLs)
                  </option>
                ))}
              </select>
              <button
                onClick={handleCompare}
                disabled={!idA || !idB || idA === idB || loading}
                className="px-3 py-1.5 text-xs font-medium rounded bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Compare
              </button>
            </div>
            {idA && idB && idA === idB && (
              <p className="text-xs text-yellow-400 mt-1">Select two different snapshots to compare.</p>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-4">
              <span className="text-xs text-gray-400">Loading...</span>
            </div>
          )}

          {/* Results */}
          {comparison && !loading && (
            <div>
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Results
              </h3>

              {/* Summary */}
              <div className="flex gap-3 mb-3">
                <span className="text-xs px-2 py-1 rounded bg-green-500/10 border border-green-500/20 text-green-400">
                  +{comparison.added_urls.length} added
                </span>
                <span className="text-xs px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400">
                  -{comparison.removed_urls.length} removed
                </span>
                <span className="text-xs px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                  ~{Object.keys(changedByUrl).length} changed
                </span>
              </div>

              {comparison.added_urls.length === 0 &&
                comparison.removed_urls.length === 0 &&
                comparison.changed.length === 0 && (
                  <p className="text-xs text-gray-500">No differences found.</p>
                )}

              {/* Added URLs */}
              {comparison.added_urls.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-green-400 mb-1">Added URLs</h4>
                  <div className="bg-surface-0 border border-surface-3 rounded max-h-40 overflow-y-auto">
                    {comparison.added_urls.map((url) => (
                      <div
                        key={url}
                        className="px-3 py-1 text-xs text-green-300 border-b border-surface-3 last:border-b-0 truncate"
                        title={url}
                      >
                        + {url}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Removed URLs */}
              {comparison.removed_urls.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-medium text-red-400 mb-1">Removed URLs</h4>
                  <div className="bg-surface-0 border border-surface-3 rounded max-h-40 overflow-y-auto">
                    {comparison.removed_urls.map((url) => (
                      <div
                        key={url}
                        className="px-3 py-1 text-xs text-red-300 border-b border-surface-3 last:border-b-0 truncate"
                        title={url}
                      >
                        - {url}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Changed URLs */}
              {Object.keys(changedByUrl).length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-yellow-400 mb-1">Changed URLs</h4>
                  <div className="bg-surface-0 border border-surface-3 rounded max-h-60 overflow-y-auto">
                    {Object.entries(changedByUrl).map(([url, diffs]) => (
                      <div key={url} className="border-b border-surface-3 last:border-b-0">
                        <button
                          onClick={() => toggleChange(url)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-yellow-300 hover:bg-surface-2/50 transition-colors"
                        >
                          <span className="text-gray-500">
                            {expandedChanges.has(url) ? "▼" : "▶"}
                          </span>
                          <span className="truncate flex-1 text-left" title={url}>
                            ~ {url}
                          </span>
                          <span className="text-gray-500 shrink-0">
                            {diffs.length} {diffs.length === 1 ? "change" : "changes"}
                          </span>
                        </button>
                        {expandedChanges.has(url) && (
                          <div className="px-6 pb-2 space-y-1">
                            {diffs.map((d, i) => (
                              <div key={i} className="text-xs">
                                <span className="text-gray-400 font-medium">{d.field}:</span>
                                <div className="ml-2 flex flex-col gap-0.5">
                                  <span className="text-red-400 truncate" title={d.old_value}>
                                    - {d.old_value || "(empty)"}
                                  </span>
                                  <span className="text-green-400 truncate" title={d.new_value}>
                                    + {d.new_value || "(empty)"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-surface-3">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded bg-surface-2 text-gray-300 border border-surface-3 hover:bg-surface-3 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
