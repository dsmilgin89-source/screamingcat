import { useState, useCallback, useEffect, useMemo, useReducer } from "react";
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
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
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

// ── UI Panel State ──
interface UIPanelState {
  selectedResult: CrawlResult | null;
  showIssues: boolean;
  showIntegrations: boolean;
  showVisualizations: boolean;
  showSettings: boolean;
  showListMode: boolean;
  showComparison: boolean;
  showProfileManager: boolean;
  showAbout: boolean;
  issueFilter: string[] | null;
  issueFilterLabel: string;
}

type UIPanelAction =
  | { type: "SET_SELECTED_RESULT"; payload: CrawlResult | null }
  | { type: "TOGGLE_ISSUES" }
  | { type: "TOGGLE_INTEGRATIONS" }
  | { type: "TOGGLE_VISUALIZATIONS" }
  | { type: "TOGGLE_SETTINGS" }
  | { type: "SET_SHOW_SETTINGS"; payload: boolean }
  | { type: "SET_SHOW_LIST_MODE"; payload: boolean }
  | { type: "SET_SHOW_COMPARISON"; payload: boolean }
  | { type: "SET_SHOW_PROFILE_MANAGER"; payload: boolean }
  | { type: "SET_SHOW_ABOUT"; payload: boolean }
  | { type: "SET_ISSUE_FILTER"; payload: { urls: string[] | null; label: string } }
  | { type: "CLEAR_ALL_SELECTIONS" };

const initialUIPanelState: UIPanelState = {
  selectedResult: null,
  showIssues: true,
  showIntegrations: false,
  showVisualizations: false,
  showSettings: false,
  showListMode: false,
  showComparison: false,
  showProfileManager: false,
  showAbout: false,
  issueFilter: null,
  issueFilterLabel: "",
};

function uiPanelReducer(state: UIPanelState, action: UIPanelAction): UIPanelState {
  switch (action.type) {
    case "SET_SELECTED_RESULT":
      return { ...state, selectedResult: action.payload };
    case "TOGGLE_ISSUES":
      return { ...state, showIssues: !state.showIssues };
    case "TOGGLE_INTEGRATIONS":
      return { ...state, showIntegrations: !state.showIntegrations };
    case "TOGGLE_VISUALIZATIONS":
      return { ...state, showVisualizations: !state.showVisualizations };
    case "TOGGLE_SETTINGS":
      return { ...state, showSettings: !state.showSettings };
    case "SET_SHOW_SETTINGS":
      return { ...state, showSettings: action.payload };
    case "SET_SHOW_LIST_MODE":
      return { ...state, showListMode: action.payload };
    case "SET_SHOW_COMPARISON":
      return { ...state, showComparison: action.payload };
    case "SET_SHOW_PROFILE_MANAGER":
      return { ...state, showProfileManager: action.payload };
    case "SET_SHOW_ABOUT":
      return { ...state, showAbout: action.payload };
    case "SET_ISSUE_FILTER":
      return { ...state, issueFilter: action.payload.urls, issueFilterLabel: action.payload.label };
    case "CLEAR_ALL_SELECTIONS":
      return { ...state, selectedResult: null, issueFilter: null, issueFilterLabel: "" };
    default:
      return state;
  }
}

// ── Integration State ──
interface IntegrationState {
  config: IntegrationConfig;
  pageSpeedResults: PageSpeedResult[];
  gscResults: GscPageData[];
  gaResults: GaPageData[];
}

type IntegrationAction =
  | { type: "SET_CONFIG"; payload: IntegrationConfig }
  | { type: "SET_PAGESPEED_RESULTS"; payload: PageSpeedResult[] }
  | { type: "SET_GSC_RESULTS"; payload: GscPageData[] }
  | { type: "SET_GA_RESULTS"; payload: GaPageData[] }
  | { type: "CLEAR_RESULTS" }
  | { type: "LOAD_PROJECT"; payload: { pageSpeedResults?: PageSpeedResult[]; gscResults?: GscPageData[]; gaResults?: GaPageData[] } };

function loadIntegrationConfig(): IntegrationConfig {
  try {
    const stored = localStorage.getItem(INTEGRATION_STORAGE_KEY);
    if (stored) return { ...defaultIntegrationConfig, ...JSON.parse(stored) };
  } catch (e) {
    console.warn("Failed to load integration config from localStorage:", e);
  }
  return { ...defaultIntegrationConfig };
}

function integrationReducer(state: IntegrationState, action: IntegrationAction): IntegrationState {
  switch (action.type) {
    case "SET_CONFIG":
      return { ...state, config: action.payload };
    case "SET_PAGESPEED_RESULTS":
      return { ...state, pageSpeedResults: action.payload };
    case "SET_GSC_RESULTS":
      return { ...state, gscResults: action.payload };
    case "SET_GA_RESULTS":
      return { ...state, gaResults: action.payload };
    case "CLEAR_RESULTS":
      return { ...state, pageSpeedResults: [], gscResults: [], gaResults: [] };
    case "LOAD_PROJECT":
      return {
        ...state,
        pageSpeedResults: action.payload.pageSpeedResults ?? state.pageSpeedResults,
        gscResults: action.payload.gscResults ?? state.gscResults,
        gaResults: action.payload.gaResults ?? state.gaResults,
      };
    default:
      return state;
  }
}

// ── Config State ──
interface ConfigState {
  crawlConfig: CrawlConfig;
  profiles: ConfigProfile[];
  storageConfig: StorageConfig;
}

type ConfigAction =
  | { type: "SET_CRAWL_CONFIG"; payload: CrawlConfig }
  | { type: "SET_STORAGE_CONFIG"; payload: StorageConfig }
  | { type: "ADD_PROFILE"; payload: ConfigProfile }
  | { type: "REMOVE_PROFILE"; payload: number }
  | { type: "SET_PROFILES"; payload: ConfigProfile[] };

function loadStorageConfig(): StorageConfig {
  try {
    const stored = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (stored) return { ...DEFAULT_STORAGE_CONFIG, ...JSON.parse(stored) };
  } catch (e) {
    console.warn("Failed to load storage config from localStorage:", e);
  }
  return { ...DEFAULT_STORAGE_CONFIG };
}

function loadConfigProfiles(): ConfigProfile[] {
  try {
    const stored = localStorage.getItem(CONFIG_PROFILES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn("Failed to load config profiles from localStorage:", e);
    return [];
  }
}

function configReducer(state: ConfigState, action: ConfigAction): ConfigState {
  switch (action.type) {
    case "SET_CRAWL_CONFIG":
      return { ...state, crawlConfig: action.payload };
    case "SET_STORAGE_CONFIG":
      return { ...state, storageConfig: action.payload };
    case "ADD_PROFILE":
      return { ...state, profiles: [...state.profiles, action.payload] };
    case "REMOVE_PROFILE":
      return { ...state, profiles: state.profiles.filter((_, i) => i !== action.payload) };
    case "SET_PROFILES":
      return { ...state, profiles: action.payload };
    default:
      return state;
  }
}

function App() {
  const { results, stats, isRunning, startCrawl, stopCrawl, clearResults, setResults } =
    useCrawl();

  // ── UI Panel reducer ──
  const [ui, dispatchUI] = useReducer(uiPanelReducer, initialUIPanelState);

  // ── Integration reducer ──
  const [integration, dispatchIntegration] = useReducer(integrationReducer, {
    config: loadIntegrationConfig(),
    pageSpeedResults: [],
    gscResults: [],
    gaResults: [],
  });

  // ── Config reducer ──
  const [configState, dispatchConfig] = useReducer(configReducer, {
    crawlConfig: defaultConfig,
    profiles: loadConfigProfiles(),
    storageConfig: loadStorageConfig(),
  });

  const [url, setUrl] = useState("");

  // ── Theme state (kept as useState — simple single value with DOM side effect) ──
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem(THEME_KEY) as Theme) || "dark";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // ── Persist config profiles ──
  useEffect(() => {
    localStorage.setItem(CONFIG_PROFILES_KEY, JSON.stringify(configState.profiles));
  }, [configState.profiles]);

  // ── Persist integration config ──
  useEffect(() => {
    localStorage.setItem(INTEGRATION_STORAGE_KEY, JSON.stringify(integration.config));
  }, [integration.config]);

  // ── Persist storage config ──
  useEffect(() => {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(configState.storageConfig));
  }, [configState.storageConfig]);

  // ── Auto-save snapshot after crawl completes ──
  const [prevRunning, setPrevRunning] = useState(false);
  useEffect(() => {
    if (prevRunning && !isRunning && results.length > 0 && configState.storageConfig.auto_save) {
      const name = `Auto-save ${new Date().toLocaleString()}`;
      invoke("save_crawl_snapshot", { name, storageConfig: configState.storageConfig }).catch(() => {});
    }
    setPrevRunning(isRunning);
  }, [isRunning]);

  const displayedResults = ui.issueFilter
    ? results.filter((r) => ui.issueFilter!.includes(r.url))
    : results;

  const inlinksMap = useMemo(() => buildInlinksMap(results), [results]);

  const handleIssueUrlClick = (url: string) => {
    const match = results.find((r) => r.url === url);
    if (match) dispatchUI({ type: "SET_SELECTED_RESULT", payload: match });
  };

  const handleIssueSelect = useCallback(
    (urls: string[], label: string) => {
      dispatchUI({ type: "SET_ISSUE_FILTER", payload: { urls, label } });
      dispatchUI({ type: "SET_SELECTED_RESULT", payload: null });
    },
    []
  );

  const handleClearIssueFilter = useCallback(() => {
    dispatchUI({ type: "SET_ISSUE_FILTER", payload: { urls: null, label: "" } });
  }, []);

  const handleClear = useCallback(async () => {
    const confirmed = await ask("Are you sure you want to clear all results?", {
      title: "Clear Results",
      kind: "warning",
    });
    if (!confirmed) return;
    clearResults();
    dispatchUI({ type: "CLEAR_ALL_SELECTIONS" });
    dispatchIntegration({ type: "CLEAR_RESULTS" });
  }, [clearResults]);

  // ── Start crawl ──
  const handleStart = useCallback(() => {
    if (!url.trim()) return;
    let crawlUrl = url.trim();
    if (!crawlUrl.startsWith("http")) {
      crawlUrl = "https://" + crawlUrl;
    }
    startCrawl({ ...configState.crawlConfig, url: crawlUrl });
  }, [url, configState.crawlConfig, startCrawl]);

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
      pageSpeedResults: integration.pageSpeedResults,
      gscResults: integration.gscResults,
      gaResults: integration.gaResults,
      exportedAt: new Date().toISOString(),
    };
    try {
      await invoke("write_file", { path, contents: JSON.stringify(project) });
      showToast("File saved successfully!", "success");
    } catch (e) {
      showToast("Failed to save file: " + e, "error");
    }
  }, [results, integration.pageSpeedResults, integration.gscResults, integration.gaResults]);

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
        dispatchUI({ type: "CLEAR_ALL_SELECTIONS" });
        dispatchIntegration({
          type: "LOAD_PROJECT",
          payload: {
            pageSpeedResults: project.pageSpeedResults,
            gscResults: project.gscResults,
            gaResults: project.gaResults,
          },
        });
      }
    } catch (e) {
      showToast("Failed to load project: " + e, "error");
    }
  }, [setResults]);

  // ── Export CSV ──
  const handleExportCsv = useCallback(async () => {
    const exportResults = ui.issueFilter ? displayedResults : results;
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
  }, [results, ui.issueFilter, displayedResults]);

  // ── Export XLSX ──
  const handleExportXlsx = useCallback(async () => {
    const exportResults = ui.issueFilter ? displayedResults : results;
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
  }, [results, ui.issueFilter, displayedResults]);

  // ── Export XML Sitemap ──
  const handleExportSitemap = useCallback(async () => {
    const exportResults = ui.issueFilter ? displayedResults : results;
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
  }, [results, ui.issueFilter, displayedResults]);

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
          { label: "Settings", shortcut: "Ctrl+,", onClick: () => dispatchUI({ type: "SET_SHOW_SETTINGS", payload: true }) },
        ],
      },
      {
        label: "View",
        items: [
          { label: ui.showIssues ? "Hide Issues Panel" : "Show Issues Panel", shortcut: "Ctrl+Shift+P", onClick: () => dispatchUI({ type: "TOGGLE_ISSUES" }) },
          { label: ui.showIntegrations ? "Hide Integrations" : "Show Integrations", shortcut: "Ctrl+Shift+I", onClick: () => dispatchUI({ type: "TOGGLE_INTEGRATIONS" }) },
          { label: ui.showVisualizations ? "Hide Visualizations" : "Show Visualizations", shortcut: "Ctrl+Shift+V", onClick: () => dispatchUI({ type: "TOGGLE_VISUALIZATIONS" }) },
          { separator: true as const },
          { label: "Close Detail Panel", shortcut: "Escape", onClick: () => dispatchUI({ type: "SET_SELECTED_RESULT", payload: null }), disabled: !ui.selectedResult },
          { separator: true as const },
          { label: theme === "dark" ? "Light Mode" : "Dark Mode", onClick: () => setTheme(theme === "dark" ? "light" : "dark") },
        ],
      },
      {
        label: "Crawl",
        items: [
          { label: "Start Crawl", shortcut: "F5", onClick: handleStart, disabled: isRunning || !url.trim() },
          { label: "Stop Crawl", shortcut: "Shift+F5", onClick: stopCrawl, disabled: !isRunning },
          { label: "List Mode", onClick: () => dispatchUI({ type: "SET_SHOW_LIST_MODE", payload: true }), disabled: isRunning },
          { separator: true as const },
          { label: "Clear Results", shortcut: "Ctrl+Shift+Delete", onClick: handleClear, disabled: isRunning || results.length === 0 },
        ],
      },
      {
        label: "Tools",
        items: [
          { label: "Crawl History", shortcut: "Ctrl+H", onClick: () => dispatchUI({ type: "SET_SHOW_COMPARISON", payload: true }) },
          { label: "Config Profiles", onClick: () => dispatchUI({ type: "SET_SHOW_PROFILE_MANAGER", payload: true }) },
        ],
      },
      {
        label: "Help",
        items: [
          { label: "Keyboard Shortcuts", onClick: () => showToast("F5: Start | Shift+F5: Stop | Ctrl+S: Save | Ctrl+O: Open | Ctrl+E: Export CSV | Ctrl+,: Settings | Ctrl+H: History | Esc: Close panel", "info") },
          { separator: true as const },
          { label: "About ScreamingCAT", onClick: () => dispatchUI({ type: "SET_SHOW_ABOUT", payload: true }) },
        ],
      },
    ],
    [results.length, isRunning, url, ui.selectedResult, theme, ui.showIssues, ui.showIntegrations, ui.showVisualizations, handleSaveProject, handleLoadProject, handleExportCsv, handleExportXlsx, handleExportSitemap, handleStart, stopCrawl, handleClear]
  );

  // ── Global keyboard shortcuts (extracted to custom hook) ──
  const onCloseSettings = useCallback(() => dispatchUI({ type: "SET_SHOW_SETTINGS", payload: false }), []);
  const onToggleSettings = useCallback(() => dispatchUI({ type: "TOGGLE_SETTINGS" }), []);
  const onCloseSelectedResult = useCallback(() => dispatchUI({ type: "SET_SELECTED_RESULT", payload: null }), []);
  const onToggleIssues = useCallback(() => dispatchUI({ type: "TOGGLE_ISSUES" }), []);
  const onToggleIntegrations = useCallback(() => dispatchUI({ type: "TOGGLE_INTEGRATIONS" }), []);
  const onToggleVisualizations = useCallback(() => dispatchUI({ type: "TOGGLE_VISUALIZATIONS" }), []);

  useKeyboardShortcuts({
    isRunning,
    url,
    showSettings: ui.showSettings,
    selectedResult: ui.selectedResult,
    resultsLength: results.length,
    handleStart,
    stopCrawl,
    handleSaveProject,
    handleLoadProject,
    handleExportCsv,
    handleExportXlsx,
    handleClear,
    onCloseSettings,
    onToggleSettings,
    onCloseSelectedResult,
    onToggleIssues,
    onToggleIntegrations,
    onToggleVisualizations,
  });

  return (
    <div className="h-screen flex flex-col bg-surface-0">
      <MenuBar menus={menus} />
      <Toolbar
        url={url}
        onUrlChange={setUrl}
        onStart={handleStart}
        onStop={stopCrawl}
        isRunning={isRunning}
        showIssues={ui.showIssues}
        onToggleIssues={() => dispatchUI({ type: "TOGGLE_ISSUES" })}
        showIntegrations={ui.showIntegrations}
        onToggleIntegrations={() => dispatchUI({ type: "TOGGLE_INTEGRATIONS" })}
        showVisualizations={ui.showVisualizations}
        onToggleVisualizations={() => dispatchUI({ type: "TOGGLE_VISUALIZATIONS" })}
        onClear={handleClear}
        hasResults={results.length > 0}
        onOpenSettings={() => dispatchUI({ type: "SET_SHOW_SETTINGS", payload: true })}
        onOpenListMode={() => dispatchUI({ type: "SET_SHOW_LIST_MODE", payload: true })}
      />
      <StatsBar stats={stats} />

      {/* Issue filter banner */}
      {ui.issueFilter && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-accent/10 border-b border-accent/20 text-sm">
          <span className="text-accent font-medium">Filtered:</span>
          <span className="text-gray-300">{ui.issueFilterLabel}</span>
          <span className="text-gray-500">({ui.issueFilter.length} URLs)</span>
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
          {ui.showVisualizations ? (
            <Visualizations
              results={results}
              onUrlClick={(url) => {
                const match = results.find((r) => r.url === url);
                if (match) dispatchUI({ type: "SET_SELECTED_RESULT", payload: match });
              }}
            />
          ) : (
            <ResultsTable
              data={displayedResults}
              onRowClick={(result) => dispatchUI({ type: "SET_SELECTED_RESULT", payload: result })}
              pageSpeedResults={integration.pageSpeedResults}
              gscResults={integration.gscResults}
              gaResults={integration.gaResults}
            />
          )}
          {ui.showIntegrations && (
            <div className="w-72 shrink-0 border-l border-surface-3">
              <IntegrationsPanel
                integrationConfig={integration.config}
                onIntegrationConfigChange={(cfg) => dispatchIntegration({ type: "SET_CONFIG", payload: cfg })}
                crawledUrls={crawledHtmlUrls}
                onPageSpeedResults={(r) => dispatchIntegration({ type: "SET_PAGESPEED_RESULTS", payload: r })}
                onGscResults={(r) => dispatchIntegration({ type: "SET_GSC_RESULTS", payload: r })}
                onGaResults={(r) => dispatchIntegration({ type: "SET_GA_RESULTS", payload: r })}
                pageSpeedResults={integration.pageSpeedResults}
                gscResults={integration.gscResults}
                gaResults={integration.gaResults}
              />
            </div>
          )}
          {ui.showIssues && (
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
          result={ui.selectedResult}
          onClose={() => dispatchUI({ type: "SET_SELECTED_RESULT", payload: null })}
          pageSpeedData={integration.pageSpeedResults.find((p) => p.url.replace(/\/+$/, "") === ui.selectedResult?.url.replace(/\/+$/, ""))}
          gscData={integration.gscResults.find((g) => g.url.replace(/\/+$/, "") === ui.selectedResult?.url.replace(/\/+$/, ""))}
          gaData={integration.gaResults.find((g) => g.url.replace(/\/+$/, "") === ui.selectedResult?.url.replace(/\/+$/, ""))}
          inlinks={ui.selectedResult ? inlinksMap.get(ui.selectedResult.url) : undefined}
          allResults={results}
        />
      </div>

      {ui.showListMode && (
        <ListModeDialog
          config={configState.crawlConfig}
          onClose={() => dispatchUI({ type: "SET_SHOW_LIST_MODE", payload: false })}
          onStarted={() => {
            dispatchUI({ type: "SET_SHOW_LIST_MODE", payload: false });
          }}
        />
      )}

      {ui.showComparison && (
        <CrawlHistoryPanel
          onClose={() => dispatchUI({ type: "SET_SHOW_COMPARISON", payload: false })}
          storageConfig={configState.storageConfig}
          hasResults={results.length > 0}
        />
      )}

      {ui.showSettings && (
        <SettingsDialog
          config={configState.crawlConfig}
          onChange={(cfg) => dispatchConfig({ type: "SET_CRAWL_CONFIG", payload: cfg })}
          integrationConfig={integration.config}
          onIntegrationChange={(cfg) => dispatchIntegration({ type: "SET_CONFIG", payload: cfg })}
          storageConfig={configState.storageConfig}
          onStorageChange={(cfg) => dispatchConfig({ type: "SET_STORAGE_CONFIG", payload: cfg })}
          onClose={() => dispatchUI({ type: "SET_SHOW_SETTINGS", payload: false })}
          isRunning={isRunning}
        />
      )}

      {ui.showProfileManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => dispatchUI({ type: "SET_SHOW_PROFILE_MANAGER", payload: false })} />
          <div className="relative bg-surface-1 border border-surface-3 rounded-xl shadow-2xl w-[550px] max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-3">
              <h2 className="text-sm font-semibold text-gray-200">Config Profiles</h2>
              <button onClick={() => dispatchUI({ type: "SET_SHOW_PROFILE_MANAGER", payload: false })} className="text-gray-500 hover:text-gray-300">&times;</button>
            </div>
            {/* Save current config */}
            <div className="px-4 pt-3 pb-2 border-b border-surface-3">
              <form onSubmit={(e) => {
                e.preventDefault();
                const input = (e.target as HTMLFormElement).elements.namedItem("profileName") as HTMLInputElement;
                const name = input.value.trim();
                if (!name) return;
                dispatchConfig({ type: "ADD_PROFILE", payload: { name, config: { ...configState.crawlConfig }, createdAt: new Date().toISOString() } });
                input.value = "";
                showToast(`Config profile "${name}" saved`, "success");
              }} className="flex gap-2">
                <input name="profileName" type="text" placeholder="Profile name..." className="flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-surface-3 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent/50" />
                <button type="submit" className="px-4 py-1.5 text-xs font-medium bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors">Save Current</button>
              </form>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {configState.profiles.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No saved profiles yet. Enter a name above and click Save Current.</p>
              ) : (
                <div className="space-y-2">
                  {configState.profiles.map((profile, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded bg-surface-2 border border-surface-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200 font-medium truncate">{profile.name}</div>
                        <div className="text-xs text-gray-500">{new Date(profile.createdAt).toLocaleDateString()}</div>
                      </div>
                      <button
                        onClick={() => {
                          dispatchConfig({ type: "SET_CRAWL_CONFIG", payload: profile.config });
                          dispatchUI({ type: "SET_SHOW_PROFILE_MANAGER", payload: false });
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
                          dispatchConfig({ type: "REMOVE_PROFILE", payload: i });
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

      {ui.showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => dispatchUI({ type: "SET_SHOW_ABOUT", payload: false })} />
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
            <button onClick={() => dispatchUI({ type: "SET_SHOW_ABOUT", payload: false })} className="px-6 py-1.5 text-xs bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors">Close</button>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
}

export default App;
