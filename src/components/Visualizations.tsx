import { useState, useMemo } from "react";
import type { CrawlResult } from "@/types/crawl";
import { HierarchyView } from "./visualizations/HierarchyView";
import { LinkGraph } from "./visualizations/LinkGraph";
import { SankeyDiagram } from "./visualizations/SankeyDiagram";

// ── Props & Tabs ──

interface VisualizationsProps {
  results: CrawlResult[];
  onUrlClick?: (url: string) => void;
}

type VisTab = "tree" | "graph" | "depth";

const VIS_TABS: { id: VisTab; label: string }[] = [
  { id: "tree", label: "Crawl Tree" },
  { id: "graph", label: "Site Graph" },
  { id: "depth", label: "Crawl Depth" },
];

/** Content types that are page-like (shown in visualizations like Screaming Frog) */
function isPageResult(r: CrawlResult): boolean {
  const ct = (r.content_type || "").toLowerCase();
  return ct.includes("text/html") || ct === "" || r.status_code === 0;
}

export function Visualizations({ results, onUrlClick }: VisualizationsProps) {
  const [activeTab, setActiveTab] = useState<VisTab>("tree");

  // Filter out images, CSS, JS, fonts, media — show only HTML pages (like Screaming Frog)
  const pageResults = useMemo(() => results.filter(isPageResult), [results]);

  return (
    <div className="flex flex-col h-full w-full bg-surface-0">
      {/* Header with title and tab switcher */}
      <div className="flex items-center bg-surface-1 border-b border-surface-3">
        <span className="px-4 py-2 text-sm font-medium text-gray-200">
          Visualizations
        </span>
        <div className="flex items-center ml-auto">
          {VIS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-accent text-accent bg-surface-0/50"
                  : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-surface-2/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "tree" && (
          <HierarchyView results={pageResults} onUrlClick={onUrlClick} />
        )}
        {activeTab === "graph" && (
          <LinkGraph results={pageResults} onUrlClick={onUrlClick} />
        )}
        {activeTab === "depth" && <SankeyDiagram results={pageResults} />}
      </div>
    </div>
  );
}
