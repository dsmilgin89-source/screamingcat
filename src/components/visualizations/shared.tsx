import { useState, useEffect } from "react";
import type { CrawlResult } from "@/types/crawl";

// ── Shared Config Types ──

export type NodeColorMode = "indexability" | "status_code" | "content_type";
export type NodeScaleMetric = "crawl_depth" | "internal_links" | "word_count";
export type LayoutDirection = "LR" | "TB" | "RL" | "BT";
export type LabelMode = "always" | "hover" | "auto";

export interface VisConfig {
  nodeColor: NodeColorMode;
  nodeScale: NodeScaleMetric;
  layoutDirection: LayoutDirection;
  showLabels: LabelMode;
  showEdges: boolean;
}

export const DEFAULT_VIS_CONFIG: VisConfig = {
  nodeColor: "indexability",
  nodeScale: "crawl_depth",
  layoutDirection: "LR",
  showLabels: "auto",
  showEdges: true,
};

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeUrl: string | null;
}

export const INITIAL_CTX_MENU: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  nodeUrl: null,
};

// ── Shared Color & Sizing Utilities ──

export function getNodeFillColor(
  result: CrawlResult | null,
  mode: NodeColorMode
): string {
  if (!result) return "#555555";
  switch (mode) {
    case "indexability":
      return result.indexable ? "#22c55e" : "#ef4444";
    case "status_code": {
      const c = result.status_code;
      if (c >= 500) return "#ef4444";
      if (c >= 400) return "#f97316";
      if (c >= 300) return "#f59e0b";
      return "#22c55e";
    }
    case "content_type": {
      const ct = (result.content_type || "").toLowerCase();
      if (ct.includes("html")) return "#3b82f6";
      if (ct.includes("image")) return "#a855f7";
      if (ct.includes("javascript")) return "#f97316";
      if (ct.includes("css")) return "#14b8a6";
      if (ct.includes("json")) return "#eab308";
      if (ct.includes("pdf")) return "#ec4899";
      return "#6b7280";
    }
  }
}

export function getNodeRadius(
  result: CrawlResult | null,
  metric: NodeScaleMetric,
  minR: number,
  maxR: number,
  metricMin: number,
  metricMax: number
): number {
  if (!result) return minR;
  let value: number;
  switch (metric) {
    case "crawl_depth":
      value = metricMax - result.depth;
      break;
    case "internal_links":
      value = result.internal_links;
      break;
    case "word_count":
      value = result.word_count;
      break;
  }
  const range = metricMax - metricMin;
  if (range <= 0) return (minR + maxR) / 2;
  const t = Math.max(0, Math.min(1, (value - metricMin) / range));
  return minR + t * (maxR - minR);
}

export function getMetricRange(
  results: CrawlResult[],
  metric: NodeScaleMetric
): [number, number] {
  if (results.length === 0) return [0, 1];
  let min = Infinity,
    max = -Infinity;
  for (const r of results) {
    let v: number;
    switch (metric) {
      case "crawl_depth":
        v = r.depth;
        break;
      case "internal_links":
        v = r.internal_links;
        break;
      case "word_count":
        v = r.word_count;
        break;
    }
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

// ── Color helpers for canvas ──

export function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * amount));
  const nb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

export function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.max(0, Math.round(r * (1 - amount)));
  const ng = Math.max(0, Math.round(g * (1 - amount)));
  const nb = Math.max(0, Math.round(b * (1 - amount)));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

// ── Export Utilities ──

export function exportCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export function exportCanvasAsSvg(
  canvas: HTMLCanvasElement,
  filename: string
) {
  const dataUrl = canvas.toDataURL("image/png");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image width="${w}" height="${h}" xlink:href="${dataUrl}"/>
</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ── Graph Toolbar ──

export function GraphToolbar({
  canvasRef,
  exportName,
  onFitToView,
  onResetZoom,
  nodeCount,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  exportName: string;
  onFitToView: () => void;
  onResetZoom: () => void;
  nodeCount: number;
}) {
  const [showExport, setShowExport] = useState(false);

  return (
    <div className="absolute bottom-3 left-3 flex items-center gap-1 z-20">
      <span className="text-[11px] text-gray-500 mr-2">
        {nodeCount} nodes
      </span>
      <button
        onClick={onFitToView}
        className="px-2 py-1 text-[11px] bg-surface-2 border border-surface-3 rounded text-gray-300 hover:text-white hover:bg-surface-3 transition-colors"
        title="Fit all nodes in view"
      >
        Fit View
      </button>
      <button
        onClick={onResetZoom}
        className="px-2 py-1 text-[11px] bg-surface-2 border border-surface-3 rounded text-gray-300 hover:text-white hover:bg-surface-3 transition-colors"
        title="Reset zoom to 100%"
      >
        1:1
      </button>
      <div className="relative">
        <button
          onClick={() => setShowExport(!showExport)}
          className="px-2 py-1 text-[11px] bg-surface-2 border border-surface-3 rounded text-gray-300 hover:text-white hover:bg-surface-3 transition-colors"
          title="Export visualization"
        >
          Export
        </button>
        {showExport && (
          <div className="absolute bottom-full left-0 mb-1 bg-surface-2 border border-surface-3 rounded-lg shadow-xl py-1 min-w-[140px]">
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-3 transition-colors"
              onClick={() => {
                if (canvasRef.current) exportCanvasAsPng(canvasRef.current, `${exportName}.png`);
                setShowExport(false);
              }}
            >
              Export as PNG
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-3 transition-colors"
              onClick={() => {
                if (canvasRef.current) exportCanvasAsSvg(canvasRef.current, `${exportName}.svg`);
                setShowExport(false);
              }}
            >
              Export as SVG
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-3 transition-colors"
              onClick={() => {
                if (canvasRef.current) {
                  const c = canvasRef.current;
                  const tempCanvas = document.createElement("canvas");
                  tempCanvas.width = c.width * 2;
                  tempCanvas.height = c.height * 2;
                  const tempCtx = tempCanvas.getContext("2d");
                  if (tempCtx) {
                    tempCtx.scale(2, 2);
                    tempCtx.drawImage(c, 0, 0, c.width, c.height);
                  }
                  exportCanvasAsPng(tempCanvas, `${exportName}-hires.png`);
                }
                setShowExport(false);
              }}
            >
              Export as PNG (2x)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Config Panel ──

export function ConfigPanel({
  config,
  onChange,
  showLayoutDirection,
}: {
  config: VisConfig;
  onChange: (c: VisConfig) => void;
  showLayoutDirection: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-2 right-2 z-20">
      <button
        onClick={() => setOpen(!open)}
        className="w-7 h-7 rounded bg-surface-2 border border-surface-3 text-gray-400 hover:text-gray-200 hover:bg-surface-3 flex items-center justify-center transition-colors"
        title="Configuration"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="mt-1 w-52 bg-surface-2 border border-surface-3 rounded-lg p-3 shadow-lg">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Node Color
              </label>
              <select
                className="w-full bg-surface-1 border border-surface-3 rounded text-xs text-gray-200 px-2 py-1"
                value={config.nodeColor}
                onChange={(e) =>
                  onChange({
                    ...config,
                    nodeColor: e.target.value as NodeColorMode,
                  })
                }
              >
                <option value="indexability">Indexability</option>
                <option value="status_code">Status Code</option>
                <option value="content_type">Content Type</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Node Scaling
              </label>
              <select
                className="w-full bg-surface-1 border border-surface-3 rounded text-xs text-gray-200 px-2 py-1"
                value={config.nodeScale}
                onChange={(e) =>
                  onChange({
                    ...config,
                    nodeScale: e.target.value as NodeScaleMetric,
                  })
                }
              >
                <option value="crawl_depth">Crawl Depth</option>
                <option value="internal_links">Internal Links</option>
                <option value="word_count">Word Count</option>
              </select>
            </div>
            {showLayoutDirection && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Layout Direction
                </label>
                <select
                  className="w-full bg-surface-1 border border-surface-3 rounded text-xs text-gray-200 px-2 py-1"
                  value={config.layoutDirection}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      layoutDirection: e.target.value as LayoutDirection,
                    })
                  }
                >
                  <option value="LR">Left → Right</option>
                  <option value="RL">Right → Left</option>
                  <option value="TB">Top → Bottom</option>
                  <option value="BT">Bottom → Top</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Labels
              </label>
              <select
                className="w-full bg-surface-1 border border-surface-3 rounded text-xs text-gray-200 px-2 py-1"
                value={config.showLabels}
                onChange={(e) =>
                  onChange({
                    ...config,
                    showLabels: e.target.value as LabelMode,
                  })
                }
              >
                <option value="auto">Auto (zoom-based)</option>
                <option value="always">Always</option>
                <option value="hover">Hover only</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showEdges"
                checked={config.showEdges}
                onChange={(e) =>
                  onChange({ ...config, showEdges: e.target.checked })
                }
                className="rounded border-surface-3"
              />
              <label
                htmlFor="showEdges"
                className="text-xs text-gray-400 cursor-pointer"
              >
                Show edges
              </label>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 pt-3 border-t border-surface-3">
            <div className="text-xs text-gray-400 mb-1">Legend</div>
            {config.nodeColor === "indexability" && (
              <div className="flex flex-col gap-1 text-xs text-gray-300">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#22c55e" }}
                  />{" "}
                  Indexable
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#ef4444" }}
                  />{" "}
                  Non-indexable
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#555555" }}
                  />{" "}
                  Directory (no page)
                </div>
              </div>
            )}
            {config.nodeColor === "status_code" && (
              <div className="flex flex-col gap-1 text-xs text-gray-300">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#22c55e" }}
                  />{" "}
                  2xx
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#f59e0b" }}
                  />{" "}
                  3xx
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#f97316" }}
                  />{" "}
                  4xx
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#ef4444" }}
                  />{" "}
                  5xx
                </div>
              </div>
            )}
            {config.nodeColor === "content_type" && (
              <div className="flex flex-col gap-1 text-xs text-gray-300">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#3b82f6" }}
                  />{" "}
                  HTML
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#a855f7" }}
                  />{" "}
                  Image
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#f97316" }}
                  />{" "}
                  JavaScript
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: "#14b8a6" }}
                  />{" "}
                  CSS
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Context Menu ──

export function ContextMenu({
  state,
  onClose,
  onFocus,
  onShowInTable,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onFocus: (url: string) => void;
  onShowInTable: (url: string) => void;
}) {
  useEffect(() => {
    if (!state.visible) return;
    const handler = () => onClose();
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [state.visible, onClose]);

  if (!state.visible || !state.nodeUrl) return null;

  return (
    <div
      className="absolute z-30 bg-surface-2 border border-surface-3 rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ left: state.x, top: state.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-3 transition-colors"
        onClick={() => {
          onFocus(state.nodeUrl!);
          onClose();
        }}
      >
        Focus on this node
      </button>
      <button
        className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-3 transition-colors"
        onClick={() => {
          onShowInTable(state.nodeUrl!);
          onClose();
        }}
      >
        Show URL in table
      </button>
      <div className="border-t border-surface-3 my-1" />
      <div className="px-3 py-1 text-[10px] text-gray-500 font-mono truncate max-w-[300px]">
        {state.nodeUrl}
      </div>
    </div>
  );
}
