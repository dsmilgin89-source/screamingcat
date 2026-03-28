import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { CrawlResult } from "@/types/crawl";
import {
  type VisConfig,
  type LayoutDirection,
  DEFAULT_VIS_CONFIG,
  type ContextMenuState,
  INITIAL_CTX_MENU,
  getNodeFillColor,
  getNodeRadius,
  getMetricRange,
  lightenColor,
  darkenColor,
  GraphToolbar,
  ConfigPanel,
  ContextMenu,
} from "./shared";

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

  const allResults = results.filter(Boolean);
  const [metricMin, metricMax] = getMetricRange(allResults, config.nodeScale);

  for (const n of nodes) {
    n.radius = getNodeRadius(n.result, config.nodeScale, 4, 16, metricMin, metricMax);
  }

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

  const root = nodes.find((n) => n.parentId === null);
  if (root) computeSize(root);

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

  for (const n of nodes) {
    let fx = n.x,
      fy = n.y;
    switch (direction) {
      case "LR":
        break;
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

// ── Crawl Tree Graph (Canvas-based hierarchical layout) ──

export function HierarchyView({
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

  const flatNodes = useMemo(() => {
    if (results.length === 0) return [];
    const tree = buildTree(results);
    const flat = flattenTree(tree);
    return layoutTree(flat, config.layoutDirection, config, results);
  }, [results, config]);

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

    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2 + off.x;
    const cy = h / 2 + off.y;
    const margin = 50;

    const isVisible = (nx: number, ny: number, r: number) => {
      const sx = cx + nx * s;
      const sy = cy + ny * s;
      const m = r * s + margin;
      return sx > -m && sx < w + m && sy > -m && sy < h + m;
    };

    const labelMode = config.showLabels;
    const autoShowLabels = labelMode === "always" || (labelMode === "auto" && s > 0.4);
    const isVertical = config.layoutDirection === "TB" || config.layoutDirection === "BT";

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

  useEffect(() => {
    if (flatNodes.length === 0) return;
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
      if (e.button === 2) return;
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
