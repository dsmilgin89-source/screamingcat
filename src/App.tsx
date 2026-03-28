import { useState, useCallback, useEffect, useMemo } from "react";
import { MenuBar } from "@/components/MenuBar";
import { Toolbar } from "@/components/Toolbar";
import { StatsBar } from "@/components/StatsBar";
import { ResultsTable } from "@/components/ResultsTable";
import { DetailPanel } from "@/components/DetailPanel";
import { IssuesPanel } from "@/components/IssuesPanel";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { Visualizations } from "@/components/Visualizations";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { ToastContainer, showToast } from "@/components/Toast";
import { ListModeDialog } from "@/components/ListModeDialog";
import { CrawlHistoryPanel } from "@/components/CrawlHistoryPanel";
import { useCrawl } from "@/hooks/useCrawl";
import type { CrawlConfig, CrawlResult, StorageConfig } from "@/types/crawl";
import { defaultConfig, DEFAULT_STORAGE_CONFIG } from "@/types/crawl";
import { buildInlinksMap } from "@/lib/linkGraph";
import { generateXmlSitemap } from "@/lib/sitemapExporter";
import type {
  IntegrationConfig,
  PageSpeedResult,
  GscPageData,
  GaPageData,
} from "@/types/integrations";
import { defaultIntegrationConfig } from "@/types/integrations";
import { save, open, ask } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import * as XLSX from "xlsx";

const INTEGRATION_STORAGE_KEY = "screamingcat_integrations";
const STORAGE_CONFIG_KEY = "screamingcat_storage_config";
const THEME_KEY = "screamingcat_theme";
const CONFIG_PROFILES_KEY = "screamingcat_config_profiles";

type Theme = "dark" | "light";

interface ConfigProfile {
  name: string;
  config: CrawlConfig;
  createdAt: string;
}

function loadIntegrationConfig(): IntegrationConfig {
  try {
    const stored = localStorage.getItem(INTEGRATION_STORAGE_KEY);
    if (stored) return { ...defaultIntegrationConfig, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return { ...defaultIntegrationConfig };
}

function loadStorageConfig(): StorageConfig {
  try {
    const stored = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (stored) return { ...DEFAULT_STORAGE_CONFIG, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return { ...DEFAULT_STORAGE_CONFIG };
}

function App() {
  const { results, stats, isRunning, startCrawl, stopCrawl, clearResults, setResults } =
    useCrawl();
  const [selectedResult, setSelectedResult] = useState<CrawlResult | null>(null);
  const [showIssues, setShowIssues] = useState(true);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showVisualizations, setShowVisualizations] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showListMode, setShowListMode] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [config, setConfig] = useState<CrawlConfig>(defaultConfig);
  const [url, setUrl] = useState("");
  const [issueFilter, setIssueFilter] = useState<string[] | null>(null);
  const [issueFilterLabel, setIssueFilterLabel] = useState("");

  // ── Integration state ──
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>(loadIntegrationConfig);
  const [pageSpeedResults, setPageSpeedResults] = useState<PageSpeedResult[]>([]);
  const [gscResults, setGscResults] = useState<GscPageData[]>([]);
  const [gaResults, setGaResults] = useState<GaPageData[]>([]);

  // ── Storage config state ──
  const [storageConfig, setStorageConfig] = useState<StorageConfig>(loadStorageConfig);

  // ── Theme state ──
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem(THEME_KEY) as Theme) || "dark";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // ── Config profiles ──
  const [configProfiles, setConfigProfiles] = useState<ConfigProfile[]>(() => {
    try {
      const stored = localStorage.getItem(CONFIG_PROFILES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [showProfileManager, setShowProfileManager] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  useEffect(() => {
    localStorage.setItem(CONFIG_PROFILES_KEY, JSON.stringify(configProfiles));
  }, [configProfiles]);

  // Persist integration config to localStorage
  useEffect(() => {
    localStorage.setItem(INTEGRATION_STORAGE_KEY, JSON.stringify(integrationConfig));
  }, [integrationConfig]);

  // Persist storage config to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(storageConfig));
  }, [storageConfig]);

  // ── Auto-save snapshot after crawl completes ──
  const [prevRunning, setPrevRunning] = useState(false);
  useEffect(() => {
    if (prevRunning && !isRunning && results.length > 0 && storageConfig.auto_save) {
      const name = `Auto-save ${new Date().toLocaleString()}`;
      invoke("save_crawl_snapshot", { name, storageConfig }).catch(() => {});
    }
    setPrevRunning(isRunning);
  }, [isRunning]);

  const displayedResults = issueFilter
    ? results.filter((r) => issueFilter.includes(r.url))
    : results;

  const inlinksMap = useMemo(() => buildInlinksMap(results), [results]);

  const handleIssueUrlClick = (url: string) => {
    const match = results.find((r) => r.url === url);
    if (match) setSelectedResult(match);
  };

  const handleIssueSelect = useCallback(
    (urls: string[], label: string) => {
      setIssueFilter(urls);
      setIssueFilterLabel(label);
      setSelectedResult(null);
    },
    []
  );

  const handleClearIssueFilter = useCallback(() => {
    setIssueFilter(null);
    setIssueFilterLabel("");
  }, []);

  const handleClear = useCallback(async () => {
    const confirmed = await ask("Are you sure you want to clear all results?", {
      title: "Clear Results",
      kind: "warning",
    });
    if (!confirmed) return;
    clearResults();
    setSelectedResult(null);
    setIssueFilter(null);
    setIssueFilterLabel("");
    setPageSpeedResults([]);
    setGscResults([]);
    setGaResults([]);
  }, [clearResults]);

  // ── Start crawl ──
  const handleStart = useCallback(() => {
    if (!url.trim()) return;
    let crawlUrl = url.trim();
    if (!crawlUrl.startsWith("http")) {
      crawlUrl = "https://" + crawlUrl;
    }
    startCrawl({ ...config, url: crawlUrl });
  }, [url, config, startCrawl]);

  // ── Save project (.sccat JSON) ──
  const handleSaveProject = useCallback(async () => {
    if (results.length === 0) return;
    const path = await save({
      title: "Save Project",
      defaultPath: "crawl-project.sccat",
      filters: [{ name: "ScreamingCAT Project", extensions: ["sccat"] }],
    });
    if (!path) return;
    const project = {
      version: 2,
      results,
      pageSpeedResults,
      gscResults,
      gaResults,
      exportedAt: new Date().toISOString(),
    };
    try {
      await invoke("write_file", { path, contents: JSON.stringify(project) });
      showToast("File saved successfully!", "success");
    } catch (e) {
      showToast("Failed to save file: " + e, "error");
    }
  }, [results, pageSpeedResults, gscResults, gaResults]);

  // ── Load project (.sccat JSON) ──
  const handleLoadProject = useCallback(async () => {
    const path = await open({
      title: "Open Project",
      filters: [{ name: "ScreamingCAT Project", extensions: ["sccat"] }],
      multiple: false,
    });
    if (!path) return;
    try {
      const contents: string = await invoke("read_file", { path: path as string });
      const project = JSON.parse(contents);
      if (project.results && Array.isArray(project.results)) {
        setResults(project.results);
        setSelectedResult(null);
        setIssueFilter(null);
        setIssueFilterLabel("");
        if (project.pageSpeedResults) setPageSpeedResults(project.pageSpeedResults);
        if (project.gscResults) setGscResults(project.gscResults);
        if (project.gaResults) setGaResults(project.gaResults);
      }
    } catch (e) {
      showToast("Failed to load project: " + e, "error");
    }
  }, [setResults]);

  // ── Export CSV ──
  const handleExportCsv = useCallback(async () => {
    const exportResults = issueFilter ? displayedResults : results;
    if (exportResults.length === 0) return;
    const path = await save({
      title: "Export CSV",
      defaultPath: "crawl-export.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    const headers = [
      "URL", "Status Code", "Content Type", "Response Time (ms)", "Content Length",
      "Title", "Meta Description", "H1", "H2 Count", "Canonical", "Robots Meta",
      "Word Count", "Internal Links", "External Links", "Depth", "Redirect URL", "Indexable",
    ];
    const rows = exportResults.map((r) => [
      r.url, r.status_code, r.content_type, r.response_time_ms, r.content_length,
      r.title, r.meta_description, r.h1, r.h2_count, r.canonical, r.robots_meta,
      r.word_count, r.internal_links, r.external_links, r.depth, r.redirect_url,
      r.indexable ? "Yes" : "No",
    ]);
    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((v) => {
          const s = String(v ?? "");
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        }).join(",")
      )
      .join("\n");
    try {
      await invoke("write_file", { path, contents: csvContent });
      showToast("File saved successfully!", "success");
    } catch (e) {
      showToast("Failed to save file: " + e, "error");
    }
  }, [results, issueFilter, displayedResults]);

  // ── Export XLSX ──
  const handleExportXlsx = useCallback(async () => {
    const exportResults = issueFilter ? displayedResults : results;
    if (exportResults.length === 0) return;
    const path = await save({
      title: "Export XLSX",
      defaultPath: "crawl-export.xlsx",
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!path) return;
    const wsData = [
      [
        "URL", "Status Code", "Content Type", "Response Time (ms)", "Content Length",
        "Title", "Meta Description", "H1", "H2 Count", "Canonical", "Robots Meta",
        "Word Count", "Internal Links", "External Links", "Depth", "Redirect URL", "Indexable",
      ],
      ...exportResults.map((r) => [
        r.url, r.status_code, r.content_type, r.response_time_ms, r.content_length,
        r.title, r.meta_description, r.h1, r.h2_count, r.canonical, r.robots_meta,
        r.word_count, r.internal_links, r.external_links, r.depth, r.redirect_url,
        r.indexable ? "Yes" : "No",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 60 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 14 },
      { wch: 50 }, { wch: 50 }, { wch: 40 }, { wch: 10 }, { wch: 60 }, { wch: 20 },
      { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 60 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Crawl Results");
    const xlsxData = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const bytes = new Uint8Array(xlsxData);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    try {
      await invoke("write_file_binary", { path, data: base64 });
      showToast("File saved successfully!", "success");
    } catch (e) {
      showToast("Failed to save file: " + e, "error");
    }
  }, [results, issueFilter, displayedResults]);

  // ── Export XML Sitemap ──
  const handleExportSitemap = useCallback(async () => {
    const exportResults = issueFilter ? displayedResults : results;
    if (exportResults.length === 0) return;
    const path = await save({
      title: "Export XML Sitemap",
      defaultPath: "sitemap.xml",
      filters: [{ name: "XML Sitemap", extensions: ["xml"] }],
    });
    if (!path) return;
    const xml = generateXmlSitemap(exportResults);
    try {
      await invoke("write_file", { path, contents: xml });
      showToast("File saved successfully!", "success");
    } catch (e) {
      showToast("Failed to save file: " + e, "error");
    }
  }, [results, issueFilter, displayedResults]);

  // Collect HTML URLs for PSI
  const crawledHtmlUrls = results
    .filter((r) => r.content_type.includes("text/html") && r.status_code >= 200 && r.status_code < 300)
    .map((r) => r.url);

  // ── Menu definitions ──
  const menus = useMemo(
    () => [
      {
        label: "File",
        items: [
          { label: "Save Project", shortcut: "Ctrl+S", onClick: handleSaveProject, disabled: results.length === 0 },
          { label: "Open Project", shortcut: "Ctrl+O", onClick: handleLoadProject, disabled: isRunning },
          { separator: true as const },
          { label: "Export as CSV", shortcut: "Ctrl+E", onClick: handleExportCsv, disabled: results.length === 0 },
          { label: "Export as XLSX", shortcut: "Ctrl+Shift+E", onClick: handleExportXlsx, disabled: results.length === 0 },
          { label: "Export XML Sitemap", onClick: handleExportSitemap, disabled: results.length === 0 },
          { separator: true as const },
          { label: "Settings", shortcut: "Ctrl+,", onClick: () => setShowSettings(true) },
        ],
      },
      {
        label: "View",
        items: [
          { label: showIssues ? "Hide Issues Panel" : "Show Issues Panel", shortcut: "Ctrl+Shift+P", onClick: () => setShowIssues((v) => !v) },
          { label: showIntegrations ? "Hide Integrations" : "Show Integrations", shortcut: "Ctrl+Shift+I", onClick: () => setShowIntegrations((v) => !v) },
          { label: showVisualizations ? "Hide Visualizations" : "Show Visualizations", shortcut: "Ctrl+Shift+V", onClick: () => setShowVisualizations((v) => !v) },
          { separator: true as const },
          { label: "Close Detail Panel", shortcut: "Escape", onClick: () => setSelectedResult(null), disabled: !selectedResult },
          { separator: true as const },
          { label: theme === "dark" ? "Light Mode" : "Dark Mode", onClick: () => setTheme(theme === "dark" ? "light" : "dark") },
        ],
      },
      {
        label: "Crawl",
        items: [
          { label: "Start Crawl", shortcut: "F5", onClick: handleStart, disabled: isRunning || !url.trim() },
          { label: "Stop Crawl", shortcut: "Shift+F5", onClick: stopCrawl, disabled: !isRunning },
          { label: "List Mode", onClick: () => setShowListMode(true), disabled: isRunning },
          { separator: true as const },
          { label: "Clear Results", shortcut: "Ctrl+Shift+Delete", onClick: handleClear, disabled: isRunning || results.length === 0 },
        ],
      },
      {
        label: "Tools",
        items: [
          { label: "Crawl History", shortcut: "Ctrl+H", onClick: () => setShowComparison(true) },
          { label: "Config Profiles", onClick: () => setShowProfileManager(true) },
        ],
      },
      {
        label: "Help",
        items: [
          { label: "Keyboard Shortcuts", onClick: () => showToast("F5: Start | Shift+F5: Stop | Ctrl+S: Save | Ctrl+O: Open | Ctrl+E: Export CSV | Ctrl+,: Settings | Ctrl+H: History | Esc: Close panel", "info") },
          { separator: true as const },
          { label: "About ScreamingCAT", onClick: () => setShowAbout(true) },
        ],
      },
    ],
    [results.length, isRunning, url, selectedResult, theme, showIssues, showIntegrations, showVisualizations, handleSaveProject, handleLoadProject, handleExportCsv, handleExportXlsx, handleExportSitemap, handleStart, stopCrawl, handleClear]
  );

  // ── Global keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Don't intercept when typing in input fields (except for global shortcuts)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // F5 — Start crawl
      if (e.key === "F5" && !shift && !ctrl) {
        e.preventDefault();
        if (!isRunning && url.trim()) handleStart();
        return;
      }
      // Shift+F5 — Stop crawl
      if (e.key === "F5" && shift && !ctrl) {
        e.preventDefault();
        if (isRunning) stopCrawl();
        return;
      }
      // Escape — Close dialog/panel
      if (e.key === "Escape") {
        if (showSettings) { setShowSettings(false); return; }
        if (selectedResult) { setSelectedResult(null); return; }
        return;
      }

      if (!ctrl) return;

      // Ctrl+S — Save project
      if (e.key === "s" && !shift) {
        e.preventDefault();
        handleSaveProject();
        return;
      }
      // Ctrl+O — Open project
      if (e.key === "o" && !shift) {
        e.preventDefault();
        if (!isRunning) handleLoadProject();
        return;
      }
      // Ctrl+E — Export CSV
      if (e.key === "e" && !shift) {
        e.preventDefault();
        handleExportCsv();
        return;
      }
      // Ctrl+Shift+E — Export XLSX
      if (e.key === "E" && shift) {
        e.preventDefault();
        handleExportXlsx();
        return;
      }
      // Ctrl+, — Settings
      if (e.key === ",") {
        e.preventDefault();
        setShowSettings((v) => !v);
        return;
      }

      // Skip view toggles if in input
      if (isInput) return;

      // Ctrl+Shift+P — Issues panel
      if ((e.key === "P" || e.key === "p") && shift) {
        e.preventDefault();
        setShowIssues((v) => !v);
        return;
      }
      // Ctrl+Shift+I — Integrations panel
      if ((e.key === "I" || e.key === "i") && shift) {
        e.preventDefault();
        setShowIntegrations((v) => !v);
        return;
      }
      // Ctrl+Shift+V — Visualizations
      if ((e.key === "V" || e.key === "v") && shift) {
        e.preventDefault();
        setShowVisualizations((v) => !v);
        return;
      }
      // Ctrl+Shift+Delete — Clear results
      if (e.key === "Delete" && shift) {
        e.preventDefault();
        if (!isRunning && results.length > 0) handleClear();
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isRunning, url, showSettings, selectedResult, results.length, handleStart, stopCrawl, handleSaveProject, handleLoadProject, handleExportCsv, handleExportXlsx, handleClear]);

  return (
    <div className="h-screen flex flex-col bg-surface-0">
      <MenuBar menus={menus} />
      <Toolbar
        url={url}
        onUrlChange={setUrl}
        onStart={handleStart}
        onStop={stopCrawl}
        isRunning={isRunning}
        showIssues={showIssues}
        onToggleIssues={() => setShowIssues((v) => !v)}
        showIntegrations={showIntegrations}
        onToggleIntegrations={() => setShowIntegrations((v) => !v)}
        showVisualizations={showVisualizations}
        onToggleVisualizations={() => setShowVisualizations((v) => !v)}
        onClear={handleClear}
        hasResults={results.length > 0}
        onOpenSettings={() => setShowSettings(true)}
        onOpenListMode={() => setShowListMode(true)}
      />
      <StatsBar stats={stats} />

      {/* Issue filter banner */}
      {issueFilter && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-accent/10 border-b border-accent/20 text-sm">
          <span className="text-accent font-medium">Filtered:</span>
          <span className="text-gray-300">{issueFilterLabel}</span>
          <span className="text-gray-500">({issueFilter.length} URLs)</span>
          <button
            onClick={handleClearIssueFilter}
            className="ml-auto text-xs text-gray-400 hover:text-gray-100 px-2 py-0.5 rounded hover:bg-surface-2 transition-colors"
          >
            Clear filter
          </button>
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top: table + side panels */}
        <div className="flex flex-1 overflow-hidden">
          {showVisualizations ? (
            <Visualizations
              results={results}
              onUrlClick={(url) => {
                const match = results.find((r) => r.url === url);
                if (match) setSelectedResult(match);
              }}
            />
          ) : (
            <ResultsTable
              data={displayedResults}
              onRowClick={setSelectedResult}
              pageSpeedResults={pageSpeedResults}
              gscResults={gscResults}
              gaResults={gaResults}
            />
          )}
          {showIntegrations && (
            <div className="w-72 shrink-0 border-l border-surface-3">
              <IntegrationsPanel
                integrationConfig={integrationConfig}
                onIntegrationConfigChange={setIntegrationConfig}
                crawledUrls={crawledHtmlUrls}
                onPageSpeedResults={setPageSpeedResults}
                onGscResults={setGscResults}
                onGaResults={setGaResults}
                pageSpeedResults={pageSpeedResults}
                gscResults={gscResults}
                gaResults={gaResults}
              />
            </div>
          )}
          {showIssues && (
            <div className="w-80 shrink-0 border-l border-surface-3">
              <IssuesPanel
                results={results}
                onUrlClick={handleIssueUrlClick}
                onIssueSelect={handleIssueSelect}
              />
            </div>
          )}
        </div>

        {/* Bottom: detail panel */}
        <DetailPanel
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
          pageSpeedData={pageSpeedResults.find((p) => p.url.replace(/\/+$/, "") === selectedResult?.url.replace(/\/+$/, ""))}
          gscData={gscResults.find((g) => g.url.replace(/\/+$/, "") === selectedResult?.url.replace(/\/+$/, ""))}
          gaData={gaResults.find((g) => g.url.replace(/\/+$/, "") === selectedResult?.url.replace(/\/+$/, ""))}
          inlinks={selectedResult ? inlinksMap.get(selectedResult.url) : undefined}
          allResults={results}
        />
      </div>

      {showListMode && (
        <ListModeDialog
          config={config}
          onClose={() => setShowListMode(false)}
          onStarted={() => {
            setShowListMode(false);
          }}
        />
      )}

      {showComparison && (
        <CrawlHistoryPanel
          onClose={() => setShowComparison(false)}
          storageConfig={storageConfig}
          hasResults={results.length > 0}
        />
      )}

      {showSettings && (
        <SettingsDialog
          config={config}
          onChange={setConfig}
          integrationConfig={integrationConfig}
          onIntegrationChange={setIntegrationConfig}
          storageConfig={storageConfig}
          onStorageChange={setStorageConfig}
          onClose={() => setShowSettings(false)}
          isRunning={isRunning}
        />
      )}

      {showProfileManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowProfileManager(false)} />
          <div className="relative bg-surface-1 border border-surface-3 rounded-xl shadow-2xl w-[550px] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-3">
              <h2 className="text-sm font-semibold text-gray-200">Config Profiles</h2>
              <button onClick={() => setShowProfileManager(false)} className="text-gray-500 hover:text-gray-300">&times;</button>
            </div>
            {/* Save current config */}
            <div className="px-4 pt-3 pb-2 border-b border-surface-3">
              <form onSubmit={(e) => {
                e.preventDefault();
                const input = (e.target as HTMLFormElement).elements.namedItem("profileName") as HTMLInputElement;
                const name = input.value.trim();
                if (!name) return;
                setConfigProfiles((prev) => [...prev, { name, config: { ...config }, createdAt: new Date().toISOString() }]);
                input.value = "";
                showToast(`Config profile "${name}" saved`, "success");
              }} className="flex gap-2">
                <input name="profileName" type="text" placeholder="Profile name..." className="flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-surface-3 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent/50" />
                <button type="submit" className="px-4 py-1.5 text-xs font-medium bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors">Save Current</button>
              </form>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {configProfiles.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No saved profiles yet. Enter a name above and click Save Current.</p>
              ) : (
                <div className="space-y-2">
                  {configProfiles.map((profile, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded bg-surface-2 border border-surface-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200 font-medium truncate">{profile.name}</div>
                        <div className="text-xs text-gray-500">{new Date(profile.createdAt).toLocaleDateString()}</div>
                      </div>
                      <button
                        onClick={() => {
                          setConfig(profile.config);
                          setShowProfileManager(false);
                          showToast(`Loaded profile "${profile.name}"`, "success");
                        }}
                        className="px-3 py-1 text-xs bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors"
                      >
                        Load
                      </button>
                      <button
                        onClick={async () => {
                          const confirmed = await ask(`Delete profile "${profile.name}"?`, { title: "Delete Profile", kind: "warning" });
                          if (!confirmed) return;
                          setConfigProfiles((prev) => prev.filter((_, j) => j !== i));
                        }}
                        className="px-3 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAbout(false)} />
          <div className="relative bg-surface-1 border border-surface-3 rounded-xl shadow-2xl w-[380px] p-6 text-center">
            <div className="text-2xl font-bold text-accent mb-1">ScreamingCAT</div>
            <div className="text-xs text-gray-400 mb-4">SEO Spider &mdash; v0.1.0</div>
            <p className="text-sm text-gray-300 mb-3">
              Desktop SEO crawler for technical audits, built with Tauri + React + Rust.
            </p>
            <div className="text-xs text-gray-500 space-y-1 mb-4">
              <div>Tauri 2 &bull; React 19 &bull; SQLite WAL</div>
              <div>JS Rendering &bull; PageSpeed &bull; GSC &bull; GA4</div>
            </div>
            <button onClick={() => setShowAbout(false)} className="px-6 py-1.5 text-xs bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors">Close</button>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
}

export default App;
