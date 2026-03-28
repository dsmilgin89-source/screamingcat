import { useState, useRef, useCallback, useMemo } from "react";
import type { CrawlResult, RedirectHop, LinkInfo, ImageInfo, StructuredDataItem } from "@/types/crawl";
import type { PageSpeedResult, GscPageData, GaPageData } from "@/types/integrations";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

interface DetailPanelProps {
  result: CrawlResult | null;
  onClose: () => void;
  pageSpeedData?: PageSpeedResult;
  gscData?: GscPageData;
  gaData?: GaPageData;
  inlinks?: LinkInfo[];
  allResults?: CrawlResult[];
}

// Matches Screaming Frog's bottom panel tabs exactly, plus our extras
const TABS = [
  { id: "details", label: "URL Details" },
  { id: "inlinks", label: "Inlinks" },
  { id: "outlinks", label: "Outlinks" },
  { id: "images", label: "Image Details" },
  { id: "resources", label: "Resources" },
  { id: "serp", label: "SERP Snippet" },
  { id: "rendered", label: "Rendered Page" },
  { id: "view_source", label: "View Source" },
  { id: "headers", label: "HTTP Headers" },
  { id: "cookies", label: "Cookies" },
  { id: "duplicate", label: "Duplicate Details" },
  { id: "structured_data", label: "Structured Data Details" },
  { id: "hreflang", label: "Hreflang" },
  { id: "directives", label: "Directives" },
  { id: "security", label: "Security" },
  { id: "performance", label: "Performance" },
  { id: "redirect", label: "Redirect Chain" },
  { id: "og_twitter", label: "Social Tags" },
  { id: "pagespeed", label: "PageSpeed" },
  { id: "gsc", label: "Search Console" },
  { id: "ga", label: "Analytics" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DetailPanel({ result, onClose, pageSpeedData, gscData, gaData, inlinks, allResults }: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("details");
  const [panelHeight, setPanelHeight] = useState(280);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

  // Find duplicates by content_hash
  const duplicates = useMemo(() => {
    if (!result || !allResults || !result.content_hash) return [];
    return allResults.filter(
      (r) => r.url !== result.url && r.content_hash && r.content_hash === result.content_hash
    );
  }, [result, allResults]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startH: panelHeight };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startY - ev.clientY;
      const next = Math.max(120, Math.min(600, resizeRef.current.startH + delta));
      setPanelHeight(next);
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [panelHeight]);

  const handleTabWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  }, []);

  const handleExportTab = useCallback(async () => {
    if (!result) return;
    const rows: string[][] = [];
    const tab = activeTab;
    if (tab === "inlinks" && inlinks) {
      rows.push(["From", "Anchor Text", "Type", "Rel"]);
      inlinks.forEach((l) => rows.push([l.source_url, l.anchor_text, l.link_type || "href", l.rel || "follow"]));
    } else if (tab === "outlinks" && result.outlinks) {
      rows.push(["Type", "To", "Anchor Text", "Link Type", "Rel"]);
      result.outlinks.forEach((l) => rows.push([l.is_internal ? "INT" : "EXT", l.target_url, l.anchor_text, l.link_type || "href", l.rel || "follow"]));
    } else if (tab === "images" && result.images) {
      rows.push(["Source", "Alt Text", "Has Alt"]);
      result.images.forEach((img) => rows.push([img.src, img.alt, img.has_alt ? "Yes" : "No"]));
    } else if (tab === "headers" && result.response_headers) {
      rows.push(["Header", "Value"]);
      result.response_headers.forEach(([n, v]) => rows.push([n, v]));
    } else if (tab === "hreflang" && result.hreflang) {
      rows.push(["Language", "URL"]);
      result.hreflang.forEach((h) => rows.push([h.lang, h.url]));
    } else if (tab === "redirect" && result.redirect_chain) {
      rows.push(["URL", "Status Code"]);
      result.redirect_chain.forEach((hop) => rows.push([hop.url, String(hop.status_code)]));
    } else if (tab === "structured_data" && result.structured_data) {
      rows.push(["Type", "Valid", "Errors", "Warnings"]);
      result.structured_data.forEach((sd) => rows.push([sd.schema_type, sd.is_valid ? "Yes" : "No", sd.errors.join("; "), sd.warnings.join("; ")]));
    } else if (tab === "details") {
      rows.push(["Field", "Value"]);
      rows.push(["URL", result.url], ["Status", String(result.status_code)], ["Title", result.title], ["Description", result.meta_description], ["H1", result.h1], ["Word Count", String(result.word_count)], ["Canonical", result.canonical], ["Indexable", result.indexable ? "Yes" : "No"]);
    } else {
      return; // no exportable data for this tab
    }
    const csvContent = rows.map((row) => row.map((v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");
    const path = await save({ title: "Export Tab Data", defaultPath: `${tab}-export.csv`, filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (!path) return;
    try { await invoke("write_file", { path, contents: csvContent }); } catch { /* ignore */ }
  }, [result, activeTab, inlinks]);

  if (!result) return null;

  return (
    <div className="bg-surface-1 border-t border-surface-3 flex flex-col shrink-0" style={{ height: panelHeight }}>
      {/* Resize handle */}
      <div
        className="h-1 cursor-ns-resize hover:bg-accent/40 transition-colors shrink-0"
        onMouseDown={handleMouseDown}
      />

      {/* Tab bar — all tabs always visible, like Screaming Frog */}
      <div className="flex items-center border-b border-surface-3 shrink-0">
        <div
          className="flex-1 flex overflow-x-auto"
          onWheel={handleTabWheel}
          style={{ scrollbarWidth: "none" }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 shrink-0 ${
                activeTab === tab.id
                  ? "border-accent text-accent bg-accent/5"
                  : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-surface-2"
              }`}
            >
              {tab.label}
              {tab.id === "inlinks" && inlinks && inlinks.length > 0 ? ` (${inlinks.length})` : ""}
              {tab.id === "outlinks" && result.outlinks && result.outlinks.length > 0 ? ` (${result.outlinks.length})` : ""}
              {tab.id === "images" && result.images_count > 0 ? ` (${result.images_count})` : ""}
              {tab.id === "duplicate" && duplicates.length > 0 ? ` (${duplicates.length})` : ""}
            </button>
          ))}
        </div>

        <button
          onClick={handleExportTab}
          className="px-2 py-1.5 text-gray-500 hover:text-accent transition-colors shrink-0"
          title="Export tab data as CSV"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1.5 text-gray-500 hover:text-gray-200 transition-colors shrink-0"
          title="Close (Esc)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-0">
        {activeTab === "details" && <DetailsTab result={result} />}
        {activeTab === "inlinks" && <InlinksTab inlinks={inlinks ?? []} />}
        {activeTab === "outlinks" && <OutlinksTab outlinks={result.outlinks ?? []} />}
        {activeTab === "images" && <ImagesTab result={result} />}
        {activeTab === "resources" && <ResourcesTab result={result} />}
        {activeTab === "serp" && <SerpTab result={result} />}
        {activeTab === "rendered" && <RenderedPageTab result={result} />}
        {activeTab === "view_source" && <ViewSourceTab result={result} />}
        {activeTab === "headers" && <HeadersTab result={result} />}
        {activeTab === "cookies" && <CookiesTab result={result} />}
        {activeTab === "duplicate" && <DuplicateTab result={result} duplicates={duplicates} />}
        {activeTab === "structured_data" && <StructuredDataTab result={result} />}
        {activeTab === "hreflang" && <HreflangTab result={result} />}
        {activeTab === "directives" && <DirectivesTab result={result} />}
        {activeTab === "security" && <SecurityTab result={result} />}
        {activeTab === "performance" && <PerformanceTab result={result} />}
        {activeTab === "redirect" && <RedirectTab result={result} />}
        {activeTab === "og_twitter" && <SocialTab result={result} />}
        {activeTab === "pagespeed" && <PageSpeedTab data={pageSpeedData} />}
        {activeTab === "gsc" && <GscTab data={gscData} />}
        {activeTab === "ga" && <GaTab data={gaData} />}
      </div>
    </div>
  );
}

// ─── Key-Value Table helper ────────────────────────────────────────

function KVTable({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map(([name, value], i) => (
          <tr key={i} className={i % 2 === 0 ? "bg-surface-0/50" : ""}>
            <td className="px-3 py-1 text-gray-500 whitespace-nowrap font-medium w-44 align-top">{name}</td>
            <td className="px-3 py-1 text-gray-200 break-all">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Tab content components ────────────────────────────────────────

function DetailsTab({ result }: { result: CrawlResult }) {
  const rows: [string, React.ReactNode][] = [
    ["URL", <a key="u" href={result.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{result.url}</a>],
    ["Status Code", <StatusBadge key="s" code={result.status_code} />],
    ["Content Type", result.content_type],
    ["Response Time", `${result.response_time_ms} ms`],
    ["Content Length", formatBytes(result.content_length)],
    ["Depth", String(result.depth)],
    ["Title", result.title || <Missing />],
    ["Title Length", `${result.title.length} chars`],
    ["Meta Description", result.meta_description || <Missing />],
    ["Meta Desc Length", `${result.meta_description.length} chars`],
    ["H1", result.h1 || <Missing />],
    ["H2 Count", String(result.h2_count)],
    ["Word Count", String(result.word_count)],
    ["Canonical", result.canonical || "none"],
    ["Indexable", result.indexable ? <span className="text-green-400">Yes</span> : <span className="text-red-400">No</span>],
    ["Robots Meta", result.robots_meta || "none"],
    ["Internal Links", String(result.internal_links)],
    ["External Links", String(result.external_links)],
    ["Images", String(result.images_count)],
    ["Images Missing Alt", String(result.images_missing_alt)],
  ];
  if (result.redirect_url) rows.push(["Redirect URL", result.redirect_url]);
  if (result.meta_refresh) rows.push(["Meta Refresh", result.meta_refresh]);
  if (result.rel_next) rows.push(["Rel Next", result.rel_next]);
  if (result.rel_prev) rows.push(["Rel Prev", result.rel_prev]);
  if (result.meta_keywords) rows.push(["Meta Keywords", result.meta_keywords]);
  if (result.lang_attribute) rows.push(["Language", result.lang_attribute]);
  if (result.content_hash) rows.push(["Content Hash", result.content_hash]);

  return <KVTable rows={rows} />;
}

function InlinksTab({ inlinks }: { inlinks: LinkInfo[] }) {
  if (inlinks.length === 0) return <EmptyState text="No inlinks found for this URL" />;
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-2 sticky top-0">
        <tr>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium">From</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium">Anchor Text</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-16">Type</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-20">Rel</th>
        </tr>
      </thead>
      <tbody>
        {inlinks.map((link, i) => (
          <tr key={i} className={`${i % 2 === 0 ? "bg-surface-0/50" : ""} hover:bg-surface-2/50`}>
            <td className="px-3 py-1 text-accent break-all">{link.source_url}</td>
            <td className="px-3 py-1 text-gray-300">{link.anchor_text.trim() || <span className="text-gray-600 italic">empty</span>}</td>
            <td className="px-3 py-1 text-gray-500">{link.link_type || "href"}</td>
            <td className="px-3 py-1 text-gray-500">
              {link.rel.toLowerCase().includes("nofollow")
                ? <span className="text-yellow-400">nofollow</span>
                : link.rel || "follow"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OutlinksTab({ outlinks }: { outlinks: LinkInfo[] }) {
  if (outlinks.length === 0) return <EmptyState text="No outlinks found for this URL" />;
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-2 sticky top-0">
        <tr>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-14">Type</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium">To</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium">Anchor Text</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-16">Link Type</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-20">Rel</th>
        </tr>
      </thead>
      <tbody>
        {outlinks.map((link, i) => (
          <tr key={i} className={`${i % 2 === 0 ? "bg-surface-0/50" : ""} hover:bg-surface-2/50`}>
            <td className="px-3 py-1">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${link.is_internal ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"}`}>
                {link.is_internal ? "INT" : "EXT"}
              </span>
            </td>
            <td className="px-3 py-1 text-accent break-all">{link.target_url}</td>
            <td className="px-3 py-1 text-gray-300">{link.anchor_text.trim() || <span className="text-gray-600 italic">empty</span>}</td>
            <td className="px-3 py-1 text-gray-500">{link.link_type || "href"}</td>
            <td className="px-3 py-1 text-gray-500">{link.rel || "follow"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImagesTab({ result }: { result: CrawlResult }) {
  if (!result.images || result.images.length === 0) {
    return (
      <KVTable rows={[
        ["Total Images", String(result.images_count)],
        ["Missing Alt Text", String(result.images_missing_alt)],
        ["Images With Alt", String(result.images_count - result.images_missing_alt)],
      ]} />
    );
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-2 sticky top-0">
        <tr>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium">Source</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium">Alt Text</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-20">Has Alt</th>
        </tr>
      </thead>
      <tbody>
        {result.images.map((img: ImageInfo, i: number) => (
          <tr key={i} className={`${i % 2 === 0 ? "bg-surface-0/50" : ""} hover:bg-surface-2/50`}>
            <td className="px-3 py-1 text-accent break-all">{img.src}</td>
            <td className="px-3 py-1 text-gray-300">{img.alt || <span className="text-gray-600 italic">empty</span>}</td>
            <td className="px-3 py-1">
              {img.has_alt
                ? <span className="text-green-400">Yes</span>
                : <span className="text-red-400">No</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResourcesTab({ result }: { result: CrawlResult }) {
  // Build resource list from outlinks (CSS, JS, images)
  const resources = (result.outlinks ?? []).filter(
    (l) => l.link_type === "css" || l.link_type === "js" || l.link_type === "img" || l.link_type === "script" || l.link_type === "stylesheet"
  );

  const rows: [string, React.ReactNode][] = [
    ["External CSS", String(result.css_count)],
    ["External JS", String(result.js_count)],
    ["Inline CSS", String(result.inline_css_count)],
    ["Inline JS", String(result.inline_js_count)],
    ["Total Images", String(result.images_count)],
    ["Total Resource Size", formatBytes(result.total_resource_size)],
  ];

  if (resources.length === 0) {
    return <KVTable rows={rows} />;
  }

  return (
    <div>
      <KVTable rows={rows} />
      <div className="border-t border-surface-3 mt-1">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 sticky top-0">
            <tr>
              <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-16">Type</th>
              <th className="px-3 py-1.5 text-left text-gray-400 font-medium">URL</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-surface-0/50" : ""}>
                <td className="px-3 py-1 text-gray-500 uppercase">{r.link_type}</td>
                <td className="px-3 py-1 text-accent break-all">{r.target_url}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ViewSourceTab({ result }: { result: CrawlResult }) {
  const html = result.raw_html;
  if (!html) {
    return (
      <EmptyState text='HTML source not stored. Enable "Store HTML source" in Advanced settings and re-crawl.' />
    );
  }
  return (
    <pre className="p-3 text-xs font-mono text-gray-300 whitespace-pre-wrap break-all select-all leading-relaxed">
      {html}
    </pre>
  );
}

function RenderedPageTab({ result }: { result: CrawlResult }) {
  const html = result.rendered_html || result.raw_html;
  if (!html) {
    return (
      <EmptyState text='No rendered HTML available. Enable JavaScript rendering and "Store rendered HTML separately" in Rendering settings.' />
    );
  }
  return (
    <iframe
      srcDoc={html}
      title="Rendered page preview"
      className="w-full h-full border-0 bg-white"
      sandbox="allow-same-origin"
    />
  );
}

function SerpTab({ result }: { result: CrawlResult }) {
  const titleLen = (result.title || result.url).length;
  const descLen = result.meta_description.length;
  return (
    <div className="p-4">
      <div className="bg-white rounded-lg p-4 max-w-[600px] space-y-0.5">
        <div className="text-[#1a0dab] text-lg font-medium truncate hover:underline cursor-pointer">
          {result.title || result.url}
        </div>
        <div className="text-[#006621] text-sm truncate">{result.url}</div>
        <div className="text-[#545454] text-sm leading-relaxed line-clamp-2">
          {result.meta_description || "No meta description available"}
        </div>
      </div>
      <div className="flex gap-6 mt-3 text-xs text-gray-500">
        <span className={titleLen > 60 ? "text-warning" : ""}>
          Title: {titleLen} chars / ~{Math.round(titleLen * 8)}px {titleLen > 60 ? "(too long)" : ""}
        </span>
        <span className={descLen > 160 ? "text-warning" : ""}>
          Description: {descLen} chars / ~{Math.round(descLen * 7)}px {descLen > 160 ? "(too long)" : ""}
        </span>
      </div>
    </div>
  );
}

function HeadersTab({ result }: { result: CrawlResult }) {
  if (!result.response_headers || result.response_headers.length === 0) {
    return <EmptyState text="No response headers captured" />;
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-2 sticky top-0">
        <tr>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-52">Header</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {result.response_headers.map(([name, value]: [string, string], i: number) => (
          <tr key={i} className={i % 2 === 0 ? "bg-surface-0/50" : ""}>
            <td className="px-3 py-1 text-gray-400 font-mono">{name}</td>
            <td className="px-3 py-1 text-gray-200 break-all">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CookiesTab({ result }: { result: CrawlResult }) {
  // Extract Set-Cookie headers
  const cookies = (result.response_headers ?? []).filter(
    ([name]: [string, string]) => name.toLowerCase() === "set-cookie"
  );
  if (cookies.length === 0) return <EmptyState text="No cookies set by this page" />;
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-2 sticky top-0">
        <tr>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-44">Name</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium">Value</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-20">Secure</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-20">HttpOnly</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-24">SameSite</th>
        </tr>
      </thead>
      <tbody>
        {cookies.map(([, value]: [string, string], i: number) => {
          const parts = value.split(";").map((p) => p.trim());
          const [cookieName, ...cookieValueParts] = (parts[0] || "").split("=");
          const cookieValue = cookieValueParts.join("=");
          const isSecure = parts.some((p) => p.toLowerCase() === "secure");
          const isHttpOnly = parts.some((p) => p.toLowerCase() === "httponly");
          const sameSite = parts.find((p) => p.toLowerCase().startsWith("samesite"))?.split("=")?.[1] || "—";
          return (
            <tr key={i} className={i % 2 === 0 ? "bg-surface-0/50" : ""}>
              <td className="px-3 py-1 text-gray-300 font-mono">{cookieName}</td>
              <td className="px-3 py-1 text-gray-400 break-all truncate max-w-xs" title={cookieValue}>{cookieValue}</td>
              <td className="px-3 py-1">
                {isSecure ? <span className="text-green-400">Yes</span> : <span className="text-gray-600">No</span>}
              </td>
              <td className="px-3 py-1">
                {isHttpOnly ? <span className="text-green-400">Yes</span> : <span className="text-gray-600">No</span>}
              </td>
              <td className="px-3 py-1 text-gray-400">{sameSite}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DuplicateTab({ result, duplicates }: { result: CrawlResult; duplicates: CrawlResult[] }) {
  if (!result.content_hash) {
    return <EmptyState text="Content hash not available — duplicate detection requires HTML content" />;
  }
  if (duplicates.length === 0) {
    return (
      <div className="p-3">
        <KVTable rows={[
          ["Content Hash", result.content_hash],
          ["Duplicate Pages", "0 — this page is unique"],
        ]} />
      </div>
    );
  }
  return (
    <div>
      <div className="px-3 py-2 text-xs text-gray-500 border-b border-surface-3">
        Content Hash: <span className="text-gray-300 font-mono">{result.content_hash}</span>
        <span className="ml-3 text-yellow-400">{duplicates.length} duplicate{duplicates.length > 1 ? "s" : ""} found</span>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-surface-2 sticky top-0">
          <tr>
            <th className="px-3 py-1.5 text-left text-gray-400 font-medium">Duplicate URL</th>
            <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-20">Status</th>
            <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-28">Title</th>
          </tr>
        </thead>
        <tbody>
          {duplicates.map((dup, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-surface-0/50" : ""}>
              <td className="px-3 py-1 text-accent break-all">{dup.url}</td>
              <td className="px-3 py-1"><StatusBadge code={dup.status_code} /></td>
              <td className="px-3 py-1 text-gray-400 truncate" title={dup.title}>{dup.title || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DirectivesTab({ result }: { result: CrawlResult }) {
  const rows: [string, React.ReactNode][] = [
    ["Canonical URL", result.canonical || "none"],
    ["Robots Meta", result.robots_meta || "none"],
    ["Indexable", result.indexable ? <span className="text-green-400">Yes</span> : <span className="text-red-400">No</span>],
    ["Robots.txt Blocked", result.robots_blocked ? <span className="text-red-400">Yes</span> : <span className="text-green-400">No</span>],
    ["In Sitemap", result.in_sitemap ? <span className="text-green-400">Yes</span> : <span className="text-gray-500">No</span>],
  ];
  if (result.meta_refresh) rows.push(["Meta Refresh", result.meta_refresh]);
  if (result.rel_next) rows.push(["Rel Next", result.rel_next]);
  if (result.rel_prev) rows.push(["Rel Prev", result.rel_prev]);
  return <KVTable rows={rows} />;
}

function StructuredDataTab({ result }: { result: CrawlResult }) {
  const types = result.structured_data_types ?? [];
  const items = result.structured_data ?? [];

  if (types.length === 0 && items.length === 0) {
    return <EmptyState text="No structured data found on this page" />;
  }

  return (
    <div>
      {/* Type badges */}
      <div className="px-3 py-2 flex flex-wrap gap-1.5 border-b border-surface-3">
        {types.map((t, i) => (
          <span key={i} className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded font-medium">
            {t}
          </span>
        ))}
      </div>
      {/* Validation details */}
      {items.length > 0 && (
        <table className="w-full text-xs">
          <thead className="bg-surface-2 sticky top-0">
            <tr>
              <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-44">Schema Type</th>
              <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-20">Valid</th>
              <th className="px-3 py-1.5 text-left text-gray-400 font-medium">Errors</th>
              <th className="px-3 py-1.5 text-left text-gray-400 font-medium">Warnings</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: StructuredDataItem, i: number) => (
              <tr key={i} className={i % 2 === 0 ? "bg-surface-0/50" : ""}>
                <td className="px-3 py-1 text-gray-300 font-medium">{item.schema_type}</td>
                <td className="px-3 py-1">
                  {item.is_valid
                    ? <span className="text-green-400">Yes</span>
                    : <span className="text-red-400">No</span>}
                </td>
                <td className="px-3 py-1 text-red-400">
                  {item.errors.length > 0 ? item.errors.join(", ") : "—"}
                </td>
                <td className="px-3 py-1 text-yellow-400">
                  {item.warnings.length > 0 ? item.warnings.join(", ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HreflangTab({ result }: { result: CrawlResult }) {
  if (!result.hreflang || result.hreflang.length === 0) {
    return <EmptyState text="No hreflang tags found on this page" />;
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-2 sticky top-0">
        <tr>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-28">Language</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium">URL</th>
        </tr>
      </thead>
      <tbody>
        {result.hreflang.map((h, i) => (
          <tr key={i} className={i % 2 === 0 ? "bg-surface-0/50" : ""}>
            <td className="px-3 py-1 text-accent font-mono">{h.lang}</td>
            <td className="px-3 py-1 text-gray-300 break-all">{h.url}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PerformanceTab({ result }: { result: CrawlResult }) {
  return (
    <KVTable rows={[
      ["Response Time", `${result.response_time_ms} ms`],
      ["Content Size", formatBytes(result.content_length)],
      ["Total Resource Size", formatBytes(result.total_resource_size)],
      ["External CSS", String(result.css_count)],
      ["External JS", String(result.js_count)],
      ["Inline CSS", String(result.inline_css_count)],
      ["Inline JS", String(result.inline_js_count)],
      ["DOM Depth", String(result.dom_depth)],
      ["Text Ratio", `${result.text_ratio?.toFixed(1) ?? 0}%`],
      ["Viewport Meta", result.has_viewport_meta ? "Yes" : "No"],
      ["Charset", result.has_charset ? "Yes" : "No"],
      ["DOCTYPE", result.has_doctype ? "Yes" : "No"],
    ]} />
  );
}

function SecurityTab({ result }: { result: CrawlResult }) {
  const rows: [string, React.ReactNode][] = [
    ["HSTS", result.has_hsts ? <span className="text-green-400">Yes</span> : <span className="text-red-400">No</span>],
    ["CSP", result.has_csp ? <span className="text-green-400">Yes</span> : <span className="text-red-400">No</span>],
    ["X-Frame-Options", result.has_x_frame_options ? <span className="text-green-400">Yes</span> : <span className="text-red-400">No</span>],
    ["X-Content-Type-Options", result.has_x_content_type_options ? <span className="text-green-400">Yes</span> : <span className="text-red-400">No</span>],
  ];
  if ((result.mixed_content_count ?? 0) > 0) rows.push(["Mixed Content", <span key="mc" className="text-red-400">{String(result.mixed_content_count)}</span>]);
  if ((result.insecure_form_count ?? 0) > 0) rows.push(["Insecure Forms", <span key="if" className="text-red-400">{String(result.insecure_form_count)}</span>]);
  return <KVTable rows={rows} />;
}

function RedirectTab({ result }: { result: CrawlResult }) {
  if (!result.redirect_chain || result.redirect_chain.length === 0) return <EmptyState text="No redirect chain" />;
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-2 sticky top-0">
        <tr>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-8">#</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium">URL</th>
          <th className="px-3 py-1.5 text-left text-gray-400 font-medium w-20">Status</th>
        </tr>
      </thead>
      <tbody>
        {result.redirect_chain.map((hop: RedirectHop, i: number) => (
          <tr key={i} className={i % 2 === 0 ? "bg-surface-0/50" : ""}>
            <td className="px-3 py-1 text-gray-500">{i + 1}</td>
            <td className="px-3 py-1 text-gray-300 break-all">{hop.url}</td>
            <td className="px-3 py-1"><StatusBadge code={hop.status_code} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SocialTab({ result }: { result: CrawlResult }) {
  const rows: [string, React.ReactNode][] = [];
  if (result.og_title) rows.push(["OG Title", result.og_title]);
  if (result.og_description) rows.push(["OG Description", result.og_description]);
  if (result.og_image) rows.push(["OG Image", result.og_image]);
  if (result.twitter_card) rows.push(["Twitter Card", result.twitter_card]);
  if (result.twitter_title) rows.push(["Twitter Title", result.twitter_title]);
  if (rows.length === 0) return <EmptyState text="No Open Graph or Twitter Card tags found" />;
  return <KVTable rows={rows} />;
}

function PageSpeedTab({ data }: { data?: PageSpeedResult }) {
  if (!data) return <EmptyState text="No PageSpeed data available. Run PageSpeed Insights from the Integrations panel." />;
  if (data.error) return <div className="p-3 text-sm text-red-400">Analysis failed: {data.error}</div>;
  return (
    <div className="flex gap-6 p-3">
      <div className="flex gap-3">
        <ScoreBox label="Performance" score={data.performance_score} />
        <ScoreBox label="Accessibility" score={data.accessibility_score} />
        <ScoreBox label="Best Practices" score={data.best_practices_score} />
        <ScoreBox label="SEO" score={data.seo_score} />
      </div>
      <div className="flex-1">
        <KVTable rows={[
          ["LCP", `${Math.round(data.lcp_ms)} ms`],
          ["FCP", `${Math.round(data.fcp_ms)} ms`],
          ["TBT", `${Math.round(data.tbt_ms)} ms`],
          ["CLS", data.cls.toFixed(3)],
          ["Speed Index", `${Math.round(data.speed_index_ms)} ms`],
          ["TTI", `${Math.round(data.tti_ms)} ms`],
        ]} />
      </div>
    </div>
  );
}

function GscTab({ data }: { data?: GscPageData }) {
  if (!data) return <EmptyState text="No Search Console data available. Connect GSC from the Integrations panel." />;
  return (
    <KVTable rows={[
      ["Clicks", String(data.clicks)],
      ["Impressions", String(data.impressions)],
      ["CTR", `${data.ctr}%`],
      ["Avg Position", data.position.toFixed(1)],
    ]} />
  );
}

function GaTab({ data }: { data?: GaPageData }) {
  if (!data) return <EmptyState text="No Analytics data available. Connect GA4 from the Integrations panel." />;
  return (
    <KVTable rows={[
      ["Sessions", String(data.sessions)],
      ["Users", String(data.users)],
      ["Pageviews", String(data.page_views)],
      ["Bounce Rate", `${data.bounce_rate}%`],
      ["Avg Engagement", `${data.avg_engagement_time.toFixed(1)}s`],
      ["Conversions", String(data.conversions)],
    ]} />
  );
}

// ─── Shared helpers ────────────────────────────────────────────────

function StatusBadge({ code }: { code: number }) {
  let color = "text-gray-400 bg-gray-500/10";
  if (code >= 500) color = "text-red-400 bg-red-500/10";
  else if (code >= 400) color = "text-red-400 bg-red-500/10";
  else if (code >= 300) color = "text-yellow-400 bg-yellow-500/10";
  else if (code >= 200) color = "text-green-400 bg-green-500/10";
  return <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${color}`}>{code}</span>;
}

function Missing() {
  return <span className="text-red-400 italic">missing</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-4 text-sm text-gray-500 text-center">{text}</div>;
}

function ScoreBox({ label, score }: { label: string; score: number }) {
  let color = "text-green-400 border-green-500/30";
  if (score < 50) color = "text-red-400 border-red-500/30";
  else if (score < 90) color = "text-yellow-400 border-yellow-500/30";
  return (
    <div className={`border rounded-lg p-2 text-center min-w-[80px] ${color}`}>
      <div className="text-lg font-bold tabular-nums">{Math.round(score)}</div>
      <div className="text-[10px] text-gray-500">{label}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
