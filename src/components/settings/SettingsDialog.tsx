import { useState } from "react";
import type { CrawlConfig, StorageConfig } from "@/types/crawl";
import type { IntegrationConfig } from "@/types/integrations";
import { SpiderTab } from "./SpiderTab";
import { LimitsTab } from "./LimitsTab";
import { SpeedTab } from "./SpeedTab";
import { UserAgentTab } from "./UserAgentTab";
import { RobotsTab } from "./RobotsTab";
import { UrlFiltersTab } from "./UrlFiltersTab";
import { ExtractionTab } from "./ExtractionTab";
import { AdvancedTab } from "./AdvancedTab";
import { RenderingTab } from "./RenderingTab";
import { CustomSearchTab } from "./CustomSearchTab";
import { CustomExtractionTab } from "./CustomExtractionTab";
import { CustomHeadersTab } from "./CustomHeadersTab";
import { AuthenticationTab } from "./AuthenticationTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { StorageTab } from "./StorageTab";

interface SettingsDialogProps {
  config: CrawlConfig;
  onChange: (config: CrawlConfig) => void;
  integrationConfig: IntegrationConfig;
  onIntegrationChange: (config: IntegrationConfig) => void;
  storageConfig: StorageConfig;
  onStorageChange: (config: StorageConfig) => void;
  onClose: () => void;
  isRunning: boolean;
}

const TABS = [
  { id: "spider", label: "Spider", icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" },
  { id: "rendering", label: "Rendering", icon: "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" },
  { id: "limits", label: "Limits", icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 11h10v2H7z" },
  { id: "speed", label: "Speed", icon: "M20.38 8.57l-1.23 1.85a8 8 0 01-.22 7.58H5.07A8 8 0 0115.58 6.85l1.85-1.23A10 10 0 003.35 19a2 2 0 001.72 1h13.85a2 2 0 001.74-1 10 10 0 00-.27-10.44zm-9.79 6.84a2 2 0 002.83 0l5.66-8.49-8.49 5.66a2 2 0 000 2.83z" },
  { id: "useragent", label: "User-Agent", icon: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" },
  { id: "robots", label: "Robots", icon: "M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z" },
  { id: "authentication", label: "Authentication", icon: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" },
  { id: "filters", label: "Include / Exclude", icon: "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" },
  { id: "extraction", label: "Extraction", icon: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" },
  { id: "advanced", label: "Advanced", icon: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" },
  { id: "custom_headers", label: "HTTP Headers", icon: "M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" },
  { id: "custom_search", label: "Custom Search", icon: "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" },
  { id: "custom_extraction", label: "Custom Extraction", icon: "M7 14l5-5 5 5H7zM5 4h14v2H5V4zm0 14h14v2H5v-2z" },
  { id: "storage", label: "Storage", icon: "M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z" },
  { id: "integrations", label: "Integrations", icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c.15 1.58-.67 2.93-1.89 3.63.55.41.95 1.02 1.13 1.73l.38 1.52c.15.6-.34 1.14-.96 1.01l-1.7-.36a2.93 2.93 0 00-2.18.35l-1.52.87c-.53.3-1.19-.11-1.1-.7l.22-1.72a2.93 2.93 0 00-.55-2.12l-1.05-1.38c-.37-.48-.06-1.18.52-1.17l1.74.02c.72.01 1.4-.32 1.87-.88l1.05-1.27c.38-.46 1.1-.33 1.3.21l.57 1.63c.25.7.8 1.26 1.5 1.5l1.63.57c.54.2.67.92.21 1.3l-1.27 1.05c-.09.08-.18.15-.27.23" },
] as const;

const TAB_GROUPS = [
  { label: "Crawl", ids: ["spider", "rendering", "limits", "speed", "useragent", "robots", "authentication"] },
  { label: "Analysis", ids: ["filters", "extraction", "custom_headers", "custom_search", "custom_extraction", "advanced"] },
  { label: "Storage & Integrations", ids: ["storage", "integrations"] },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsDialog({
  config,
  onChange,
  integrationConfig,
  onIntegrationChange,
  storageConfig,
  onStorageChange,
  onClose,
  isRunning,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>("spider");

  const renderTab = () => {
    switch (activeTab) {
      case "spider":
        return (
          <SpiderTab
            resources={config.resources}
            pageLinks={config.page_links}
            onResourcesChange={(v) => onChange({ ...config, resources: v })}
            onPageLinksChange={(v) => onChange({ ...config, page_links: v })}
          />
        );
      case "rendering":
        return (
          <RenderingTab
            config={config.rendering}
            onChange={(v) => onChange({ ...config, rendering: v })}
          />
        );
      case "limits":
        return (
          <LimitsTab
            limits={config.limits}
            onChange={(v) => onChange({ ...config, limits: v })}
          />
        );
      case "speed":
        return (
          <SpeedTab
            speed={config.speed}
            onChange={(v) => onChange({ ...config, speed: v })}
          />
        );
      case "useragent":
        return (
          <UserAgentTab
            config={config.user_agent}
            onChange={(v) => onChange({ ...config, user_agent: v })}
          />
        );
      case "robots":
        return (
          <RobotsTab
            config={config.robots}
            onChange={(v) => onChange({ ...config, robots: v })}
          />
        );
      case "authentication":
        return (
          <AuthenticationTab
            config={config.auth}
            onChange={(v) => onChange({ ...config, auth: v })}
          />
        );
      case "filters":
        return (
          <UrlFiltersTab
            config={config.url_filters}
            onChange={(v) => onChange({ ...config, url_filters: v })}
          />
        );
      case "extraction":
        return (
          <ExtractionTab
            config={config.extraction}
            onChange={(v) => onChange({ ...config, extraction: v })}
          />
        );
      case "advanced":
        return (
          <AdvancedTab
            config={config.advanced}
            onChange={(v) => onChange({ ...config, advanced: v })}
          />
        );
      case "custom_headers":
        return (
          <CustomHeadersTab
            headers={config.custom_headers}
            onChange={(v) => onChange({ ...config, custom_headers: v })}
          />
        );
      case "custom_search":
        return (
          <CustomSearchTab
            config={config.custom_search}
            onChange={(v) => onChange({ ...config, custom_search: v })}
          />
        );
      case "custom_extraction":
        return (
          <CustomExtractionTab
            config={config.custom_extraction}
            onChange={(v) => onChange({ ...config, custom_extraction: v })}
          />
        );
      case "storage":
        return (
          <StorageTab
            config={storageConfig}
            onChange={onStorageChange}
          />
        );
      case "integrations":
        return (
          <IntegrationsTab
            config={integrationConfig}
            onChange={onIntegrationChange}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-surface-1 border border-surface-3 rounded-xl shadow-2xl w-[900px] h-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-3 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">
              Configuration
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Customize crawler behavior, speed, and extraction settings
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar tabs */}
          <nav className="w-52 border-r border-surface-3 py-2 overflow-y-auto shrink-0">
            {TAB_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-[10px] uppercase text-gray-500 px-3 py-1 mt-2 font-semibold tracking-wider">
                  {group.label}
                </div>
                {TABS.filter((tab) => (group.ids as readonly string[]).includes(tab.id)).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left ${
                      activeTab === tab.id
                        ? "bg-accent/10 text-accent border-r-2 border-accent"
                        : "text-gray-400 hover:text-gray-200 hover:bg-surface-2"
                    }`}
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d={tab.icon} />
                    </svg>
                    {tab.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">{renderTab()}</div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-surface-3 shrink-0">
          {isRunning && (
            <p className="text-xs text-warning">
              Settings changes will apply to the next crawl
            </p>
          )}
          <div className="flex-1" />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-surface-2 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
