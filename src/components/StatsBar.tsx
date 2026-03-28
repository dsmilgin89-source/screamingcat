import type { CrawlStats } from "@/types/crawl";

interface StatsBarProps {
  stats: CrawlStats;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function StatsBar({ stats }: StatsBarProps) {
  const progress =
    stats.urls_total > 0
      ? Math.round((stats.urls_crawled / stats.urls_total) * 100)
      : 0;

  return (
    <div className="bg-surface-1 border-b border-surface-3 px-4 py-2">
      <div className="flex items-center gap-6 text-xs">
        <div className="flex items-center gap-6">
          <Stat label="Crawled" value={stats.urls_crawled} />
          <Stat label="Queue" value={stats.urls_queued} />
          <Stat label="Total" value={stats.urls_total} />
        </div>

        <div className="h-4 w-px bg-surface-3" />

        <div className="flex items-center gap-4">
          <StatusBadge label="2xx" count={stats.status_2xx} color="text-success" />
          <StatusBadge label="3xx" count={stats.status_3xx} color="text-info" />
          <StatusBadge label="4xx" count={stats.status_4xx} color="text-warning" />
          <StatusBadge label="5xx" count={stats.status_5xx} color="text-error" />
        </div>

        <div className="h-4 w-px bg-surface-3" />

        <Stat label="Avg Response" value={`${stats.avg_response_ms}ms`} />
        <Stat label="Time" value={formatTime(stats.elapsed_seconds)} />
        <Stat label="URLs/min" value={stats.elapsed_seconds > 0 ? Math.round((stats.urls_crawled / stats.elapsed_seconds) * 60) : 0} />

        <div className="flex-1" />

        {stats.is_running && (
          <div className="flex items-center gap-2">
            <div className="w-32 h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-gray-400 tabular-nums">{progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-500">{label}:</span>
      <span className="text-gray-200 font-medium tabular-nums">{value}</span>
    </div>
  );
}

function StatusBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <span className={`${color} font-medium tabular-nums`}>
      {label}: {count}
    </span>
  );
}
