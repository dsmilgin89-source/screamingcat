import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  IntegrationConfig,
  PageSpeedResult,
  GscPageData,
  GaPageData,
  GoogleTokens,
} from "@/types/integrations";
import { isTokenExpired } from "@/types/integrations";

interface IntegrationsPanelProps {
  integrationConfig: IntegrationConfig;
  onIntegrationConfigChange: (config: IntegrationConfig) => void;
  crawledUrls: string[];
  onPageSpeedResults: (results: PageSpeedResult[]) => void;
  onGscResults: (results: GscPageData[]) => void;
  onGaResults: (results: GaPageData[]) => void;
  pageSpeedResults: PageSpeedResult[];
  gscResults: GscPageData[];
  gaResults: GaPageData[];
}

/** Try to auto-refresh token if expired, returns updated tokens */
async function ensureFreshToken(
  config: IntegrationConfig,
  tokens: GoogleTokens,
  onConfigChange: (config: IntegrationConfig) => void,
  tokenKey: "gsc_tokens" | "ga_tokens"
): Promise<GoogleTokens> {
  if (!isTokenExpired(tokens)) return tokens;

  if (!tokens.refresh_token) {
    throw new Error("Token expired and no refresh token available. Please reconnect.");
  }

  const newTokens = await invoke<GoogleTokens>("google_oauth_refresh", {
    clientId: config.google_client_id,
    clientSecret: config.google_client_secret,
    refreshToken: tokens.refresh_token,
  });

  // Update config with new tokens
  onConfigChange({ ...config, [tokenKey]: newTokens });
  return newTokens;
}

/** Format date as YYYY-MM-DD in local timezone */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function IntegrationsPanel({
  integrationConfig,
  onIntegrationConfigChange,
  crawledUrls,
  onPageSpeedResults,
  onGscResults,
  onGaResults,
  pageSpeedResults,
  gscResults,
  gaResults,
}: IntegrationsPanelProps) {
  const [psiRunning, setPsiRunning] = useState(false);
  const [psiProgress, setPsiProgress] = useState({ completed: 0, total: 0 });
  const [gscLoading, setGscLoading] = useState(false);
  const [gaLoading, setGaLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const psiCancelRef = useRef(false);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 5000);
  };

  // ── PageSpeed Insights ──
  const runPageSpeed = useCallback(async () => {
    if (!integrationConfig.psi_api_key) {
      setError("PageSpeed API key not configured. Go to Settings → Integrations.");
      return;
    }

    const htmlUrls = crawledUrls.slice(0, 500);
    if (htmlUrls.length === 0) {
      setError("No URLs to analyze. Run a crawl first.");
      return;
    }

    setPsiRunning(true);
    psiCancelRef.current = false;
    setError("");
    setPsiProgress({ completed: 0, total: htmlUrls.length });

    const unlisten = await listen<{
      completed: number;
      total: number;
      result: PageSpeedResult;
    }>("pagespeed-progress", (event) => {
      setPsiProgress({ completed: event.payload.completed, total: event.payload.total });
    });

    try {
      const results = await invoke<PageSpeedResult[]>("run_pagespeed_batch", {
        urls: htmlUrls,
        apiKey: integrationConfig.psi_api_key,
        strategy: integrationConfig.psi_strategy,
      });
      onPageSpeedResults(results);
      const successCount = results.filter((r) => r.analyzed).length;
      showSuccess(`PageSpeed: ${successCount}/${results.length} URLs analyzed`);
    } catch (e) {
      setError(`PageSpeed error: ${e}`);
    }

    unlisten();
    setPsiRunning(false);
  }, [integrationConfig, crawledUrls, onPageSpeedResults]);

  // ── Google Search Console ──
  const fetchGsc = useCallback(async () => {
    if (!integrationConfig.gsc_tokens) {
      setError("Search Console not connected. Go to Settings → Integrations.");
      return;
    }
    if (!integrationConfig.gsc_site_url) {
      setError("GSC Site URL not configured. Go to Settings → Integrations.");
      return;
    }

    setGscLoading(true);
    setError("");

    // Use 3-day offset to avoid incomplete data
    const end = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);

    try {
      const tokens = await ensureFreshToken(
        integrationConfig,
        integrationConfig.gsc_tokens,
        onIntegrationConfigChange,
        "gsc_tokens"
      );

      const results = await invoke<GscPageData[]>("fetch_gsc_pages", {
        siteUrl: integrationConfig.gsc_site_url,
        accessToken: tokens.access_token,
        startDate: formatDate(start),
        endDate: formatDate(end),
      });
      onGscResults(results);
      showSuccess(`Search Console: ${results.length} pages fetched`);
    } catch (e) {
      setError(`GSC error: ${e}`);
    }
    setGscLoading(false);
  }, [integrationConfig, onIntegrationConfigChange, onGscResults]);

  // ── Google Analytics ──
  const fetchGa = useCallback(async () => {
    if (!integrationConfig.ga_tokens) {
      setError("Analytics not connected. Go to Settings → Integrations.");
      return;
    }
    if (!integrationConfig.ga_property_id) {
      setError("GA4 Property ID not configured. Go to Settings → Integrations.");
      return;
    }

    setGaLoading(true);
    setError("");

    const end = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);

    try {
      const tokens = await ensureFreshToken(
        integrationConfig,
        integrationConfig.ga_tokens,
        onIntegrationConfigChange,
        "ga_tokens"
      );

      const results = await invoke<GaPageData[]>("fetch_ga_pages", {
        propertyId: integrationConfig.ga_property_id,
        accessToken: tokens.access_token,
        startDate: formatDate(start),
        endDate: formatDate(end),
      });
      onGaResults(results);
      showSuccess(`Analytics: ${results.length} pages fetched`);
    } catch (e) {
      setError(`GA error: ${e}`);
    }
    setGaLoading(false);
  }, [integrationConfig, onIntegrationConfigChange, onGaResults]);

  const hasPsiKey = !!integrationConfig.psi_api_key;
  const hasGsc = !!integrationConfig.gsc_tokens;
  const hasGa = !!integrationConfig.ga_tokens;

  return (
    <div className="h-full flex flex-col bg-surface-1">
      <div className="px-4 py-3 border-b border-surface-3 shrink-0">
        <h3 className="text-sm font-medium text-gray-200">Integrations</h3>
        <p className="text-xs text-gray-500 mt-0.5">Connect external data sources</p>
      </div>

      {error && (
        <div className="mx-3 mt-2 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 text-xs text-red-400">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 text-red-500 hover:text-red-300"
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mx-3 mt-2 bg-green-500/10 border border-green-500/20 rounded px-3 py-2 text-xs text-green-400">
          {successMsg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* PageSpeed Insights */}
        <div className="bg-surface-0 rounded-lg border border-surface-3 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95a15.65 15.65 0 00-1.38-3.56A8.03 8.03 0 0118.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.987 7.987 0 015.08 16zm2.95-8H5.08a7.987 7.987 0 014.33-3.56A15.65 15.65 0 008.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 01-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z" />
              </svg>
              <span className="text-sm font-medium text-gray-200">PageSpeed Insights</span>
            </div>
            {pageSpeedResults.length > 0 && (
              <span className="text-xs text-green-400">{pageSpeedResults.filter((r) => r.analyzed).length} analyzed</span>
            )}
          </div>
          {crawledUrls.length > 500 && (
            <p className="text-xs text-yellow-400 mb-2">Only first 500 of {crawledUrls.length} URLs will be analyzed.</p>
          )}
          <button
            onClick={runPageSpeed}
            disabled={psiRunning || !hasPsiKey || crawledUrls.length === 0}
            className="w-full px-3 py-2 text-xs rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Run PageSpeed Insights analysis"
          >
            {psiRunning
              ? `Analyzing... ${psiProgress.completed}/${psiProgress.total}`
              : !hasPsiKey
                ? "API key required (Settings)"
                : crawledUrls.length === 0
                  ? "No URLs to analyze"
                  : `Run PageSpeed (${Math.min(crawledUrls.length, 500)} URLs)`}
          </button>
        </div>

        {/* Google Search Console */}
        <div className="bg-surface-0 rounded-lg border border-surface-3 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <span className="text-sm font-medium text-gray-200">Search Console</span>
            </div>
            {gscResults.length > 0 && (
              <span className="text-xs text-blue-400">{gscResults.length} pages</span>
            )}
          </div>
          <button
            onClick={fetchGsc}
            disabled={gscLoading || !hasGsc}
            className="w-full px-3 py-2 text-xs rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Fetch Search Console data"
          >
            {gscLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" strokeWidth="3" strokeLinecap="round" /></svg>
                Fetching data...
              </span>
            ) : !hasGsc
              ? "Not connected (Settings)"
              : "Fetch Search Console Data (28 days)"}
          </button>
        </div>

        {/* Google Analytics */}
        <div className="bg-surface-0 rounded-lg border border-surface-3 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
              </svg>
              <span className="text-sm font-medium text-gray-200">Analytics</span>
            </div>
            {gaResults.length > 0 && (
              <span className="text-xs text-orange-400">{gaResults.length} pages</span>
            )}
          </div>
          <button
            onClick={fetchGa}
            disabled={gaLoading || !hasGa}
            className="w-full px-3 py-2 text-xs rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Fetch Google Analytics data"
          >
            {gaLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" strokeWidth="3" strokeLinecap="round" /></svg>
                Fetching data...
              </span>
            ) : !hasGa
              ? "Not connected (Settings)"
              : "Fetch Analytics Data (28 days)"}
          </button>
        </div>
      </div>
    </div>
  );
}
