import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { CrawlResult } from "@/types/crawl";

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

// ── Shared Config Types ──

type NodeColorMode = "indexability" | "status_code" | "content_type";
type NodeScaleMetric = "crawl_depth" | "internal_links" | "word_count";
type LayoutDirection = "LR" | "TB" | "RL" | "BT";

type LabelMode = "always" | "hover" | "auto";

interface VisConfig {
  nodeColor: NodeColorMode;
  nodeScale: NodeScaleMetric;
  layoutDirection: LayoutDirection;
  showLabels: LabelMode;
  showEdges: boolean;
}

const DEFAULT_VIS_CONFIG: VisConfig = {
  nodeColor: "indexability",
  nodeScale: "crawl_depth",
  layoutDirection: "LR",
  showLabels: "auto",
  showEdges: true,
};

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  nodeUrl: string | null;
}

const INITIAL_CTX_MENU: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  nodeUrl: null,
};

// ── Shared Color & Sizing Utilities ──

function getNodeFillColor(
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

function getNodeRadius(
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
      // Invert: depth 0 = largest
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

function getMetricRange(
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

// ── Export Utilities ──

function exportCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function exportCanvasAsSvg(
  canvas: HTMLCanvasElement,
  filename: string
) {
  // Embed canvas as image in SVG for broader compatibility
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

function GraphToolbar({
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
                  // High-res 2x export
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

// ── Tree Data Structures ──

interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  urls: CrawlResult[];
}

function buildTree(results: CrawlResult[]): TreeNode {
  const root: TreeNode = {
    name: "/",
    fullPath: "/",
    children: new Map(),
    urls: [],
  };

  for (const r of results) {
    let pathname: string;
    try {
      const u = new URL(r.url);
      pathname = u.pathname;
    } catch {
      pathname = r.url;
    }

    const segments = pathname.split("/").filter(Boolean);
    let current = root;

    if (segments.length === 0) {
      current.urls.push(r);
    } else {
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!current.children.has(seg)) {
          current.children.set(seg, {
            name: seg,
            fullPath: "/" + segments.slice(0, i + 1).join("/"),
            children: new Map(),
            urls: [],
          });
        }
        current = current.children.get(seg)!;
      }
      current.urls.push(r);
    }
  }

  return root;
}

// ── Flat Tree Node for Canvas Layout ──

interface FlatTreeNode {
  id: string;
  label: string;
  url: string | null;
  result: CrawlResult | null;
  parentId: string | null;
  childIds: string[];
  treeDepth: number;
  x: number;
  y: number;
  radius: number;
  subtreeSize: number;
}

function flattenTree(root: TreeNode): FlatTreeNode[] {
  const flat: FlatTreeNode[] = [];

  function walk(node: TreeNode, parentId: string | null, depth: number) {
    const id = node.fullPath;
    const result = node.urls.length > 0 ? node.urls[0] : null;
    const childIds: string[] = [];

    const sorted = Array.from(node.children.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const child of sorted) {
      childIds.push(child.fullPath);
    }

    flat.push({
      id,
      label: node.name,
      url: result ? result.url : null,
      result,
      parentId,
      childIds,
      treeDepth: depth,
      x: 0,
      y: 0,
      radius: 5,
      subtreeSize: 0,
    });

    for (const child of sorted) {
      walk(child, id, depth + 1);
    }
  }

  walk(root, null, 0);
  return flat;
}

function layoutTree(
  nodes: FlatTreeNode[],
  direction: LayoutDirection,
  config: VisConfig,
  results: CrawlResult[]
): FlatTreeNode[] {
  if (nodes.length === 0) return nodes;

  const HSPACING = 180;
  const VSPACING = 26;

  const byId = new Map<string, FlatTreeNode>();
  for (const n of nodes) byId.set(n.id, n);

  // Compute metric range for radius
  const allResults = results.filter(Boolean);
  const [metricMin, metricMax] = getMetricRange(allResults, config.nodeScale);

  // Set radius per node
  for (const n of nodes) {
    n.radius = getNodeRadius(n.result, config.nodeScale, 4, 16, metricMin, metricMax);
  }

  // Bottom-up subtree size
  function computeSize(node: FlatTreeNode): number {
    if (node.childIds.length === 0) {
      node.subtreeSize = 1;
      return 1;
    }
    let total = 0;
    for (const cid of node.childIds) {
      const child = byId.get(cid);
      if (child) total += computeSize(child);
    }
    node.subtreeSize = Math.max(total, 1);
    return node.subtreeSize;
  }

  // Find root
  const root = nodes.find((n) => n.parentId === null);
  if (root) computeSize(root);

  // Top-down position assignment
  function assignPositions(node: FlatTreeNode, yStart: number) {
    node.x = node.treeDepth * HSPACING;
    const totalHeight = node.subtreeSize * VSPACING;
    node.y = yStart + totalHeight / 2;

    let cursor = yStart;
    for (const cid of node.childIds) {
      const child = byId.get(cid);
      if (child) {
        const childHeight = child.subtreeSize * VSPACING;
        assignPositions(child, cursor);
        cursor += childHeight;
      }
    }
  }

  if (root) {
    const totalHeight = root.subtreeSize * VSPACING;
    assignPositions(root, -totalHeight / 2);
  }

  // Apply direction transform
  for (const n of nodes) {
    let fx = n.x,
      fy = n.y;
    switch (direction) {
      case "LR":
        break; // default
      case "RL":
        fx = -n.x;
        break;
      case "TB": {
        const tmp = fx;
        fx = fy;
        fy = tmp;
        break;
      }
      case "BT": {
        const tmp = fx;
        fx = fy;
        fy = -tmp;
        break;
      }
    }
    n.x = fx;
    n.y = fy;
  }

  return nodes;
}

// ── Config Panel ──

function ConfigPanel({
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

function ContextMenu({
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

// ── Tab 1: Crawl Tree Graph (Canvas-based hierarchical layout) ──

function CrawlTreeGraph({
  results,
  onUrlClick,
}: {
  results: CrawlResult[];
  onUrlClick?: (url: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(0.8);
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });
  const hoverRef = useRef<number>(-1);
  const flatNodesRef = useRef<FlatTreeNode[]>([]);
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [config, setConfig] = useState<VisConfig>(DEFAULT_VIS_CONFIG);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>(INITIAL_CTX_MENU);

  // Build and layout tree
  const flatNodes = useMemo(() => {
    if (results.length === 0) return [];
    const tree = buildTree(results);
    const flat = flattenTree(tree);
    return layoutTree(flat, config.layoutDirection, config, results);
  }, [results, config]);

  // Index by id for edge drawing
  const nodeIdxMap = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < flatNodes.length; i++) m.set(flatNodes[i].id, i);
    return m;
  }, [flatNodes]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const off = offsetRef.current;
    const s = scaleRef.current;
    const ns = flatNodesRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2 + off.x;
    const cy = h / 2 + off.y;
    const margin = 50;

    // Viewport culling helper
    const isVisible = (nx: number, ny: number, r: number) => {
      const sx = cx + nx * s;
      const sy = cy + ny * s;
      const m = r * s + margin;
      return sx > -m && sx < w + m && sy > -m && sy < h + m;
    };

    // Determine label visibility
    const labelMode = config.showLabels;
    const autoShowLabels = labelMode === "always" || (labelMode === "auto" && s > 0.4);
    const isVertical = config.layoutDirection === "TB" || config.layoutDirection === "BT";

    // Draw edges
    if (config.showEdges) {
      ctx.strokeStyle = "rgba(100, 120, 140, 0.25)";
      ctx.lineWidth = 1;
      for (const n of ns) {
        if (n.parentId === null) continue;
        const pi = nodeIdxMap.get(n.parentId);
        if (pi === undefined) continue;
        const parent = ns[pi];

        if (!isVisible(n.x, n.y, n.radius) && !isVisible(parent.x, parent.y, parent.radius))
          continue;

        const sx1 = cx + parent.x * s;
        const sy1 = cy + parent.y * s;
        const sx2 = cx + n.x * s;
        const sy2 = cy + n.y * s;

        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        if (isVertical) {
          const midY = (sy1 + sy2) / 2;
          ctx.bezierCurveTo(sx1, midY, sx2, midY, sx2, sy2);
        } else {
          const midX = (sx1 + sx2) / 2;
          ctx.bezierCurveTo(midX, sy1, midX, sy2, sx2, sy2);
        }
        ctx.stroke();
      }
    }

    // Draw nodes
    const fontSize = Math.max(8, Math.min(12, 10 * s));
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      if (!isVisible(n.x, n.y, n.radius)) continue;

      const sx = cx + n.x * s;
      const sy = cy + n.y * s;
      const r = Math.max(n.radius * s, 2);

      const fillColor = getNodeFillColor(n.result, config.nodeColor);
      const isHovered = i === hoverRef.current;

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? lightenColor(fillColor, 0.3) : fillColor;
      ctx.fill();
      ctx.strokeStyle = darkenColor(fillColor, 0.3);
      ctx.lineWidth = isHovered ? 1.5 : 0.5;
      ctx.stroke();

      // Draw label
      const shouldShowLabel = isHovered || autoShowLabels;
      if (shouldShowLabel) {
        let displayLabel = n.label;
        if (isHovered) {
          const labelText = n.url || n.label;
          try {
            displayLabel = new URL(labelText).pathname;
          } catch {
            displayLabel = labelText;
          }
          if (displayLabel.length > 60) displayLabel = "..." + displayLabel.slice(-57);
        } else if (displayLabel.length > 20) {
          displayLabel = displayLabel.slice(0, 18) + "..";
        }

        ctx.fillStyle = isHovered ? "#ffffff" : "rgba(220, 220, 230, 0.85)";

        if (isVertical && !isHovered) {
          // In TB/BT mode: draw label rotated 90° to the right of node
          ctx.save();
          ctx.translate(sx, sy + r + 4);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(displayLabel, 0, fontSize / 3);
          ctx.restore();
        } else {
          ctx.fillText(displayLabel, sx + r + 4, sy + fontSize / 3);
        }
      }
    }
  }, [config.nodeColor, config.showLabels, config.showEdges, config.layoutDirection, nodeIdxMap]);

  // Animation loop
  useEffect(() => {
    flatNodesRef.current = flatNodes;
    resizeCanvas();

    const loop = () => {
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);

    const handleResize = () => resizeCanvas();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [flatNodes, draw, resizeCanvas]);

  // Auto-center on first load
  useEffect(() => {
    if (flatNodes.length === 0) return;
    // Find bounds
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of flatNodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Fit to viewport
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const spanX = maxX - minX + 100;
      const spanY = maxY - minY + 100;
      const fitScale = Math.min(w / spanX, h / spanY, 1.5);
      scaleRef.current = Math.max(0.05, Math.min(fitScale, 1.5));
    }

    offsetRef.current = {
      x: -centerX * scaleRef.current,
      y: -centerY * scaleRef.current,
    };
  }, [flatNodes]);

  // Hit detection
  const getNodeAtPos = useCallback(
    (mx: number, my: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return -1;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const ns = flatNodesRef.current;
      const off = offsetRef.current;
      const s = scaleRef.current;
      const cx = w / 2 + off.x;
      const cy = h / 2 + off.y;

      for (let i = ns.length - 1; i >= 0; i--) {
        const n = ns[i];
        const sx = cx + n.x * s;
        const sy = cy + n.y * s;
        const dx = mx - sx;
        const dy = my - sy;
        const r = Math.max(n.radius * s, 6);
        if (dx * dx + dy * dy < r * r) return i;
      }
      return -1;
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        offsetRef.current.x += dx;
        offsetRef.current.y += dy;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
        return;
      }

      const idx = getNodeAtPos(mx, my);
      hoverRef.current = idx;
      if (idx >= 0) {
        const n = flatNodesRef.current[idx];
        setTooltip({
          text: n.url || n.label,
          x: mx + 12,
          y: my - 12,
        });
        canvas.style.cursor = "pointer";
      } else {
        setTooltip(null);
        canvas.style.cursor = "grab";
      }
    },
    [getNodeAtPos]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 2) return; // right-click handled separately
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const idx = getNodeAtPos(mx, my);

      if (idx >= 0) {
        const n = flatNodesRef.current[idx];
        if (n.url) onUrlClick?.(n.url);
      } else {
        dragRef.current = {
          active: true,
          lastX: e.clientX,
          lastY: e.clientY,
        };
        canvas.style.cursor = "grabbing";
      }
    },
    [getNodeAtPos, onUrlClick]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      const oldScale = scaleRef.current;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.02, Math.min(5, oldScale * delta));
      scaleRef.current = newScale;

      // Zoom toward mouse position
      const cx = w / 2;
      const cy = h / 2;
      const worldX = (mx - cx - offsetRef.current.x) / oldScale;
      const worldY = (my - cy - offsetRef.current.y) / oldScale;
      offsetRef.current.x = mx - cx - worldX * newScale;
      offsetRef.current.y = my - cy - worldY * newScale;
    },
    []
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const idx = getNodeAtPos(mx, my);

      if (idx >= 0) {
        const n = flatNodesRef.current[idx];
        setCtxMenu({
          visible: true,
          x: mx,
          y: my,
          nodeUrl: n.url || n.id,
        });
      } else {
        setCtxMenu(INITIAL_CTX_MENU);
      }
    },
    [getNodeAtPos]
  );

  const handleFocus = useCallback((url: string) => {
    const ns = flatNodesRef.current;
    const node = ns.find((n) => n.url === url || n.id === url);
    if (!node) return;
    offsetRef.current = {
      x: -node.x * scaleRef.current,
      y: -node.y * scaleRef.current,
    };
  }, []);

  const handleFitToView = useCallback(() => {
    const ns = flatNodesRef.current;
    if (ns.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of ns) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const spanX = maxX - minX + 200;
    const spanY = maxY - minY + 100;
    const fitScale = Math.min(w / spanX, h / spanY, 2);
    scaleRef.current = Math.max(0.02, fitScale);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    offsetRef.current = { x: -centerX * scaleRef.current, y: -centerY * scaleRef.current };
  }, []);

  const handleResetZoom = useCallback(() => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  }, []);

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No crawl data to visualize
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor: "grab" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-surface-2 border border-surface-3 text-gray-200 text-xs px-2 py-1 rounded font-mono max-w-xs truncate z-20"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
      <ConfigPanel
        config={config}
        onChange={setConfig}
        showLayoutDirection={true}
      />
      <GraphToolbar
        canvasRef={canvasRef}
        exportName="crawl-tree"
        onFitToView={handleFitToView}
        onResetZoom={handleResetZoom}
        nodeCount={flatNodes.length}
      />
      <ContextMenu
        state={ctxMenu}
        onClose={() => setCtxMenu(INITIAL_CTX_MENU)}
        onFocus={handleFocus}
        onShowInTable={(url) => onUrlClick?.(url)}
      />
    </div>
  );
}

// ── Color helpers for canvas ──

function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * amount));
  const nb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.max(0, Math.round(r * (1 - amount)));
  const ng = Math.max(0, Math.round(g * (1 - amount)));
  const nb = Math.max(0, Math.round(b * (1 - amount)));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

// ── Tab 2: Radial Tree (Site Graph) ──

interface RadialNode {
  id: string;
  label: string;
  x: number;
  y: number;
  depth: number;
  radius: number;
  truncated: boolean;
  resultIdx: number;
  parentIdx: number;
  childIndices: number[];
  angleStart: number;
  angleEnd: number;
  angle: number;
  subtreeSize: number;
}

interface RadialEdge {
  source: number;
  target: number;
}

const RING_SPACING = 120;

function buildRadialTree(
  results: CrawlResult[],
  nodeScale: NodeScaleMetric
): { nodes: RadialNode[]; edges: RadialEdge[]; limited: CrawlResult[] } {
  const lim = results.slice(0, 2000);
  if (lim.length === 0) return { nodes: [], edges: [], limited: lim };

  const [metricMin, metricMax] = getMetricRange(lim, nodeScale);
  const urlToIdx = new Map<string, number>();
  const radialNodes: RadialNode[] = [];
  const byDepth = new Map<number, number[]>();

  // Step 1: Create nodes
  for (let i = 0; i < lim.length; i++) {
    const r = lim[i];
    let label: string;
    try {
      const u = new URL(r.url);
      label = u.pathname === "/" ? "/" : u.pathname;
    } catch {
      label = r.url;
    }
    if (label.length > 30) label = "..." + label.slice(-27);

    const radius = getNodeRadius(r, nodeScale, 4, 20, metricMin, metricMax);

    radialNodes.push({
      id: r.url,
      label,
      x: 0,
      y: 0,
      depth: r.depth,
      radius,
      truncated: false,
      resultIdx: i,
      parentIdx: -1,
      childIndices: [],
      angleStart: 0,
      angleEnd: 0,
      angle: 0,
      subtreeSize: 1,
    });
    urlToIdx.set(r.url, i);
    if (!byDepth.has(r.depth)) byDepth.set(r.depth, []);
    byDepth.get(r.depth)!.push(i);
  }

  // Step 2: Build edges by matching children to parents via URL path prefix
  const radialEdges: RadialEdge[] = [];
  for (let i = 0; i < lim.length; i++) {
    const r = lim[i];
    if (r.depth === 0) continue;

    let parentPath: string;
    try {
      const u = new URL(r.url);
      const segs = u.pathname.split("/").filter(Boolean);
      segs.pop();
      parentPath = "/" + segs.join("/");
    } catch {
      parentPath = "/";
    }

    const candidates = byDepth.get(r.depth - 1) ?? byDepth.get(0) ?? [];
    let bestIdx = candidates[0] ?? -1;
    let bestScore = -1;

    for (const ci of candidates) {
      const candidate = lim[ci];
      let cPath: string;
      try {
        cPath = new URL(candidate.url).pathname;
      } catch {
        cPath = "/";
      }
      let score = 0;
      for (let j = 0; j < Math.min(parentPath.length, cPath.length); j++) {
        if (parentPath[j] === cPath[j]) score++;
        else break;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = ci;
      }
    }

    if (bestIdx >= 0 && bestIdx !== i) {
      radialEdges.push({ source: bestIdx, target: i });
      radialNodes[i].parentIdx = bestIdx;
      radialNodes[bestIdx].childIndices.push(i);
    }
  }

  // Mark truncated: has outbound links but no children in graph
  for (let i = 0; i < radialNodes.length; i++) {
    if (lim[i].internal_links > 0 && radialNodes[i].childIndices.length === 0) {
      radialNodes[i].truncated = true;
    }
  }

  // Step 3: Compute subtree sizes bottom-up
  function computeSubtreeSize(idx: number): number {
    const node = radialNodes[idx];
    if (node.childIndices.length === 0) {
      node.subtreeSize = 1;
      return 1;
    }
    let total = 0;
    for (const ci of node.childIndices) {
      total += computeSubtreeSize(ci);
    }
    node.subtreeSize = total;
    return total;
  }

  // Step 4: Assign polar positions top-down
  function assignPositions(idx: number, angleStart: number, angleEnd: number) {
    const node = radialNodes[idx];
    node.angleStart = angleStart;
    node.angleEnd = angleEnd;
    const midAngle = (angleStart + angleEnd) / 2;
    node.angle = midAngle;
    const ringRadius = node.depth * RING_SPACING;
    node.x = Math.cos(midAngle) * ringRadius;
    node.y = Math.sin(midAngle) * ringRadius;

    if (node.childIndices.length === 0) return;

    let cursor = angleStart;
    for (const ci of node.childIndices) {
      const child = radialNodes[ci];
      const childSpan =
        (child.subtreeSize / Math.max(node.subtreeSize, 1)) *
        (angleEnd - angleStart);
      assignPositions(ci, cursor, cursor + childSpan);
      cursor += childSpan;
    }
  }

  // Find roots (depth 0 or nodes without parents)
  const roots = radialNodes
    .map((n, i) => ({ n, i }))
    .filter((e) => e.n.parentIdx === -1);

  if (roots.length === 1) {
    computeSubtreeSize(roots[0].i);
    assignPositions(roots[0].i, 0, Math.PI * 2);
  } else if (roots.length > 1) {
    // Multiple roots: distribute evenly
    let totalSize = 0;
    for (const r of roots) {
      computeSubtreeSize(r.i);
      totalSize += radialNodes[r.i].subtreeSize;
    }
    let cursor = 0;
    for (const r of roots) {
      const span =
        (radialNodes[r.i].subtreeSize / Math.max(totalSize, 1)) * Math.PI * 2;
      assignPositions(r.i, cursor, cursor + span);
      cursor += span;
    }
  }

  return { nodes: radialNodes, edges: radialEdges, limited: lim };
}

function ForceGraph({
  results,
  onUrlClick,
}: {
  results: CrawlResult[];
  onUrlClick?: (url: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<RadialNode[]>([]);
  const edgesRef = useRef<RadialEdge[]>([]);
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });
  const hoverRef = useRef<number>(-1);
  const needsRedrawRef = useRef(false);
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [config, setConfig] = useState<VisConfig>({
    ...DEFAULT_VIS_CONFIG,
    nodeColor: "status_code",
  });
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>(INITIAL_CTX_MENU);

  // Build radial tree data
  const { nodes, edges, limited } = useMemo(
    () => buildRadialTree(results, config.nodeScale),
    [results, config.nodeScale]
  );

  // Find max depth for ring guides
  const maxDepth = useMemo(
    () => nodes.reduce((m, n) => Math.max(m, n.depth), 0),
    [nodes]
  );

  const requestRedraw = useCallback(() => {
    if (!needsRedrawRef.current) {
      needsRedrawRef.current = true;
      requestAnimationFrame(() => {
        needsRedrawRef.current = false;
        drawRef.current();
      });
    }
  }, []);

  const drawRef = useRef(() => {});

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const ns = nodesRef.current;
    const es = edgesRef.current;
    const off = offsetRef.current;
    const s = scaleRef.current;

    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const cx = w / 2 + off.x;
    const cy = h / 2 + off.y;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, w, h);

    // Draw concentric ring guides
    ctx.strokeStyle = "rgba(60, 70, 80, 0.15)";
    ctx.lineWidth = 0.5;
    for (let d = 1; d <= maxDepth; d++) {
      const ringR = d * RING_SPACING * s;
      if (ringR < 2) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw depth labels on rings
    if (s > 0.3) {
      ctx.fillStyle = "rgba(80, 90, 100, 0.4)";
      ctx.font = "9px monospace";
      for (let d = 1; d <= maxDepth; d++) {
        const ringR = d * RING_SPACING * s;
        if (ringR < 20) continue;
        ctx.fillText(`d${d}`, cx + ringR + 4, cy - 3);
      }
    }

    // Label visibility
    const labelMode = config.showLabels;
    const showAllLabels = labelMode === "always" || (labelMode === "auto" && s > 1.2);
    const showImportantLabels = labelMode === "auto" && s > 0.6 && s <= 1.2;

    // Draw edges as quadratic bezier curves
    if (config.showEdges) {
      ctx.lineWidth = 0.8;
      for (const e of es) {
        const src = ns[e.source];
        const tgt = ns[e.target];
        if (!src || !tgt) continue;
        const sx1 = cx + src.x * s;
        const sy1 = cy + src.y * s;
        const sx2 = cx + tgt.x * s;
        const sy2 = cy + tgt.y * s;

        // Viewport culling
        if (sx1 < -50 && sx2 < -50) continue;
        if (sx1 > w + 50 && sx2 > w + 50) continue;
        if (sy1 < -50 && sy2 < -50) continue;
        if (sy1 > h + 50 && sy2 > h + 50) continue;

        // Control point pulled toward center for nice curves
        const cpx = (sx1 + sx2) / 2 * 0.85 + cx * 0.15;
        const cpy = (sy1 + sy2) / 2 * 0.85 + cy * 0.15;

        const isHoveredEdge =
          e.source === hoverRef.current || e.target === hoverRef.current;

        ctx.strokeStyle = isHoveredEdge
          ? "rgba(120, 140, 160, 0.5)"
          : "rgba(80, 100, 120, 0.12)";
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.quadraticCurveTo(cpx, cpy, sx2, sy2);
        ctx.stroke();
      }
    }

    // Draw nodes — two passes: truncated first (behind), then normal
    const lim = limited;
    const fontSize = Math.max(7, Math.min(11, 9 * s));

    // Pass 1: truncated nodes (smaller, dimmer, dashed)
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      if (!n.truncated) continue;
      const sx = cx + n.x * s;
      const sy = cy + n.y * s;
      const r = Math.max(n.radius * s * 0.6, 1.5);

      if (sx < -r - 10 || sx > w + r + 10 || sy < -r - 10 || sy > h + r + 10)
        continue;

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = i === hoverRef.current ? "#555555" : "#2a2a2a";
      ctx.fill();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = "#555555";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Pass 2: non-truncated nodes
    ctx.font = `${fontSize}px monospace`;
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      if (n.truncated) continue;
      const sx = cx + n.x * s;
      const sy = cy + n.y * s;
      const r = Math.max(n.radius * s, 2);

      if (sx < -r - 10 || sx > w + r + 10 || sy < -r - 10 || sy > h + r + 10)
        continue;

      const result = lim[n.resultIdx];
      const fillColor = result
        ? getNodeFillColor(result, config.nodeColor)
        : "#555555";
      const isHovered = i === hoverRef.current;

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? lightenColor(fillColor, 0.3) : fillColor;
      ctx.fill();
      ctx.strokeStyle = darkenColor(fillColor, 0.3);
      ctx.lineWidth = isHovered ? 2 : 0.5;
      ctx.stroke();

      // Labels: radially aligned, flipped on left half
      const isImportant = n.radius > 8;
      const shouldShowLabel =
        isHovered ||
        showAllLabels ||
        (showImportantLabels && isImportant);

      if (shouldShowLabel && labelMode !== "hover") {
        let displayLabel = n.label;
        if (!isHovered && displayLabel.length > 18) {
          displayLabel = displayLabel.slice(0, 16) + "..";
        }

        ctx.save();
        ctx.translate(sx, sy);

        // Root node: just draw label to the right
        if (n.depth === 0) {
          ctx.fillStyle = isHovered ? "#ffffff" : "rgba(200, 200, 210, 0.7)";
          ctx.fillText(displayLabel, r + 4, fontSize / 3);
        } else {
          // Rotate along radial angle, flip if on left half
          const angle = n.angle;
          const isLeftHalf =
            angle > Math.PI / 2 || angle < -Math.PI / 2;
          if (isLeftHalf) {
            ctx.rotate(angle + Math.PI);
            ctx.textAlign = "right";
            ctx.fillStyle = isHovered
              ? "#ffffff"
              : "rgba(200, 200, 210, 0.7)";
            ctx.fillText(displayLabel, -(r + 4), fontSize / 3);
          } else {
            ctx.rotate(angle);
            ctx.textAlign = "left";
            ctx.fillStyle = isHovered
              ? "#ffffff"
              : "rgba(200, 200, 210, 0.7)";
            ctx.fillText(displayLabel, r + 4, fontSize / 3);
          }
        }
        ctx.restore();
        ctx.textAlign = "left"; // reset
      } else if (isHovered) {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(n.label, sx + r + 3, sy + fontSize / 3);
      }
    }

    // Root indicator
    if (ns.length > 0 && ns[0].depth === 0) {
      const rootSx = cx + ns[0].x * s;
      const rootSy = cy + ns[0].y * s;
      if (
        rootSx > -20 &&
        rootSx < w + 20 &&
        rootSy > -20 &&
        rootSy < h + 20
      ) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rootSx, rootSy, Math.max(ns[0].radius * s, 2) + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [config.nodeColor, config.showLabels, config.showEdges, limited, maxDepth]);

  // Keep drawRef in sync
  drawRef.current = draw;

  // Resize canvas
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
  }, []);

  // Setup: copy nodes, resize, auto-fit, draw
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    resizeCanvas();

    // Auto fit to view on data change
    if (nodes.length > 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;
        for (const n of nodes) {
          if (n.x < minX) minX = n.x;
          if (n.x > maxX) maxX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.y > maxY) maxY = n.y;
        }
        const spanX = maxX - minX + 300;
        const spanY = maxY - minY + 300;
        const fitScale = Math.min(w / spanX, h / spanY, 2);
        scaleRef.current = Math.max(0.1, fitScale);
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        offsetRef.current = {
          x: -centerX * scaleRef.current,
          y: -centerY * scaleRef.current,
        };
      }
    }

    draw();

    const handleResize = () => {
      resizeCanvas();
      draw();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [nodes, edges, draw, resizeCanvas]);

  // Redraw on config change
  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse interactions
  const getNodeAtPos = useCallback(
    (mx: number, my: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return -1;
      const dpr = window.devicePixelRatio || 1;
      const ns = nodesRef.current;
      const off = offsetRef.current;
      const s = scaleRef.current;
      const cx = canvas.width / dpr / 2 + off.x;
      const cy = canvas.height / dpr / 2 + off.y;

      for (let i = ns.length - 1; i >= 0; i--) {
        const n = ns[i];
        const sx = cx + n.x * s;
        const sy = cy + n.y * s;
        const dx = mx - sx;
        const dy = my - sy;
        const r = Math.max(n.radius * s, 6);
        if (dx * dx + dy * dy < r * r) return i;
      }
      return -1;
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        offsetRef.current.x += dx;
        offsetRef.current.y += dy;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
        requestRedraw();
        return;
      }

      const idx = getNodeAtPos(mx, my);
      hoverRef.current = idx;
      if (idx >= 0) {
        setTooltip({
          text: nodesRef.current[idx].id,
          x: mx + 12,
          y: my - 12,
        });
        canvas.style.cursor = "pointer";
      } else {
        setTooltip(null);
        canvas.style.cursor = "grab";
      }
      requestRedraw();
    },
    [getNodeAtPos, requestRedraw]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 2) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const idx = getNodeAtPos(mx, my);

      if (idx >= 0) {
        onUrlClick?.(nodesRef.current[idx].id);
      } else {
        dragRef.current = {
          active: true,
          lastX: e.clientX,
          lastY: e.clientY,
        };
        canvas.style.cursor = "grabbing";
      }
    },
    [getNodeAtPos, onUrlClick]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      const oldScale = scaleRef.current;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.05, Math.min(8, oldScale * delta));
      scaleRef.current = newScale;

      const cxc = w / 2;
      const cyc = h / 2;
      const worldX = (mx - cxc - offsetRef.current.x) / oldScale;
      const worldY = (my - cyc - offsetRef.current.y) / oldScale;
      offsetRef.current.x = mx - cxc - worldX * newScale;
      offsetRef.current.y = my - cyc - worldY * newScale;

      requestRedraw();
    },
    [requestRedraw]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const idx = getNodeAtPos(mx, my);

      if (idx >= 0) {
        setCtxMenu({
          visible: true,
          x: mx,
          y: my,
          nodeUrl: nodesRef.current[idx].id,
        });
      } else {
        setCtxMenu(INITIAL_CTX_MENU);
      }
    },
    [getNodeAtPos]
  );

  const handleFocus = useCallback(
    (url: string) => {
      const ns = nodesRef.current;
      const node = ns.find((n) => n.id === url);
      if (!node) return;
      offsetRef.current = {
        x: -node.x * scaleRef.current,
        y: -node.y * scaleRef.current,
      };
      requestRedraw();
    },
    [requestRedraw]
  );

  const handleFitToView = useCallback(() => {
    const ns = nodesRef.current;
    if (ns.length === 0) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of ns) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const spanX = maxX - minX + 300;
    const spanY = maxY - minY + 300;
    const fitScale = Math.min(w / spanX, h / spanY, 2);
    scaleRef.current = Math.max(0.1, fitScale);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    offsetRef.current = {
      x: -centerX * scaleRef.current,
      y: -centerY * scaleRef.current,
    };
    requestRedraw();
  }, [requestRedraw]);

  const handleResetZoom = useCallback(() => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    requestRedraw();
  }, [requestRedraw]);

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No crawl data to visualize
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor: "grab" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-surface-2 border border-surface-3 text-gray-200 text-xs px-2 py-1 rounded font-mono max-w-xs truncate z-20"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
      <ConfigPanel
        config={config}
        onChange={setConfig}
        showLayoutDirection={false}
      />
      <GraphToolbar
        canvasRef={canvasRef}
        exportName="site-graph"
        onFitToView={handleFitToView}
        onResetZoom={handleResetZoom}
        nodeCount={Math.min(results.length, 2000)}
      />
      <ContextMenu
        state={ctxMenu}
        onClose={() => setCtxMenu(INITIAL_CTX_MENU)}
        onFocus={handleFocus}
        onShowInTable={(url) => onUrlClick?.(url)}
      />
    </div>
  );
}

// ── Tab 3: Crawl Depth Chart ──

function CrawlDepthChart({ results }: { results: CrawlResult[] }) {
  const depthData = useMemo(() => {
    const map = new Map<
      number,
      { count: number; totalTime: number; indexable: number }
    >();

    for (const r of results) {
      const d = r.depth;
      const existing = map.get(d) ?? { count: 0, totalTime: 0, indexable: 0 };
      existing.count++;
      existing.totalTime += r.response_time_ms;
      if (r.indexable) existing.indexable++;
      map.set(d, existing);
    }

    const entries = Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([depth, data]) => ({
        depth,
        count: data.count,
        avgTime: Math.round(data.totalTime / data.count),
        indexablePct: Math.round((data.indexable / data.count) * 100),
      }));

    return entries;
  }, [results]);

  const totals = useMemo(() => {
    if (depthData.length === 0) return { count: 0, avgTime: 0, indexablePct: 0 };
    const totalCount = depthData.reduce((s, d) => s + d.count, 0);
    const totalTime = depthData.reduce((s, d) => s + d.avgTime * d.count, 0);
    const totalIndexable = results.filter((r) => r.indexable).length;
    return {
      count: totalCount,
      avgTime: totalCount > 0 ? Math.round(totalTime / totalCount) : 0,
      indexablePct:
        totalCount > 0 ? Math.round((totalIndexable / totalCount) * 100) : 0,
    };
  }, [depthData, results]);

  if (results.length === 0 || depthData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No crawl data to visualize
      </div>
    );
  }

  const maxCount = Math.max(...depthData.map((d) => d.count));
  const maxDepth = Math.max(...depthData.map((d) => d.depth), 1);

  function barColor(depth: number): string {
    const t = maxDepth > 0 ? depth / maxDepth : 0;
    const r = Math.round(34 + t * 200);
    const g = Math.round(197 - t * 160);
    const b = Math.round(94 - t * 60);
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Grid line percentages
  const gridLines = [25, 50, 75];

  return (
    <div className="h-full overflow-auto p-4">
      {/* Bar chart */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-200 mb-4">
          Pages by Crawl Depth
        </h3>
        <div
          className="flex items-end gap-2 relative"
          style={{ height: "200px" }}
        >
          {/* Grid lines */}
          {gridLines.map((pct) => (
            <div
              key={pct}
              className="absolute left-0 right-0 border-t border-dashed border-surface-3/50"
              style={{ bottom: `${pct}%` }}
            >
              <span className="absolute -left-1 -top-3 text-[10px] text-gray-600">
                {Math.round((pct / 100) * maxCount)}
              </span>
            </div>
          ))}
          {depthData.map((d) => {
            const heightPct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
            return (
              <div
                key={d.depth}
                className="flex flex-col items-center flex-1 min-w-[40px] max-w-[80px] relative z-10"
                style={{ height: "100%" }}
              >
                <span className="text-xs text-gray-300 tabular-nums mb-1">
                  {d.count}
                </span>
                <div className="flex-1 w-full flex items-end">
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${Math.max(heightPct, 2)}%`,
                      backgroundColor: barColor(d.depth),
                    }}
                  />
                </div>
                <span className="text-xs text-gray-400 mt-1 tabular-nums">
                  {d.depth}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>Depth</span>
        </div>
      </div>

      {/* Summary table */}
      <div>
        <h3 className="text-sm font-medium text-gray-200 mb-2">
          Depth Summary
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-3">
              <th className="text-left text-xs text-gray-400 font-medium px-3 py-2">
                Depth
              </th>
              <th className="text-left text-xs text-gray-400 font-medium px-3 py-2">
                Pages
              </th>
              <th className="text-left text-xs text-gray-400 font-medium px-3 py-2">
                Avg Response Time
              </th>
              <th className="text-left text-xs text-gray-400 font-medium px-3 py-2">
                Indexable %
              </th>
            </tr>
          </thead>
          <tbody>
            {depthData.map((d) => (
              <tr
                key={d.depth}
                className="border-b border-surface-3/50 hover:bg-surface-2/50"
              >
                <td className="px-3 py-1.5 text-gray-300 tabular-nums">
                  {d.depth}
                </td>
                <td className="px-3 py-1.5 text-gray-300 tabular-nums">
                  {d.count}
                </td>
                <td className="px-3 py-1.5 tabular-nums">
                  <span
                    className={
                      d.avgTime > 1000
                        ? "text-red-400"
                        : d.avgTime > 500
                        ? "text-yellow-400"
                        : "text-green-400"
                    }
                  >
                    {d.avgTime}ms
                  </span>
                </td>
                <td className="px-3 py-1.5 tabular-nums">
                  <span
                    className={
                      d.indexablePct < 50
                        ? "text-red-400"
                        : d.indexablePct < 90
                        ? "text-yellow-400"
                        : "text-green-400"
                    }
                  >
                    {d.indexablePct}%
                  </span>
                </td>
              </tr>
            ))}
            {/* Total row */}
            <tr className="border-t-2 border-surface-3 bg-surface-1/30 font-medium">
              <td className="px-3 py-1.5 text-gray-200">Total</td>
              <td className="px-3 py-1.5 text-gray-200 tabular-nums">
                {totals.count}
              </td>
              <td className="px-3 py-1.5 tabular-nums">
                <span
                  className={
                    totals.avgTime > 1000
                      ? "text-red-400"
                      : totals.avgTime > 500
                      ? "text-yellow-400"
                      : "text-green-400"
                  }
                >
                  {totals.avgTime}ms
                </span>
              </td>
              <td className="px-3 py-1.5 tabular-nums">
                <span
                  className={
                    totals.indexablePct < 50
                      ? "text-red-400"
                      : totals.indexablePct < 90
                      ? "text-yellow-400"
                      : "text-green-400"
                  }
                >
                  {totals.indexablePct}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Component ──

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
          <CrawlTreeGraph results={pageResults} onUrlClick={onUrlClick} />
        )}
        {activeTab === "graph" && (
          <ForceGraph results={pageResults} onUrlClick={onUrlClick} />
        )}
        {activeTab === "depth" && <CrawlDepthChart results={pageResults} />}
      </div>
    </div>
  );
}
