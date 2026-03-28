interface ToolbarProps {
  url: string;
  onUrlChange: (url: string) => void;
  onStart: () => void;
  onStop: () => void;
  isRunning: boolean;
  showIssues?: boolean;
  onToggleIssues?: () => void;
  showIntegrations?: boolean;
  onToggleIntegrations?: () => void;
  showVisualizations?: boolean;
  onToggleVisualizations?: () => void;
  onClear?: () => void;
  hasResults?: boolean;
  onOpenSettings?: () => void;
  onOpenListMode?: () => void;
}

export function Toolbar({
  url,
  onUrlChange,
  onStart,
  onStop,
  isRunning,
  showIssues,
  onToggleIssues,
  showIntegrations,
  onToggleIntegrations,
  showVisualizations,
  onToggleVisualizations,
  onClear,
  hasResults,
  onOpenSettings,
  onOpenListMode,
}: ToolbarProps) {
  return (
    <div className="bg-surface-1 border-b border-surface-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-accent font-bold text-lg shrink-0">
          <img src="/icon-64.png" alt="ScreamingCAT" className="w-7 h-7 rounded" draggable={false} />
          ScreamingCAT
        </div>

        <div className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !isRunning && onStart()
            }
            placeholder="Enter URL to crawl (e.g. example.com)"
            className="flex-1 bg-surface-0 border border-surface-3 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-accent transition-colors"
            disabled={isRunning}
          />

          {isRunning ? (
            <button
              onClick={onStop}
              className="bg-error hover:bg-red-600 text-white px-6 py-2 rounded-lg font-medium transition-colors shrink-0"
            >
              Stop
            </button>
          ) : (
            <>
              <button
                onClick={onStart}
                disabled={!url.trim()}
                className="bg-accent hover:bg-accent-hover text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                Start Crawl
              </button>
              {onOpenListMode && (
                <button
                  onClick={onOpenListMode}
                  className="bg-surface-2 border border-surface-3 hover:bg-surface-3 text-gray-300 hover:text-gray-100 px-4 py-2 rounded-lg font-medium text-sm transition-colors shrink-0"
                  title="Crawl a list of URLs"
                >
                  List
                </button>
              )}
            </>
          )}

          {/* Clear button */}
          {!isRunning && hasResults && onClear && (
            <button
              onClick={onClear}
              className="p-2 rounded-lg hover:bg-surface-2 transition-colors text-gray-400 hover:text-red-400"
              title="Clear results (Ctrl+Shift+Delete)"
              aria-label="Clear results"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}

          <div className="w-px h-6 bg-surface-3 mx-1" />

          {/* Visualizations toggle */}
          {onToggleVisualizations && (
            <button
              onClick={onToggleVisualizations}
              className={`p-2 rounded-lg transition-colors ${
                showVisualizations
                  ? "bg-purple-500/15 text-purple-400"
                  : "text-gray-400 hover:text-gray-200 hover:bg-surface-2"
              }`}
              title="Toggle Visualizations (Ctrl+Shift+V)"
              aria-label="Toggle Visualizations"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </button>
          )}

          {/* Integrations panel toggle */}
          {onToggleIntegrations && (
            <button
              onClick={onToggleIntegrations}
              className={`p-2 rounded-lg transition-colors ${
                showIntegrations
                  ? "bg-green-500/15 text-green-400"
                  : "text-gray-400 hover:text-gray-200 hover:bg-surface-2"
              }`}
              title="Toggle Integrations Panel (Ctrl+Shift+I)"
              aria-label="Toggle Integrations Panel"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </button>
          )}

          {/* Issues panel toggle */}
          {onToggleIssues && (
            <button
              onClick={onToggleIssues}
              className={`p-2 rounded-lg transition-colors ${
                showIssues
                  ? "bg-accent/15 text-accent"
                  : "text-gray-400 hover:text-gray-200 hover:bg-surface-2"
              }`}
              title="Toggle Issues Panel (Ctrl+Shift+P)"
              aria-label="Toggle Issues Panel"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg hover:bg-surface-2 transition-colors text-gray-400 hover:text-gray-200"
            title="Configuration (Ctrl+,)"
            aria-label="Configuration"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
