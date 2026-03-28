import { useState, useRef } from "react";
import type { CrawlConfig } from "@/types/crawl";
import { invoke } from "@tauri-apps/api/core";

interface ListModeDialogProps {
  config: CrawlConfig;
  onClose: () => void;
  onStarted: () => void;
}

export function ListModeDialog({ config, onClose, onStarted }: ListModeDialogProps) {
  const [urlText, setUrlText] = useState("");
  const [discoverLinks, setDiscoverLinks] = useState(true);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseUrls = (text: string): string[] => {
    return text
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        // Handle CSV: take the first column if it contains commas
        const parts = line.split(",");
        let url = parts[0].trim().replace(/^["']|["']$/g, "");
        if (!url.startsWith("http")) {
          url = "https://" + url;
        }
        return url;
      });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setUrlText((prev) => (prev ? prev + "\n" + text : text));
    };
    reader.readAsText(file);
    // Reset the input so the same file can be re-selected
    e.target.value = "";
  };

  const handleStart = async () => {
    const urls = parseUrls(urlText);
    if (urls.length === 0) {
      setError("Please enter at least one valid URL.");
      return;
    }
    setError("");

    try {
      // If not discovering links, set max_depth to 0
      const crawlConfig = discoverLinks
        ? config
        : { ...config, limits: { ...config.limits, max_depth: 0 } };
      await invoke("start_crawl_list", { urls, config: crawlConfig });
      onStarted();
      onClose();
    } catch (err) {
      setError(String(err));
    }
  };

  const urlCount = parseUrls(urlText).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-surface-1 border border-surface-3 rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-3 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">
              List / Batch Mode
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Crawl a specific list of URLs instead of discovering them
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              URLs (one per line)
            </label>
            <textarea
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              placeholder={"https://example.com/page1\nhttps://example.com/page2\nhttps://example.com/page3"}
              className="w-full h-48 bg-surface-0 border border-surface-3 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 font-mono focus:outline-none focus:border-accent transition-colors resize-y"
            />
            <p className="text-xs text-gray-500 mt-1">
              {urlCount > 0
                ? `${urlCount} URL${urlCount !== 1 ? "s" : ""} detected`
                : "Paste URLs or upload a file"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-sm bg-surface-2 border border-surface-3 rounded-lg text-gray-300 hover:text-gray-100 hover:bg-surface-3 transition-colors"
            >
              Upload .txt / .csv
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={discoverLinks}
              onChange={(e) => setDiscoverLinks(e.target.checked)}
              className="rounded border-surface-3 bg-surface-2 text-accent focus:ring-accent/30 cursor-pointer"
            />
            <span className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">
              Discover links from listed pages
            </span>
          </label>
          <p className="text-xs text-gray-500 -mt-2 ml-7">
            When disabled, only the listed URLs will be crawled (no link
            discovery).
          </p>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-surface-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={urlCount === 0}
            className="bg-accent hover:bg-accent-hover text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Crawl ({urlCount} URL{urlCount !== 1 ? "s" : ""})
          </button>
        </div>
      </div>
    </div>
  );
}
