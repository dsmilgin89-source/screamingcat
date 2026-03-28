import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import type { IntegrationConfig, GoogleTokens } from "@/types/integrations";

interface IntegrationsTabProps {
  config: IntegrationConfig;
  onChange: (config: IntegrationConfig) => void;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
    </div>
  );
}

function StatusBadge({ connected, expiresInfo }: { connected: boolean; expiresInfo?: string }) {
  return connected ? (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400" aria-hidden="true" />
      Connected {expiresInfo && <span className="text-gray-500">({expiresInfo})</span>}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" aria-hidden="true" />
      Not connected
    </span>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-surface-0 border border-surface-3 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 p-1"
          aria-label={visible ? "Hide value" : "Show value"}
        >
          {visible ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}

export function IntegrationsTab({ config, onChange }: IntegrationsTabProps) {
  const [gscConnecting, setGscConnecting] = useState(false);
  const [gaConnecting, setGaConnecting] = useState(false);
  const [error, setError] = useState("");

  const handleGscConnect = async () => {
    if (!config.google_client_id || !config.google_client_secret) {
      setError("Please enter Google OAuth Client ID and Client Secret first.");
      return;
    }
    setGscConnecting(true);
    setError("");
    try {
      const tokens = await invoke<GoogleTokens>("google_oauth_connect", {
        clientId: config.google_client_id,
        clientSecret: config.google_client_secret,
        scopes: "https://www.googleapis.com/auth/webmasters.readonly",
      });
      onChange({ ...config, gsc_tokens: tokens });
    } catch (e) {
      setError(`GSC connection failed: ${e}`);
    }
    setGscConnecting(false);
  };

  const handleGaConnect = async () => {
    if (!config.google_client_id || !config.google_client_secret) {
      setError("Please enter Google OAuth Client ID and Client Secret first.");
      return;
    }
    setGaConnecting(true);
    setError("");
    try {
      const tokens = await invoke<GoogleTokens>("google_oauth_connect", {
        clientId: config.google_client_id,
        clientSecret: config.google_client_secret,
        scopes: "https://www.googleapis.com/auth/analytics.readonly",
      });
      onChange({ ...config, ga_tokens: tokens });
    } catch (e) {
      setError(`GA connection failed: ${e}`);
    }
    setGaConnecting(false);
  };

  const handleDisconnect = async (key: "gsc_tokens" | "ga_tokens", label: string) => {
    const confirmed = await ask(`Disconnect ${label}? You will need to re-authorize to reconnect.`, { title: "Disconnect", kind: "warning" });
    if (confirmed) {
      onChange({ ...config, [key]: null });
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-500 hover:text-red-300" aria-label="Dismiss error">&times;</button>
        </div>
      )}

      {/* ── PageSpeed Insights ── */}
      <section>
        <SectionHeader
          title="PageSpeed Insights"
          description="Analyze Core Web Vitals and performance scores. Only requires an API key (no OAuth)."
        />
        <div className="space-y-3">
          <PasswordInput
            label="API Key"
            value={config.psi_api_key}
            onChange={(v) => onChange({ ...config, psi_api_key: v })}
            placeholder="AIzaSy..."
          />
          <p className="text-xs text-gray-600">
            Get your API key at{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              console.cloud.google.com/apis/credentials
            </a>
            . Enable the "PageSpeed Insights API" in your project.
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Strategy</label>
            <select
              value={config.psi_strategy}
              onChange={(e) =>
                onChange({ ...config, psi_strategy: e.target.value as "mobile" | "desktop" })
              }
              className="bg-surface-0 border border-surface-3 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-accent"
            >
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>
          </div>
        </div>
      </section>

      {/* ── Google OAuth Credentials ── */}
      <section>
        <SectionHeader
          title="Google OAuth 2.0 Credentials"
          description="Required for Search Console and Analytics integrations."
        />
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Client ID</label>
            <input
              type="text"
              value={config.google_client_id}
              onChange={(e) => onChange({ ...config, google_client_id: e.target.value })}
              placeholder="123456789-abc.apps.googleusercontent.com"
              className="w-full bg-surface-0 border border-surface-3 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
            />
          </div>
          <PasswordInput
            label="Client Secret"
            value={config.google_client_secret}
            onChange={(v) => onChange({ ...config, google_client_secret: v })}
            placeholder="GOCSPX-..."
          />

          {/* Setup guide */}
          <details className="text-xs text-gray-500 cursor-pointer">
            <summary className="text-accent hover:underline">Setup Guide</summary>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-gray-500">
              <li>
                Go to{" "}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  Google Cloud Console → Credentials
                </a>
              </li>
              <li>Create a project (or select an existing one)</li>
              <li>Click "Create Credentials" → "OAuth client ID"</li>
              <li>Application type: <strong className="text-gray-400">Desktop app</strong></li>
              <li>Copy the Client ID and Client Secret above</li>
              <li>
                Go to{" "}
                <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  API Library
                </a>{" "}
                and enable:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li><strong className="text-gray-400">Google Search Console API</strong> (for GSC)</li>
                  <li><strong className="text-gray-400">Google Analytics Data API</strong> (for GA4)</li>
                </ul>
              </li>
              <li>Configure the OAuth consent screen (can be "External" in testing mode)</li>
            </ol>
          </details>
        </div>
      </section>

      {/* ── Google Search Console ── */}
      <section>
        <SectionHeader
          title="Google Search Console"
          description="Import search performance data (clicks, impressions, CTR, position) for crawled URLs."
        />
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StatusBadge connected={!!config.gsc_tokens} />
            <button
              onClick={handleGscConnect}
              disabled={gscConnecting}
              className="px-4 py-2 text-sm rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              {gscConnecting
                ? "Waiting for authorization..."
                : config.gsc_tokens
                  ? "Reconnect"
                  : "Connect Google Search Console"}
            </button>
            {config.gsc_tokens && (
              <button
                onClick={() => handleDisconnect("gsc_tokens", "Google Search Console")}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Disconnect
              </button>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Site URL</label>
            <input
              type="text"
              value={config.gsc_site_url}
              onChange={(e) => onChange({ ...config, gsc_site_url: e.target.value })}
              placeholder="https://example.com/ or sc-domain:example.com"
              className="w-full bg-surface-0 border border-surface-3 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-gray-600 mt-1">
              The site URL as it appears in Search Console (with trailing slash for URL prefix, or sc-domain: for domain properties).
            </p>
          </div>
        </div>
      </section>

      {/* ── Google Analytics ── */}
      <section>
        <SectionHeader
          title="Google Analytics 4"
          description="Import traffic data (sessions, users, pageviews, bounce rate) for crawled URLs."
        />
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StatusBadge connected={!!config.ga_tokens} />
            <button
              onClick={handleGaConnect}
              disabled={gaConnecting}
              className="px-4 py-2 text-sm rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              {gaConnecting
                ? "Waiting for authorization..."
                : config.ga_tokens
                  ? "Reconnect"
                  : "Connect Google Analytics"}
            </button>
            {config.ga_tokens && (
              <button
                onClick={() => handleDisconnect("ga_tokens", "Google Analytics")}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Disconnect
              </button>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">GA4 Property ID</label>
            <input
              type="text"
              value={config.ga_property_id}
              onChange={(e) => onChange({ ...config, ga_property_id: e.target.value })}
              placeholder="123456789"
              className="w-full bg-surface-0 border border-surface-3 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-gray-600 mt-1">
              Find your GA4 property ID in Admin → Property Settings. Just the numeric ID, not the "G-" tracking ID.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
