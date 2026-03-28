import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { CrawlResult } from "@/types/crawl";
import {
  type VisConfig,
  type NodeScaleMetric,
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

// ── Radial Tree Data Structures ──

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

  for (let i = 0; i < radialNodes.length; i++) {
    if (lim[i].internal_links > 0 && radialNodes[i].childIndices.length === 0) {
      radialNodes[i].truncated = true;
    }
  }

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

  const roots = radialNodes
    .map((n, i) => ({ n, i }))
    .filter((e) => e.n.parentIdx === -1);

  if (roots.length === 1) {
    computeSubtreeSize(roots[0].i);
    assignPositions(roots[0].i, 0, Math.PI * 2);
  } else if (roots.length > 1) {
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

// ── Site Graph (Radial Tree) ──

export function LinkGraph({
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

  const { nodes, edges, limited } = useMemo(
    () => buildRadialTree(results, config.nodeScale),
    [results, config.nodeScale]
  );

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

    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(60, 70, 80, 0.15)";
    ctx.lineWidth = 0.5;
    for (let d = 1; d <= maxDepth; d++) {
      const ringR = d * RING_SPACING * s;
      if (ringR < 2) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (s > 0.3) {
      ctx.fillStyle = "rgba(80, 90, 100, 0.4)";
      ctx.font = "9px monospace";
      for (let d = 1; d <= maxDepth; d++) {
        const ringR = d * RING_SPACING * s;
        if (ringR < 20) continue;
        ctx.fillText(`d${d}`, cx + ringR + 4, cy - 3);
      }
    }

    const labelMode = config.showLabels;
    const showAllLabels = labelMode === "always" || (labelMode === "auto" && s > 1.2);
    const showImportantLabels = labelMode === "auto" && s > 0.6 && s <= 1.2;

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

        if (sx1 < -50 && sx2 < -50) continue;
        if (sx1 > w + 50 && sx2 > w + 50) continue;
        if (sy1 < -50 && sy2 < -50) continue;
        if (sy1 > h + 50 && sy2 > h + 50) continue;

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

    const lim = limited;
    const fontSize = Math.max(7, Math.min(11, 9 * s));

    // Pass 1: truncated nodes
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

        if (n.depth === 0) {
          ctx.fillStyle = isHovered ? "#ffffff" : "rgba(200, 200, 210, 0.7)";
          ctx.fillText(displayLabel, r + 4, fontSize / 3);
        } else {
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
        ctx.textAlign = "left";
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

  drawRef.current = draw;

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

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    resizeCanvas();

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

  useEffect(() => {
    draw();
  }, [draw]);

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
