import { useMemo } from "react";
import type { CrawlResult } from "@/types/crawl";

// ── Crawl Depth Chart ──

export function SankeyDiagram({ results }: { results: CrawlResult[] }) {
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
