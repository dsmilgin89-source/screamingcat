import { useEffect } from "react";

export interface KeyboardShortcutDeps {
  isRunning: boolean;
  url: string;
  showSettings: boolean;
  selectedResult: unknown | null;
  resultsLength: number;
  handleStart: () => void;
  stopCrawl: () => void;
  handleSaveProject: () => void;
  handleLoadProject: () => void;
  handleExportCsv: () => void;
  handleExportXlsx: () => void;
  handleClear: () => void;
  onCloseSettings: () => void;
  onToggleSettings: () => void;
  onCloseSelectedResult: () => void;
  onToggleIssues: () => void;
  onToggleIntegrations: () => void;
  onToggleVisualizations: () => void;
}

export function useKeyboardShortcuts(deps: KeyboardShortcutDeps) {
  const {
    isRunning,
    url,
    showSettings,
    selectedResult,
    resultsLength,
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
  } = deps;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Don't intercept when typing in input fields (except for global shortcuts)
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

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
        if (showSettings) {
          onCloseSettings();
          return;
        }
        if (selectedResult) {
          onCloseSelectedResult();
          return;
        }
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
        onToggleSettings();
        return;
      }

      // Skip view toggles if in input
      if (isInput) return;

      // Ctrl+Shift+P — Issues panel
      if ((e.key === "P" || e.key === "p") && shift) {
        e.preventDefault();
        onToggleIssues();
        return;
      }
      // Ctrl+Shift+I — Integrations panel
      if ((e.key === "I" || e.key === "i") && shift) {
        e.preventDefault();
        onToggleIntegrations();
        return;
      }
      // Ctrl+Shift+V — Visualizations
      if ((e.key === "V" || e.key === "v") && shift) {
        e.preventDefault();
        onToggleVisualizations();
        return;
      }
      // Ctrl+Shift+Delete — Clear results
      if (e.key === "Delete" && shift) {
        e.preventDefault();
        if (!isRunning && resultsLength > 0) handleClear();
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    isRunning,
    url,
    showSettings,
    selectedResult,
    resultsLength,
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
  ]);
}
