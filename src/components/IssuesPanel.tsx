import { useMemo, useState } from "react";
import type { CrawlResult } from "@/types/crawl";
import type { DetectedIssue, IssueCategory, IssueSeverity } from "@/types/issues";
import {
  ISSUE_CATEGORY_LABELS,
  SEVERITY_CONFIG,
  PRIORITY_CONFIG,
} from "@/types/issues";
import { detectIssues, issueSummary } from "@/lib/issueDetector";

interface IssuesPanelProps {
  results: CrawlResult[];
  onUrlClick?: (url: string) => void;
  onIssueSelect?: (urls: string[], label: string) => void;
}

type ViewMode = "overview" | "issues";
type SeverityFilter = IssueSeverity | "all";

export function IssuesPanel({ results, onUrlClick, onIssueSelect }: IssuesPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("issues");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

  const issues = useMemo(() => detectIssues(results), [results]);
  const summary = useMemo(() => issueSummary(issues), [issues]);

  const filtered = useMemo(() => {
    if (severityFilter === "all") return issues;
    return issues.filter((i) => i.definition.severity === severityFilter);
  }, [issues, severityFilter]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<IssueCategory, DetectedIssue[]>();
    for (const issue of filtered) {
      const cat = issue.definition.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(issue);
    }
    // Sort issues within category by priority
    for (const [, list] of map) {
      list.sort(
        (a, b) =>
          PRIORITY_CONFIG[a.definition.priority].order -
          PRIORITY_CONFIG[b.definition.priority].order
      );
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col h-full bg-surface-1">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-3">
        <div className="flex gap-1">
          <TabButton
            active={viewMode === "overview"}
            onClick={() => setViewMode("overview")}
          >
            Overview
          </TabButton>
          <TabButton
            active={viewMode === "issues"}
            onClick={() => setViewMode("issues")}
          >
            Issues
          </TabButton>
        </div>
      </div>

      {viewMode === "overview" ? (
        <OverviewView summary={summary} issues={issues} results={results} />
      ) : (
        <IssuesView
          grouped={grouped}
          severityFilter={severityFilter}
          setSeverityFilter={setSeverityFilter}
          expandedIssue={expandedIssue}
          setExpandedIssue={setExpandedIssue}
          summary={summary}
          onUrlClick={onUrlClick}
          onIssueSelect={onIssueSelect}
        />
      )}
    </div>
  );
}

// ── Overview Tab ──

function OverviewView({
  summary,
  issues,
  results,
}: {
  summary: ReturnType<typeof issueSummary>;
  issues: DetectedIssue[];
  results: CrawlResult[];
}) {
  const htmlPages = results.filter(
    (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300
  );
  const indexable = results.filter((r) => r.indexable);

  // Status code distribution
  const s2xx = results.filter((r) => r.status_code >= 200 && r.status_code < 300).length;
  const s3xx = results.filter((r) => r.status_code >= 300 && r.status_code < 400).length;
  const s4xx = results.filter((r) => r.status_code >= 400 && r.status_code < 500).length;
  const s5xx = results.filter((r) => r.status_code >= 500).length;
  const sErr = results.filter((r) => r.status_code === 0).length;

  const avgResponseTime =
    results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.response_time_ms, 0) / results.length)
      : 0;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      {/* Issue summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard
          label="Errors"
          count={summary.errors}
          color="text-red-400"
          bg="bg-red-500/10"
        />
        <SummaryCard
          label="Warnings"
          count={summary.warnings}
          color="text-yellow-400"
          bg="bg-yellow-500/10"
        />
        <SummaryCard
          label="Opportunities"
          count={summary.opportunities}
          color="text-blue-400"
          bg="bg-blue-500/10"
        />
      </div>

      {/* Crawl stats */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Crawl Summary
        </h4>
        <div className="space-y-1">
          <StatRow label="Total URLs" value={results.length} />
          <StatRow label="HTML Pages" value={htmlPages.length} />
          <StatRow label="Indexable" value={indexable.length} />
          <StatRow label="Avg Response" value={`${avgResponseTime}ms`} />
        </div>
      </div>

      {/* Status codes */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Status Codes
        </h4>
        <div className="space-y-1">
          <StatusBar label="2XX Success" count={s2xx} total={results.length} color="bg-green-500" />
          <StatusBar label="3XX Redirect" count={s3xx} total={results.length} color="bg-blue-500" />
          <StatusBar label="4XX Client Error" count={s4xx} total={results.length} color="bg-yellow-500" />
          <StatusBar label="5XX Server Error" count={s5xx} total={results.length} color="bg-red-500" />
          {sErr > 0 && (
            <StatusBar label="No Response" count={sErr} total={results.length} color="bg-red-800" />
          )}
        </div>
      </div>

      {/* Top issues */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Top Issues
        </h4>
        {issues.length === 0 ? (
          <p className="text-xs text-gray-500 italic py-2">
            {results.length === 0
              ? "Start a crawl to see issues"
              : "No issues found"}
          </p>
        ) : (
          <div className="space-y-1">
            {issues
              .sort((a, b) => b.urls.length - a.urls.length)
              .slice(0, 10)
              .map((issue) => (
                <div
                  key={issue.definition.id}
                  className="flex items-center justify-between py-1 px-2 rounded hover:bg-surface-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <SeverityDot severity={issue.definition.severity} />
                    <span className="text-gray-300 truncate">
                      {issue.definition.name}
                    </span>
                  </div>
                  <span className="text-gray-400 tabular-nums shrink-0 ml-2">
                    {issue.urls.length}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Issues Tab ──

function IssuesView({
  grouped,
  severityFilter,
  setSeverityFilter,
  expandedIssue,
  setExpandedIssue,
  summary,
  onUrlClick,
  onIssueSelect,
}: {
  grouped: Map<IssueCategory, DetectedIssue[]>;
  severityFilter: SeverityFilter;
  setSeverityFilter: (v: SeverityFilter) => void;
  expandedIssue: string | null;
  setExpandedIssue: (v: string | null) => void;
  summary: ReturnType<typeof issueSummary>;
  onUrlClick?: (url: string) => void;
  onIssueSelect?: (urls: string[], label: string) => void;
}) {
  return (
    <>
      {/* Severity filter pills */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-surface-3">
        <FilterPill
          active={severityFilter === "all"}
          onClick={() => setSeverityFilter("all")}
          count={summary.errors + summary.warnings + summary.opportunities}
        >
          All
        </FilterPill>
        <FilterPill
          active={severityFilter === "error"}
          onClick={() => setSeverityFilter("error")}
          count={summary.errors}
          color="text-red-400"
        >
          Errors
        </FilterPill>
        <FilterPill
          active={severityFilter === "warning"}
          onClick={() => setSeverityFilter("warning")}
          count={summary.warnings}
          color="text-yellow-400"
        >
          Warnings
        </FilterPill>
        <FilterPill
          active={severityFilter === "opportunity"}
          onClick={() => setSeverityFilter("opportunity")}
          count={summary.opportunities}
          color="text-blue-400"
        >
          Opportunities
        </FilterPill>
      </div>

      {/* Issue list grouped by category */}
      <div className="flex-1 overflow-y-auto">
        {grouped.size === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-xs">
            No issues found
          </div>
        ) : (
          Array.from(grouped.entries()).map(([category, categoryIssues]) => (
            <div key={category}>
              <div className="px-3 py-1.5 bg-surface-2 border-b border-surface-3 sticky top-0 z-10">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {ISSUE_CATEGORY_LABELS[category]}
                </span>
              </div>
              {categoryIssues.map((issue) => (
                <IssueRow
                  key={issue.definition.id}
                  issue={issue}
                  expanded={expandedIssue === issue.definition.id}
                  onToggle={() =>
                    setExpandedIssue(
                      expandedIssue === issue.definition.id
                        ? null
                        : issue.definition.id
                    )
                  }
                  onUrlClick={onUrlClick}
                  onIssueSelect={onIssueSelect}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── Issue Row with expandable URL list ──

function IssueRow({
  issue,
  expanded,
  onToggle,
  onUrlClick,
  onIssueSelect,
}: {
  issue: DetectedIssue;
  expanded: boolean;
  onToggle: () => void;
  onUrlClick?: (url: string) => void;
  onIssueSelect?: (urls: string[], label: string) => void;
}) {
  const { definition, urls } = issue;
  const sevCfg = SEVERITY_CONFIG[definition.severity];
  const priCfg = PRIORITY_CONFIG[definition.priority];

  const handleRowClick = () => {
    onToggle();
    // Show affected URLs in main table
    onIssueSelect?.(urls, definition.name);
  };

  return (
    <div className="border-b border-surface-3/50">
      <button
        onClick={handleRowClick}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2 transition-colors text-left"
      >
        <svg
          className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>

        <SeverityDot severity={definition.severity} />

        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-200 truncate block">
            {definition.name}
          </span>
        </div>

        <span className={`text-xs ${priCfg.color} shrink-0`}>
          {priCfg.label}
        </span>

        <span
          className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded border ${sevCfg.bgColor} ${sevCfg.color} shrink-0`}
        >
          {urls.length}
        </span>
      </button>

      {expanded && (
        <div className="bg-surface-0 border-t border-surface-3/50">
          {/* Description */}
          <p className="px-3 py-2 text-xs text-gray-500 border-b border-surface-3/30">
            {definition.description}
          </p>

          {/* URL list */}
          <div className="max-h-64 overflow-y-auto">
            {urls.slice(0, 100).map((url) => (
              <button
                key={url}
                onClick={() => onUrlClick?.(url)}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-accent hover:bg-surface-2 truncate transition-colors font-mono"
                title={url}
              >
                {shortenUrl(url)}
              </button>
            ))}
            {urls.length > 100 && (
              <p className="px-3 py-1.5 text-xs text-gray-500 italic">
                ... and {urls.length - 100} more URLs
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small UI components ──

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded transition-colors ${
        active
          ? "bg-accent/15 text-accent font-medium"
          : "text-gray-400 hover:text-gray-200 hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

function FilterPill({
  active,
  onClick,
  count,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full transition-colors ${
        active
          ? "bg-surface-3 text-gray-100"
          : "text-gray-500 hover:text-gray-300 hover:bg-surface-2"
      }`}
    >
      {children}
      <span className={`tabular-nums ${color || "text-gray-400"}`}>
        {count}
      </span>
    </button>
  );
}

function SummaryCard({
  label,
  count,
  color,
  bg,
}: {
  label: string;
  count: number;
  color: string;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-lg p-3 text-center`}>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>
        {count}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300 tabular-nums">{value}</span>
    </div>
  );
}

function StatusBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-400 tabular-nums">{count}</span>
      </div>
      <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SeverityDot({ severity }: { severity: IssueSeverity }) {
  const colors: Record<IssueSeverity, string> = {
    error: "bg-red-400",
    warning: "bg-yellow-400",
    opportunity: "bg-blue-400",
  };
  return <span className={`w-2 h-2 rounded-full ${colors[severity]} shrink-0`} />;
}

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}
