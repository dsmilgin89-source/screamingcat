import { useMemo, useState, useRef, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import type { CrawlResult, RedirectHop, LinkInfo, StructuredDataItem } from "@/types/crawl";
import type { PageSpeedResult, GscPageData, GaPageData } from "@/types/integrations";
import { buildInlinksMap, getInlinksCount, getUniqueAnchorTexts, isGenericAnchorText } from "@/lib/linkGraph";

// ── Tab definitions ──

type TabId =
  | "internal"
  | "response_codes"
  | "page_titles"
  | "meta_description"
  | "h1"
  | "h2"
  | "content"
  | "url"
  | "canonicals"
  | "directives"
  | "links"
  | "inlinks"
  | "anchor_text"
  | "security"
  | "protocol"
  | "pagination"
  | "images"
  | "hreflang"
  | "structured_data"
  | "sitemaps"
  | "custom_search"
  | "custom_extraction"
  | "performance"
  | "pagespeed"
  | "search_console"
  | "analytics";

interface TabDef {
  id: TabId;
  label: string;
  filter?: (r: CrawlResult) => boolean;
  filterOptions?: { label: string; filter: (r: CrawlResult) => boolean }[];
}

const TABS: TabDef[] = [
  {
    id: "internal",
    label: "Internal",
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "HTML", filter: (r) => r.content_type.includes("text/html") },
      { label: "JavaScript", filter: (r) => r.content_type.includes("javascript") },
      { label: "CSS", filter: (r) => r.content_type.includes("css") },
      { label: "Images", filter: (r) => r.content_type.includes("image/") },
      { label: "Indexable", filter: (r) => r.indexable },
      { label: "Non-Indexable", filter: (r) => !r.indexable },
      { label: "No Title", filter: (r) => r.content_type.includes("text/html") && !r.title },
      { label: "No Description", filter: (r) => r.content_type.includes("text/html") && !r.meta_description },
      { label: "No H1", filter: (r) => r.content_type.includes("text/html") && !r.h1 },
    ],
  },
  {
    id: "response_codes",
    label: "Response Codes",
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "2XX Success", filter: (r) => r.status_code >= 200 && r.status_code < 300 },
      { label: "3XX Redirect", filter: (r) => r.status_code >= 300 && r.status_code < 400 },
      { label: "4XX Client Error", filter: (r) => r.status_code >= 400 && r.status_code < 500 },
      { label: "5XX Server Error", filter: (r) => r.status_code >= 500 },
      { label: "No Response", filter: (r) => r.status_code === 0 },
      { label: "Redirect Loops", filter: (r) => {
        if (!r.redirect_chain || r.redirect_chain.length === 0) return false;
        const urls = r.redirect_chain.map((h: RedirectHop) => h.url);
        return new Set(urls).size < urls.length;
      }},
      { label: "Long Chains (>2)", filter: (r) => (r.redirect_chain?.length || 0) > 2 },
    ],
  },
  {
    id: "page_titles",
    label: "Page Titles",
    filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300,
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Missing", filter: (r) => !r.title },
      { label: "Over 60 Chars", filter: (r) => r.title.length > 60 },
      { label: "Below 30 Chars", filter: (r) => r.title.length > 0 && r.title.length < 30 },
    ],
  },
  {
    id: "meta_description",
    label: "Meta Description",
    filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300,
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Missing", filter: (r) => !r.meta_description },
      { label: "Over 155 Chars", filter: (r) => r.meta_description.length > 155 },
      { label: "Below 70 Chars", filter: (r) => r.meta_description.length > 0 && r.meta_description.length < 70 },
    ],
  },
  {
    id: "h1",
    label: "H1",
    filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300,
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Missing", filter: (r) => !r.h1 },
      { label: "Over 70 Chars", filter: (r) => r.h1.length > 70 },
    ],
  },
  {
    id: "h2",
    label: "H2",
    filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300,
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Missing", filter: (r) => r.h2_count === 0 },
      { label: "Multiple", filter: (r) => r.h2_count > 1 },
      { label: "Over 5", filter: (r) => r.h2_count > 5 },
    ],
  },
  {
    id: "content",
    label: "Content",
    filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300,
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Duplicate Content", filter: () => true }, // actual filtering handled via contentHashFreq in filteredData
      { label: "Low Word Count (<200)", filter: (r) => r.word_count > 0 && r.word_count < 200 },
      { label: "No Content", filter: (r) => r.word_count === 0 },
    ],
  },
  {
    id: "url",
    label: "URL",
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Has Parameters", filter: (r) => { try { return !!new URL(r.url).search; } catch { return false; } } },
      { label: "Has Uppercase", filter: (r) => { try { return /[A-Z]/.test(new URL(r.url).pathname); } catch { return false; } } },
      { label: "Over 115 Chars", filter: (r) => r.url.length > 115 },
    ],
  },
  {
    id: "canonicals",
    label: "Canonicals",
    filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300,
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Missing", filter: (r) => !r.canonical },
      { label: "Self-Referencing", filter: (r) => r.canonical === r.url },
      { label: "Non-Self", filter: (r) => !!r.canonical && r.canonical !== r.url },
    ],
  },
  {
    id: "directives",
    label: "Directives",
    filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300,
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Noindex", filter: (r) => r.robots_meta.toLowerCase().includes("noindex") },
      { label: "Nofollow", filter: (r) => r.robots_meta.toLowerCase().includes("nofollow") },
      { label: "Non-Indexable", filter: (r) => !r.indexable },
      { label: "Blocked by Robots", filter: (r) => r.robots_blocked === true },
    ],
  },
  {
    id: "links",
    label: "Links",
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "No Internal Outlinks", filter: (r) => r.internal_links === 0 },
      { label: "No External Outlinks", filter: (r) => r.external_links === 0 },
      { label: "High Outlinks (>100)", filter: (r) => r.internal_links + r.external_links > 100 },
    ],
  },
  {
    id: "inlinks",
    label: "Inlinks",
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Follow Only", filter: () => true },
      { label: "Nofollow Only", filter: () => true },
      { label: "No Inlinks", filter: () => true },
    ],
  },
  {
    id: "anchor_text",
    label: "Anchor Text",
    filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300,
  },
  {
    id: "security",
    label: "Security",
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Missing HSTS", filter: (r) => !r.has_hsts && r.url.startsWith("https://") },
      { label: "Missing CSP", filter: (r) => !r.has_csp },
      { label: "Mixed Content", filter: (r) => (r.mixed_content_count ?? 0) > 0 },
      { label: "Insecure Forms", filter: (r) => (r.insecure_form_count ?? 0) > 0 },
      { label: "HTTP Pages", filter: (r) => r.url.startsWith("http://") },
    ],
  },
  {
    id: "protocol",
    label: "Protocol",
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "HTTPS", filter: (r) => r.url.startsWith("https://") },
      { label: "HTTP", filter: (r) => r.url.startsWith("http://") },
    ],
  },
  {
    id: "pagination",
    label: "Pagination",
    filter: (r) => !!(r.rel_next || r.rel_prev),
  },
  {
    id: "images",
    label: "Images",
    filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300,
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Missing Alt Text", filter: (r) => r.images_missing_alt > 0 },
      { label: "No Images", filter: (r) => r.images_count === 0 },
      { label: "Over 10 Images", filter: (r) => r.images_count > 10 },
    ],
  },
  {
    id: "hreflang",
    label: "Hreflang",
    filter: (r) => r.content_type.includes("text/html") && r.hreflang && r.hreflang.length > 0,
  },
  {
    id: "structured_data",
    label: "Structured Data",
    filterOptions: [
      { label: "All", filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300 },
      { label: "Has Errors", filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300 && (r.structured_data?.some((s: StructuredDataItem) => !s.is_valid) ?? false) },
      { label: "All Valid", filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300 && (r.structured_data?.length ?? 0) > 0 && (r.structured_data?.every((s: StructuredDataItem) => s.is_valid) ?? false) },
    ],
  },
  {
    id: "sitemaps",
    label: "Sitemaps",
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "In Sitemap Only", filter: (r) => r.in_sitemap === true },
      { label: "Not In Sitemap", filter: (r) => r.in_sitemap !== true },
      { label: "Robots Blocked", filter: (r) => r.robots_blocked === true },
    ],
  },
  {
    id: "custom_search",
    label: "Custom Search",
    filter: (r: CrawlResult) => r.custom_search_results && r.custom_search_results.length > 0,
  },
  {
    id: "custom_extraction",
    label: "Custom Extraction",
    filter: (r: CrawlResult) => r.custom_extraction_results && r.custom_extraction_results.length > 0,
  },
  {
    id: "performance",
    label: "Performance",
    filter: (r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300,
    filterOptions: [
      { label: "All", filter: () => true },
      { label: "Missing Viewport", filter: (r) => !r.has_viewport_meta },
      { label: "Missing Charset", filter: (r) => !r.has_charset },
      { label: "Missing Doctype", filter: (r) => !r.has_doctype },
      { label: "High DOM Depth (>32)", filter: (r) => r.dom_depth > 32 },
      { label: "Low Text Ratio (<10%)", filter: (r) => r.text_ratio > 0 && r.text_ratio < 10 },
      { label: "Many JS Files (>10)", filter: (r) => r.js_count > 10 },
    ],
  },
  {
    id: "pagespeed",
    label: "PageSpeed",
  },
  {
    id: "search_console",
    label: "Search Console",
  },
  {
    id: "analytics",
    label: "Analytics",
  },
];

// ── Column definitions per tab ──

function StatusBadge({ code }: { code: number }) {
  let color = "bg-gray-600";
  if (code >= 200 && code < 300) color = "bg-green-600";
  else if (code >= 300 && code < 400) color = "bg-blue-600";
  else if (code >= 400 && code < 500) color = "bg-yellow-600";
  else if (code >= 500) color = "bg-red-600";
  else if (code === 0) color = "bg-red-800";
  return (
    <span className={`${color} text-white text-xs px-1.5 py-0.5 rounded font-mono`}>
      {code || "ERR"}
    </span>
  );
}

function MissingCell({ value }: { value: string }) {
  return value ? (
    <span className="truncate block" title={value}>{value}</span>
  ) : (
    <span className="text-gray-500 italic">missing</span>
  );
}

function LenBadge({ len, min, max }: { len: number; min: number; max: number }) {
  let color = "text-green-400";
  if (len === 0) color = "text-red-400";
  else if (len > max) color = "text-yellow-400";
  else if (len < min) color = "text-blue-400";
  return <span className={`tabular-nums ${color}`}>{len}</span>;
}

function BoolCell({ value }: { value: boolean }) {
  return value ? (
    <span className="text-green-400">Yes</span>
  ) : (
    <span className="text-red-400">No</span>
  );
}

function ResponseTimeCell({ ms }: { ms: number }) {
  let color = "text-green-400";
  if (ms > 1000) color = "text-red-400";
  else if (ms > 500) color = "text-yellow-400";
  return <span className={`${color} tabular-nums`}>{ms}</span>;
}

function SizeCell({ bytes }: { bytes: number }) {
  if (bytes > 1048576) return <>{(bytes / 1048576).toFixed(1)} MB</>;
  if (bytes > 1024) return <>{(bytes / 1024).toFixed(1)} KB</>;
  return <>{bytes} B</>;
}

// URL column shared across tabs
const urlCol: ColumnDef<CrawlResult> = {
  accessorKey: "url",
  header: "URL",
  size: 400,
  cell: ({ getValue }) => {
    const url = getValue<string>();
    return <span className="truncate block max-w-[400px]" title={url}>{url}</span>;
  },
};

const statusCol: ColumnDef<CrawlResult> = {
  accessorKey: "status_code",
  header: "Status",
  size: 70,
  cell: ({ getValue }) => <StatusBadge code={getValue<number>()} />,
};

const indexableCol: ColumnDef<CrawlResult> = {
  accessorKey: "indexable",
  header: "Indexable",
  size: 80,
  cell: ({ getValue }) => <BoolCell value={getValue<boolean>()} />,
};

const responseTimeCol: ColumnDef<CrawlResult> = {
  accessorKey: "response_time_ms",
  header: "Time (ms)",
  size: 85,
  cell: ({ getValue }) => <ResponseTimeCell ms={getValue<number>()} />,
};

const depthCol: ColumnDef<CrawlResult> = {
  accessorKey: "depth",
  header: "Depth",
  size: 60,
};

const contentTypeCol: ColumnDef<CrawlResult> = {
  accessorKey: "content_type",
  header: "Content Type",
  size: 150,
  cell: ({ getValue }) => {
    const ct = getValue<string>();
    const short = ct.split(";")[0];
    return <span className="truncate block max-w-[150px]" title={ct}>{short}</span>;
  },
};

// ── Helper: Normalize URL for matching (strip trailing slash) ──
function normalizeUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed || url;
}

// ── Score badge for PageSpeed ──
function ScoreBadge({ score, analyzed }: { score: number; analyzed?: boolean }) {
  if (!analyzed) {
    return <span className="text-gray-600 text-xs">—</span>;
  }
  let color = "text-green-400 bg-green-500/10";
  if (score < 0) color = "text-red-400 bg-red-500/10"; // error
  else if (score < 50) color = "text-red-400 bg-red-500/10";
  else if (score < 90) color = "text-yellow-400 bg-yellow-500/10";
  return (
    <span className={`${color} text-xs px-1.5 py-0.5 rounded font-mono tabular-nums`}>
      {score >= 0 ? Math.round(score) : "ERR"}
    </span>
  );
}

function getColumnsForTab(tabId: TabId, inlinksMap?: Map<string, LinkInfo[]>): ColumnDef<CrawlResult>[] {
  switch (tabId) {
    case "internal":
      return [
        urlCol,
        statusCol,
        contentTypeCol,
        {
          accessorKey: "title",
          header: "Title",
          size: 220,
          cell: ({ getValue }) => <MissingCell value={getValue<string>()} />,
        },
        {
          accessorKey: "meta_description",
          header: "Description",
          size: 180,
          cell: ({ getValue }) => <MissingCell value={getValue<string>()} />,
        },
        {
          accessorKey: "h1",
          header: "H1",
          size: 180,
          cell: ({ getValue }) => <MissingCell value={getValue<string>()} />,
        },
        { accessorKey: "h2_count", header: "H2", size: 50 },
        { accessorKey: "word_count", header: "Words", size: 70 },
        { accessorKey: "internal_links", header: "Inlinks", size: 70 },
        { accessorKey: "external_links", header: "Outlinks", size: 70 },
        responseTimeCol,
        depthCol,
        indexableCol,
      ];

    case "response_codes":
      return [
        urlCol,
        statusCol,
        contentTypeCol,
        {
          accessorKey: "redirect_url",
          header: "Redirect URL",
          size: 300,
          cell: ({ getValue }) => {
            const v = getValue<string>();
            return v ? (
              <span className="truncate block max-w-[300px] text-blue-400" title={v}>{v}</span>
            ) : (
              <span className="text-gray-600">—</span>
            );
          },
        },
        {
          id: "chain_length",
          header: "Chain Length",
          size: 100,
          accessorFn: (r) => r.redirect_chain?.length || 0,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            if (v === 0) return <span className="text-gray-600">—</span>;
            let color = "bg-blue-600";
            if (v > 2) color = "bg-yellow-600";
            if (v > 4) color = "bg-red-600";
            return (
              <span className={`${color} text-white text-xs px-1.5 py-0.5 rounded font-mono`}>
                {v}
              </span>
            );
          },
        },
        responseTimeCol,
        indexableCol,
        depthCol,
      ];

    case "page_titles":
      return [
        urlCol,
        {
          accessorKey: "title",
          header: "Title",
          size: 350,
          cell: ({ getValue }) => <MissingCell value={getValue<string>()} />,
        },
        {
          id: "title_length",
          header: "Length",
          size: 70,
          accessorFn: (r) => r.title.length,
          cell: ({ getValue }) => <LenBadge len={getValue<number>()} min={30} max={60} />,
        },
        statusCol,
        indexableCol,
      ];

    case "meta_description":
      return [
        urlCol,
        {
          accessorKey: "meta_description",
          header: "Meta Description",
          size: 400,
          cell: ({ getValue }) => <MissingCell value={getValue<string>()} />,
        },
        {
          id: "desc_length",
          header: "Length",
          size: 70,
          accessorFn: (r) => r.meta_description.length,
          cell: ({ getValue }) => <LenBadge len={getValue<number>()} min={70} max={155} />,
        },
        statusCol,
        indexableCol,
      ];

    case "h1":
      return [
        urlCol,
        {
          accessorKey: "h1",
          header: "H1",
          size: 400,
          cell: ({ getValue }) => <MissingCell value={getValue<string>()} />,
        },
        {
          id: "h1_length",
          header: "Length",
          size: 70,
          accessorFn: (r) => r.h1.length,
          cell: ({ getValue }) => <LenBadge len={getValue<number>()} min={1} max={70} />,
        },
        statusCol,
        indexableCol,
      ];

    case "h2":
      return [
        urlCol,
        {
          accessorKey: "h2_count",
          header: "H2 Count",
          size: 90,
          cell: ({ getValue }) => {
            const c = getValue<number>();
            return <span className={c === 0 ? "text-yellow-400" : "text-gray-300"}>{c}</span>;
          },
        },
        {
          id: "h2_all",
          header: "H2 Headings",
          size: 500,
          accessorFn: (r) => r.h2s?.join(" | ") || "",
          cell: ({ row }) => {
            const h2s = row.original.h2s;
            if (!h2s || h2s.length === 0) return <span className="text-gray-600 italic">none</span>;
            return (
              <div className="flex flex-col gap-0.5">
                {h2s.map((h, i) => (
                  <span key={i} className="text-gray-300 truncate block" title={h}>
                    <span className="text-gray-600 text-[10px] mr-1">{i + 1}.</span>
                    {h}
                  </span>
                ))}
              </div>
            );
          },
        },
        statusCol,
        indexableCol,
      ];

    case "content":
      return [
        urlCol,
        {
          accessorKey: "word_count",
          header: "Word Count",
          size: 100,
          cell: ({ getValue }) => {
            const w = getValue<number>();
            let color = "text-gray-300";
            if (w < 200 && w > 0) color = "text-yellow-400";
            else if (w === 0) color = "text-red-400";
            return <span className={`tabular-nums ${color}`}>{w}</span>;
          },
        },
        {
          accessorKey: "content_length",
          header: "Page Size",
          size: 90,
          cell: ({ getValue }) => <SizeCell bytes={getValue<number>()} />,
        },
        {
          id: "content_hash",
          header: "Content Hash",
          size: 100,
          accessorFn: (r) => r.content_hash || "",
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return <span className="text-gray-600">—</span>;
            return <span className="font-mono text-xs text-gray-400" title={v}>{v.slice(0, 8)}</span>;
          },
        },
        statusCol,
        responseTimeCol,
        indexableCol,
      ];

    case "url":
      return [
        urlCol,
        {
          id: "url_length",
          header: "Length",
          size: 70,
          accessorFn: (r) => r.url.length,
          cell: ({ getValue }) => {
            const len = getValue<number>();
            return (
              <span className={`tabular-nums ${len > 115 ? "text-yellow-400" : "text-gray-300"}`}>
                {len}
              </span>
            );
          },
        },
        {
          id: "has_params",
          header: "Params",
          size: 70,
          accessorFn: (r) => {
            try { return new URL(r.url).search ? "Yes" : "No"; } catch { return "No"; }
          },
          cell: ({ getValue }) => {
            const v = getValue<string>();
            return v === "Yes" ? (
              <span className="text-yellow-400">Yes</span>
            ) : (
              <span className="text-gray-500">No</span>
            );
          },
        },
        {
          id: "has_uppercase",
          header: "Uppercase",
          size: 85,
          accessorFn: (r) => {
            try { return /[A-Z]/.test(new URL(r.url).pathname) ? "Yes" : "No"; } catch { return "No"; }
          },
          cell: ({ getValue }) => {
            const v = getValue<string>();
            return v === "Yes" ? (
              <span className="text-yellow-400">Yes</span>
            ) : (
              <span className="text-gray-500">No</span>
            );
          },
        },
        statusCol,
        depthCol,
      ];

    case "canonicals":
      return [
        urlCol,
        {
          accessorKey: "canonical",
          header: "Canonical URL",
          size: 400,
          cell: ({ getValue }) => <MissingCell value={getValue<string>()} />,
        },
        {
          id: "canonical_status",
          header: "Self-Ref",
          size: 80,
          accessorFn: (r) => {
            if (!r.canonical) return "Missing";
            return r.canonical === r.url ? "Yes" : "No";
          },
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (v === "Yes") return <span className="text-green-400">Yes</span>;
            if (v === "Missing") return <span className="text-yellow-400">Missing</span>;
            return <span className="text-red-400">No</span>;
          },
        },
        statusCol,
        indexableCol,
      ];

    case "directives":
      return [
        urlCol,
        {
          accessorKey: "robots_meta",
          header: "Meta Robots",
          size: 200,
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return <span className="text-gray-500">—</span>;
            const hasNoindex = v.toLowerCase().includes("noindex");
            const hasNofollow = v.toLowerCase().includes("nofollow");
            return (
              <span className={hasNoindex || hasNofollow ? "text-yellow-400" : "text-gray-300"}>
                {v}
              </span>
            );
          },
        },
        {
          accessorKey: "meta_refresh",
          header: "Meta Refresh",
          size: 180,
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return <span className="text-gray-500">—</span>;
            const display = v.length > 50 ? v.slice(0, 50) + "…" : v;
            return <span className="truncate block max-w-[180px] text-gray-300" title={v}>{display}</span>;
          },
        },
        {
          accessorKey: "rel_next",
          header: "Rel Next",
          size: 180,
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return <span className="text-gray-500">—</span>;
            const display = v.length > 50 ? v.slice(0, 50) + "…" : v;
            return <span className="truncate block max-w-[180px] text-blue-400" title={v}>{display}</span>;
          },
        },
        {
          accessorKey: "rel_prev",
          header: "Rel Prev",
          size: 180,
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return <span className="text-gray-500">—</span>;
            const display = v.length > 50 ? v.slice(0, 50) + "…" : v;
            return <span className="truncate block max-w-[180px] text-blue-400" title={v}>{display}</span>;
          },
        },
        indexableCol,
        statusCol,
        depthCol,
      ];

    case "links":
      return [
        urlCol,
        { accessorKey: "internal_links", header: "Internal Outlinks", size: 130 },
        { accessorKey: "external_links", header: "External Outlinks", size: 130 },
        {
          id: "total_links",
          header: "Total Links",
          size: 100,
          accessorFn: (r) => r.internal_links + r.external_links,
        },
        {
          id: "unique_inlinks",
          header: "Unique Inlinks",
          size: 120,
          accessorFn: (r) => inlinksMap ? getInlinksCount(inlinksMap, r.url) : 0,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v === 0 ? "text-gray-500" : "text-gray-300"}`}>{v}</span>;
          },
        },
        {
          id: "top_anchor",
          header: "Top Anchor",
          size: 180,
          accessorFn: (r) => {
            if (!inlinksMap) return "";
            const anchors = getUniqueAnchorTexts(inlinksMap, r.url);
            return anchors.length > 0 ? anchors[0] : "";
          },
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return <span className="text-gray-500">--</span>;
            const display = v.length > 40 ? v.slice(0, 40) + "..." : v;
            return <span className="truncate block max-w-[180px] text-gray-300" title={v}>{display}</span>;
          },
        },
        depthCol,
        statusCol,
        indexableCol,
      ];

    case "inlinks":
      return [
        urlCol,
        {
          id: "inlinks_count",
          header: "Inlinks Count",
          size: 120,
          accessorFn: (r) => inlinksMap ? getInlinksCount(inlinksMap, r.url) : 0,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v === 0 ? "text-red-400" : "text-gray-300"}`}>{v}</span>;
          },
        },
        {
          id: "unique_anchors_count",
          header: "Unique Anchors",
          size: 130,
          accessorFn: (r) => inlinksMap ? getUniqueAnchorTexts(inlinksMap, r.url).length : 0,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v === 0 ? "text-gray-500" : "text-gray-300"}`}>{v}</span>;
          },
        },
        {
          id: "inlinks_top_anchor",
          header: "Top Anchor Text",
          size: 250,
          accessorFn: (r) => {
            if (!inlinksMap) return "";
            const anchors = getUniqueAnchorTexts(inlinksMap, r.url);
            return anchors.length > 0 ? anchors[0] : "";
          },
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return <span className="text-gray-500 italic">none</span>;
            const display = v.length > 60 ? v.slice(0, 60) + "..." : v;
            return <span className="truncate block max-w-[250px] text-gray-300" title={v}>{display}</span>;
          },
        },
        statusCol,
        indexableCol,
      ];

    case "anchor_text":
      return [
        urlCol,
        {
          id: "internal_outlinks_count",
          header: "Internal Outlinks",
          size: 130,
          accessorFn: (r) => r.outlinks?.filter((l) => l.is_internal).length ?? r.internal_links,
          cell: ({ getValue }) => <span className="tabular-nums text-gray-300">{getValue<number>()}</span>,
        },
        {
          id: "external_outlinks_count",
          header: "External Outlinks",
          size: 130,
          accessorFn: (r) => r.outlinks?.filter((l) => !l.is_internal).length ?? r.external_links,
          cell: ({ getValue }) => <span className="tabular-nums text-gray-300">{getValue<number>()}</span>,
        },
        {
          id: "unique_anchor_texts_used",
          header: "Unique Anchor Texts",
          size: 150,
          accessorFn: (r) => {
            if (!r.outlinks) return 0;
            const texts = new Set(r.outlinks.map((l) => l.anchor_text.trim()).filter(Boolean));
            return texts.size;
          },
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v === 0 ? "text-gray-500" : "text-gray-300"}`}>{v}</span>;
          },
        },
        {
          id: "generic_anchor_count",
          header: "Generic Anchors",
          size: 130,
          accessorFn: (r) => {
            if (!r.outlinks) return 0;
            return r.outlinks.filter((l) => l.anchor_text.trim() && isGenericAnchorText(l.anchor_text)).length;
          },
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 0 ? "text-yellow-400" : "text-gray-500"}`}>{v}</span>;
          },
        },
        {
          id: "anchor_top_text",
          header: "Top Anchor Text",
          size: 220,
          accessorFn: (r) => {
            if (!r.outlinks) return "";
            const texts = r.outlinks.map((l) => l.anchor_text.trim()).filter(Boolean);
            return texts.length > 0 ? texts[0] : "";
          },
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return <span className="text-gray-500 italic">none</span>;
            const display = v.length > 50 ? v.slice(0, 50) + "..." : v;
            return <span className="truncate block max-w-[220px] text-gray-300" title={v}>{display}</span>;
          },
        },
        statusCol,
        indexableCol,
      ];

    case "security":
      return [
        urlCol,
        {
          id: "protocol",
          header: "Protocol",
          size: 90,
          accessorFn: (r) => {
            try { return new URL(r.url).protocol.replace(":", "").toUpperCase(); } catch { return "?"; }
          },
          cell: ({ getValue }) => {
            const v = getValue<string>();
            return v === "HTTPS" ? (
              <span className="text-green-400">HTTPS</span>
            ) : (
              <span className="text-red-400">HTTP</span>
            );
          },
        },
        statusCol,
        {
          id: "has_hsts",
          header: "HSTS",
          size: 70,
          accessorFn: (r) => r.has_hsts,
          cell: ({ getValue }) => {
            const v = getValue<boolean>();
            return v ? (
              <span className="text-green-400">Yes</span>
            ) : (
              <span className="text-red-400">No</span>
            );
          },
        },
        {
          id: "has_csp",
          header: "CSP",
          size: 70,
          accessorFn: (r) => r.has_csp,
          cell: ({ getValue }) => {
            const v = getValue<boolean>();
            return v ? (
              <span className="text-green-400">Yes</span>
            ) : (
              <span className="text-red-400">No</span>
            );
          },
        },
        {
          id: "has_x_frame_options",
          header: "X-Frame-Options",
          size: 120,
          accessorFn: (r) => r.has_x_frame_options,
          cell: ({ getValue }) => {
            const v = getValue<boolean>();
            return v ? (
              <span className="text-green-400">Yes</span>
            ) : (
              <span className="text-red-400">No</span>
            );
          },
        },
        {
          id: "has_x_content_type_options",
          header: "X-Content-Type",
          size: 120,
          accessorFn: (r) => r.has_x_content_type_options,
          cell: ({ getValue }) => {
            const v = getValue<boolean>();
            return v ? (
              <span className="text-green-400">Yes</span>
            ) : (
              <span className="text-red-400">No</span>
            );
          },
        },
        {
          id: "mixed_content_count",
          header: "Mixed Content",
          size: 110,
          accessorFn: (r) => r.mixed_content_count ?? 0,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 0 ? "text-red-400" : "text-gray-300"}`}>{v}</span>;
          },
        },
        {
          id: "insecure_form_count",
          header: "Insecure Forms",
          size: 110,
          accessorFn: (r) => r.insecure_form_count ?? 0,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 0 ? "text-red-400" : "text-gray-300"}`}>{v}</span>;
          },
        },
        indexableCol,
      ];

    case "protocol":
      return [
        urlCol,
        {
          id: "protocol_col",
          header: "Protocol",
          size: 80,
          accessorFn: (r) => {
            try { return new URL(r.url).protocol.replace(":", ""); } catch { return ""; }
          },
          cell: ({ getValue }) => {
            const v = getValue<string>();
            return v === "https" ? (
              <span className="text-green-400">https</span>
            ) : (
              <span className="text-red-400">{v}</span>
            );
          },
        },
        statusCol,
        {
          accessorKey: "redirect_url",
          header: "Redirect URL",
          size: 300,
          cell: ({ getValue }) => {
            const v = getValue<string>();
            return v ? (
              <span className="truncate block max-w-[300px] text-blue-400" title={v}>{v}</span>
            ) : (
              <span className="text-gray-600">\u2014</span>
            );
          },
        },
        {
          id: "has_hsts_proto",
          header: "HSTS",
          size: 60,
          accessorFn: (r) => r.has_hsts,
          cell: ({ getValue }) => <BoolCell value={getValue<boolean>()} />,
        },
        {
          id: "mixed_content_proto",
          header: "Mixed Content",
          size: 100,
          accessorFn: (r) => r.mixed_content_count ?? 0,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 0 ? "text-red-400" : "text-gray-300"}`}>{v}</span>;
          },
        },
      ];

    case "pagination":
      return [
        urlCol,
        statusCol,
        {
          accessorKey: "rel_next",
          header: "Rel Next",
          size: 300,
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return <span className="text-gray-500">\u2014</span>;
            return <span className="truncate block max-w-[300px] text-blue-400" title={v}>{v}</span>;
          },
        },
        {
          accessorKey: "rel_prev",
          header: "Rel Prev",
          size: 300,
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return <span className="text-gray-500">\u2014</span>;
            return <span className="truncate block max-w-[300px] text-blue-400" title={v}>{v}</span>;
          },
        },
        indexableCol,
      ];

    case "images":
      return [
        urlCol,
        {
          accessorKey: "images_count",
          header: "Images",
          size: 80,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v === 0 ? "text-gray-500" : "text-gray-300"}`}>{v}</span>;
          },
        },
        {
          accessorKey: "images_missing_alt",
          header: "Missing Alt",
          size: 100,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 0 ? "text-red-400" : "text-green-400"}`}>{v}</span>;
          },
        },
        {
          id: "alt_coverage",
          header: "Alt Coverage",
          size: 110,
          accessorFn: (r) => r.images_count > 0 ? Math.round(((r.images_count - r.images_missing_alt) / r.images_count) * 100) : 100,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            let color = "text-green-400";
            if (v < 50) color = "text-red-400";
            else if (v < 100) color = "text-yellow-400";
            return <span className={`tabular-nums ${color}`}>{v}%</span>;
          },
        },
        statusCol,
        indexableCol,
      ];

    case "hreflang":
      return [
        urlCol,
        {
          id: "hreflang_count",
          header: "Languages",
          size: 100,
          accessorFn: (r) => r.hreflang?.length ?? 0,
          cell: ({ getValue }) => <span className="tabular-nums text-gray-300">{getValue<number>()}</span>,
        },
        {
          id: "hreflang_langs",
          header: "Hreflang Tags",
          size: 300,
          cell: ({ row }) => {
            const entries = row.original.hreflang;
            if (!entries || entries.length === 0) return <span className="text-gray-500">--</span>;
            return (
              <div className="flex flex-wrap gap-1">
                {entries.map((h, i) => (
                  <span key={i} className="text-xs bg-accent/15 text-accent px-1.5 py-0.5 rounded font-mono">
                    {h.lang}
                  </span>
                ))}
              </div>
            );
          },
        },
        statusCol,
        indexableCol,
      ];

    case "structured_data":
      return [
        urlCol,
        {
          id: "schema_types",
          header: "Schema Types",
          size: 300,
          cell: ({ row }) => {
            const types = row.original.structured_data_types;
            if (!types || types.length === 0) return <span className="text-gray-500 italic">none</span>;
            return (
              <div className="flex flex-wrap gap-1">
                {types.map((t, i) => (
                  <span key={i} className="text-xs bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded">
                    {t}
                  </span>
                ))}
              </div>
            );
          },
        },
        {
          id: "schema_count",
          header: "Count",
          size: 70,
          accessorFn: (r) => r.structured_data_types?.length ?? 0,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 0 ? "text-green-400" : "text-red-400"}`}>{v}</span>;
          },
        },
        {
          id: "sd_valid",
          header: "Valid",
          size: 70,
          accessorFn: (r) => r.structured_data?.filter((s: StructuredDataItem) => s.is_valid).length ?? 0,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return v > 0 ? (
              <span className="text-xs bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded tabular-nums">{v}</span>
            ) : (
              <span className="text-gray-500 tabular-nums">0</span>
            );
          },
        },
        {
          id: "sd_invalid",
          header: "Invalid",
          size: 70,
          accessorFn: (r) => r.structured_data?.filter((s: StructuredDataItem) => !s.is_valid).length ?? 0,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return v > 0 ? (
              <span className="text-xs bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded tabular-nums">{v}</span>
            ) : null;
          },
        },
        {
          id: "sd_errors",
          header: "Errors",
          size: 250,
          accessorFn: (r) => {
            const invalid = r.structured_data?.find((s: StructuredDataItem) => !s.is_valid);
            return invalid?.errors?.[0] ?? "";
          },
          cell: ({ getValue }) => {
            const v = getValue<string>();
            if (!v) return null;
            return (
              <span className="text-xs text-red-400 truncate block max-w-[240px]" title={v}>
                {v}
              </span>
            );
          },
        },
        {
          accessorKey: "og_title",
          header: "OG Title",
          size: 200,
          cell: ({ getValue }) => <MissingCell value={getValue<string>()} />,
        },
        statusCol,
        indexableCol,
      ];

    case "sitemaps":
      return [
        urlCol,
        {
          accessorKey: "in_sitemap",
          header: "In Sitemap",
          size: 100,
          cell: ({ getValue }) => {
            const v = getValue<boolean>();
            return v ? (
              <span className="text-green-400 bg-green-500/10 text-xs px-1.5 py-0.5 rounded">Yes</span>
            ) : (
              <span className="text-gray-400 bg-gray-500/10 text-xs px-1.5 py-0.5 rounded">No</span>
            );
          },
        },
        statusCol,
        indexableCol,
        {
          accessorKey: "robots_blocked",
          header: "Robots Blocked",
          size: 120,
          cell: ({ getValue }) => {
            const v = getValue<boolean>();
            return v ? (
              <span className="text-red-400 bg-red-500/10 text-xs px-1.5 py-0.5 rounded">Blocked</span>
            ) : (
              <span className="text-green-400 bg-green-500/10 text-xs px-1.5 py-0.5 rounded">Allowed</span>
            );
          },
        },
      ];

    case "custom_search":
      return [
        urlCol,
        ...getCustomFieldColumns("custom_search_results"),
        statusCol,
        indexableCol,
      ];

    case "custom_extraction":
      return [
        urlCol,
        ...getCustomFieldColumns("custom_extraction_results"),
        statusCol,
        indexableCol,
      ];

    case "performance":
      return [
        urlCol,
        {
          accessorKey: "css_count",
          header: "CSS Files",
          size: 85,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 5 ? "text-yellow-400" : "text-gray-300"}`}>{v}</span>;
          },
        },
        {
          accessorKey: "js_count",
          header: "JS Files",
          size: 85,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 10 ? "text-red-400" : v > 5 ? "text-yellow-400" : "text-gray-300"}`}>{v}</span>;
          },
        },
        {
          accessorKey: "inline_css_count",
          header: "Inline CSS",
          size: 90,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 10 ? "text-yellow-400" : "text-gray-300"}`}>{v}</span>;
          },
        },
        {
          accessorKey: "inline_js_count",
          header: "Inline JS",
          size: 85,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 15 ? "text-yellow-400" : "text-gray-300"}`}>{v}</span>;
          },
        },
        {
          accessorKey: "dom_depth",
          header: "DOM Depth",
          size: 95,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            return <span className={`tabular-nums ${v > 32 ? "text-red-400" : v > 20 ? "text-yellow-400" : "text-green-400"}`}>{v}</span>;
          },
        },
        {
          accessorKey: "text_ratio",
          header: "Text Ratio",
          size: 95,
          cell: ({ getValue }) => {
            const v = getValue<number>();
            let color = "text-green-400";
            if (v < 10) color = "text-red-400";
            else if (v < 25) color = "text-yellow-400";
            return <span className={`tabular-nums ${color}`}>{v.toFixed(1)}%</span>;
          },
        },
        {
          accessorKey: "has_viewport_meta",
          header: "Viewport",
          size: 80,
          cell: ({ getValue }) => <BoolCell value={getValue<boolean>()} />,
        },
        {
          accessorKey: "has_charset",
          header: "Charset",
          size: 75,
          cell: ({ getValue }) => <BoolCell value={getValue<boolean>()} />,
        },
        {
          accessorKey: "has_doctype",
          header: "Doctype",
          size: 75,
          cell: ({ getValue }) => <BoolCell value={getValue<boolean>()} />,
        },
        responseTimeCol,
        statusCol,
      ];

    // Integration tabs show placeholder columns — actual data is merged at render time
    case "pagespeed":
      return [
        urlCol,
        { id: "psi_performance", header: "Performance", size: 100, accessorFn: () => 0 },
        { id: "psi_accessibility", header: "Accessibility", size: 100, accessorFn: () => 0 },
        { id: "psi_best_practices", header: "Best Practices", size: 100, accessorFn: () => 0 },
        { id: "psi_seo", header: "SEO", size: 70, accessorFn: () => 0 },
        { id: "psi_lcp", header: "LCP (ms)", size: 90, accessorFn: () => 0 },
        { id: "psi_fcp", header: "FCP (ms)", size: 90, accessorFn: () => 0 },
        { id: "psi_tbt", header: "TBT (ms)", size: 90, accessorFn: () => 0 },
        { id: "psi_cls", header: "CLS", size: 70, accessorFn: () => 0 },
        statusCol,
      ];

    case "search_console":
      return [
        urlCol,
        { id: "gsc_clicks", header: "Clicks", size: 80, accessorFn: () => 0 },
        { id: "gsc_impressions", header: "Impressions", size: 100, accessorFn: () => 0 },
        { id: "gsc_ctr", header: "CTR %", size: 80, accessorFn: () => 0 },
        { id: "gsc_position", header: "Position", size: 80, accessorFn: () => 0 },
        statusCol,
        indexableCol,
      ];

    case "analytics":
      return [
        urlCol,
        { id: "ga_sessions", header: "Sessions", size: 90, accessorFn: () => 0 },
        { id: "ga_users", header: "Users", size: 80, accessorFn: () => 0 },
        { id: "ga_pageviews", header: "Pageviews", size: 90, accessorFn: () => 0 },
        { id: "ga_bounce", header: "Bounce %", size: 80, accessorFn: () => 0 },
        { id: "ga_engagement", header: "Avg Time (s)", size: 100, accessorFn: () => 0 },
        statusCol,
      ];

    default:
      return [urlCol, statusCol];
  }
}

function getCustomFieldColumns(
  field: "custom_search_results" | "custom_extraction_results"
): ColumnDef<CrawlResult>[] {
  // We don't know the rule names at compile time, so we generate columns dynamically
  // This is a simple approach: show value and count for each rule in a single column
  return [
    {
      id: `${field}_summary`,
      header: field === "custom_search_results" ? "Search Results" : "Extraction Results",
      size: 500,
      cell: ({ row }) => {
        const results = row.original[field];
        if (!results || results.length === 0) {
          return <span className="text-gray-500">--</span>;
        }
        return (
          <div className="flex flex-wrap gap-2">
            {results.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <span className="text-xs font-medium text-accent">{r.name}:</span>
                {r.count > 0 ? (
                  <>
                    <span className="text-xs text-green-400 truncate max-w-[200px]" title={r.value}>
                      {r.value || `${r.count} match${r.count > 1 ? "es" : ""}`}
                    </span>
                    <span className="text-xs text-gray-500">({r.count})</span>
                  </>
                ) : (
                  <span className="text-xs text-red-400">not found</span>
                )}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: `${field}_total_matches`,
      header: "Total Matches",
      size: 110,
      accessorFn: (r) => {
        const results = r[field];
        if (!results) return 0;
        return results.reduce((sum, item) => sum + item.count, 0);
      },
      cell: ({ getValue }) => {
        const v = getValue<number>();
        return (
          <span className={`tabular-nums ${v > 0 ? "text-green-400" : "text-gray-500"}`}>
            {v}
          </span>
        );
      },
    },
  ];
}

// ── Main component ──

interface ResultsTableProps {
  data: CrawlResult[];
  onRowClick?: (row: CrawlResult) => void;
  pageSpeedResults?: PageSpeedResult[];
  gscResults?: GscPageData[];
  gaResults?: GaPageData[];
}

export function ResultsTable({ data, onRowClick, pageSpeedResults, gscResults, gaResults }: ResultsTableProps) {
  const [activeTab, setActiveTab] = useState<TabId>("internal");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [activeFilterIdx, setActiveFilterIdx] = useState(0);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  // Convert vertical wheel scroll to horizontal scroll for tab bar and table
  const handleHorizontalWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollWidth > el.clientWidth) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  }, []);

  const tabDef = TABS.find((t) => t.id === activeTab)!;

  // Compute inlinks map from all crawl results
  const inlinksMap = useMemo(() => buildInlinksMap(data), [data]);

  // Compute content hash frequency map for duplicate detection
  const contentHashFreq = useMemo(() => {
    const freq = new Map<string, number>();
    data.forEach((r) => {
      if (r.content_hash) {
        freq.set(r.content_hash, (freq.get(r.content_hash) || 0) + 1);
      }
    });
    return freq;
  }, [data]);

  const filteredData = useMemo(() => {
    let result = data;
    // Apply tab-level filter first
    if (tabDef.filter) {
      result = result.filter(tabDef.filter);
    }
    // Apply filter option dropdown
    if (tabDef.filterOptions && activeFilterIdx > 0 && activeFilterIdx < tabDef.filterOptions.length) {
      // Special handling for "Duplicate Content" filter on content tab
      if (activeTab === "content" && tabDef.filterOptions[activeFilterIdx].label === "Duplicate Content") {
        result = result.filter((r) => !!r.content_hash && (contentHashFreq.get(r.content_hash) || 0) > 1);
      } else if (activeTab === "inlinks") {
        const filterLabel = tabDef.filterOptions[activeFilterIdx].label;
        if (filterLabel === "Follow Only") {
          result = result.filter((r) => {
            const links = inlinksMap.get(r.url) || [];
            return links.some((l) => !l.rel.toLowerCase().includes("nofollow"));
          });
        } else if (filterLabel === "Nofollow Only") {
          result = result.filter((r) => {
            const links = inlinksMap.get(r.url) || [];
            return links.some((l) => l.rel.toLowerCase().includes("nofollow"));
          });
        } else if (filterLabel === "No Inlinks") {
          result = result.filter((r) => getInlinksCount(inlinksMap, r.url) === 0);
        }
      } else {
        result = result.filter(tabDef.filterOptions[activeFilterIdx].filter);
      }
    }
    return result;
  }, [data, tabDef, activeFilterIdx, activeTab, contentHashFreq, inlinksMap]);

  // Build lookup maps for integration data (normalized URL keys)
  const psiMap = useMemo(() => {
    const map = new Map<string, PageSpeedResult>();
    pageSpeedResults?.forEach((r) => map.set(normalizeUrl(r.url), r));
    return map;
  }, [pageSpeedResults]);

  const gscMap = useMemo(() => {
    const map = new Map<string, GscPageData>();
    gscResults?.forEach((r) => map.set(normalizeUrl(r.url), r));
    return map;
  }, [gscResults]);

  const gaMap = useMemo(() => {
    const map = new Map<string, GaPageData>();
    gaResults?.forEach((r) => map.set(normalizeUrl(r.url), r));
    return map;
  }, [gaResults]);

  // Filter tabs: hide integration tabs when no data
  const visibleTabs = useMemo(() => {
    return TABS.filter((tab) => {
      if (tab.id === "pagespeed") return (pageSpeedResults?.length ?? 0) > 0;
      if (tab.id === "search_console") return (gscResults?.length ?? 0) > 0;
      if (tab.id === "analytics") return (gaResults?.length ?? 0) > 0;
      return true;
    });
  }, [pageSpeedResults, gscResults, gaResults]);

  const columns = useMemo(() => getColumnsForTab(activeTab, inlinksMap), [activeTab, inlinksMap]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Tab bar */}
      <div
        ref={tabBarRef}
        onWheel={handleHorizontalWheel}
        className="flex items-center bg-surface-1 border-b border-surface-3 overflow-x-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#374151 transparent" }}
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSorting([]); setActiveFilterIdx(0); }}
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

      {/* Filter bar */}
      <div className="px-4 py-2 border-b border-surface-3 bg-surface-1 flex items-center gap-3">
        {tabDef.filterOptions && (
          <select
            value={activeFilterIdx}
            onChange={(e) => setActiveFilterIdx(Number(e.target.value))}
            className="bg-surface-0 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-accent"
          >
            {tabDef.filterOptions.map((opt, i) => (
              <option key={i} value={i}>{opt.label}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Filter results..."
          className="bg-surface-0 border border-surface-3 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent w-64"
        />
        <span className="text-xs text-gray-500">
          {table.getFilteredRowModel().rows.length} of {filteredData.length} URLs
        </span>
      </div>

      {/* Table — supports horizontal wheel/trackpad scroll */}
      <div ref={tableWrapRef} className="flex-1 overflow-auto">
        <table className="min-w-max text-sm">
          <thead className="sticky top-0 bg-surface-2 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-left text-xs text-gray-400 font-medium px-3 py-2 border-b border-surface-3 cursor-pointer select-none hover:text-gray-200 whitespace-nowrap"
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {{
                        asc: " ↑",
                        desc: " ↓",
                      }[header.column.getIsSorted() as string] ?? ""}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const url = normalizeUrl(row.original.url);
              const psi = psiMap.get(url);
              const gsc = gscMap.get(url);
              const ga = gaMap.get(url);

              return (
                <tr
                  key={row.id}
                  className="hover:bg-surface-2 cursor-pointer border-b border-surface-3/50 transition-colors"
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const colId = cell.column.id;
                    // Render integration data cells
                    let integrationContent: React.ReactNode | null = null;
                    if (colId === "psi_performance") integrationContent = <ScoreBadge score={psi?.performance_score ?? 0} analyzed={psi?.analyzed} />;
                    else if (colId === "psi_accessibility") integrationContent = <ScoreBadge score={psi?.accessibility_score ?? 0} analyzed={psi?.analyzed} />;
                    else if (colId === "psi_best_practices") integrationContent = <ScoreBadge score={psi?.best_practices_score ?? 0} analyzed={psi?.analyzed} />;
                    else if (colId === "psi_seo") integrationContent = <ScoreBadge score={psi?.seo_score ?? 0} analyzed={psi?.analyzed} />;
                    else if (colId === "psi_lcp") integrationContent = <span className="tabular-nums text-gray-300">{psi ? Math.round(psi.lcp_ms) : "—"}</span>;
                    else if (colId === "psi_fcp") integrationContent = <span className="tabular-nums text-gray-300">{psi ? Math.round(psi.fcp_ms) : "—"}</span>;
                    else if (colId === "psi_tbt") integrationContent = <span className="tabular-nums text-gray-300">{psi ? Math.round(psi.tbt_ms) : "—"}</span>;
                    else if (colId === "psi_cls") integrationContent = <span className="tabular-nums text-gray-300">{psi ? psi.cls.toFixed(3) : "—"}</span>;
                    else if (colId === "gsc_clicks") integrationContent = <span className="tabular-nums text-gray-300">{gsc ? gsc.clicks : "—"}</span>;
                    else if (colId === "gsc_impressions") integrationContent = <span className="tabular-nums text-gray-300">{gsc ? gsc.impressions : "—"}</span>;
                    else if (colId === "gsc_ctr") integrationContent = <span className="tabular-nums text-gray-300">{gsc ? `${gsc.ctr}%` : "—"}</span>;
                    else if (colId === "gsc_position") integrationContent = <span className="tabular-nums text-gray-300">{gsc ? gsc.position.toFixed(1) : "—"}</span>;
                    else if (colId === "ga_sessions") integrationContent = <span className="tabular-nums text-gray-300">{ga ? ga.sessions : "—"}</span>;
                    else if (colId === "ga_users") integrationContent = <span className="tabular-nums text-gray-300">{ga ? ga.users : "—"}</span>;
                    else if (colId === "ga_pageviews") integrationContent = <span className="tabular-nums text-gray-300">{ga ? ga.page_views : "—"}</span>;
                    else if (colId === "ga_bounce") integrationContent = <span className="tabular-nums text-gray-300">{ga ? `${ga.bounce_rate}%` : "—"}</span>;
                    else if (colId === "ga_engagement") integrationContent = <span className="tabular-nums text-gray-300">{ga ? ga.avg_engagement_time.toFixed(1) : "—"}</span>;

                    return (
                      <td key={cell.id} className="px-3 py-1.5 text-gray-300">
                        {integrationContent ?? flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {data.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-3">
            <svg className="w-12 h-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-sm">Enter a URL above and click <strong>Start Crawl</strong> to begin</p>
          </div>
        )}

        {data.length > 0 && filteredData.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-3">
            <svg className="w-12 h-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <p className="text-sm">No results match the current filter</p>
          </div>
        )}
      </div>
    </div>
  );
}
