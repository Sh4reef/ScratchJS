import React from 'react'
import { Play, Square, Plus, Trash2, Package, Bookmark, Settings, Loader2 } from 'lucide-react'

interface HeaderProps {
  isRunning: boolean
  durationMs: number | null
  onRun: () => void
  onStop: () => void
  onNewTab: () => void
  onClearOutput: () => void
  onOpenPackages: () => void
  onOpenSnippets: () => void
  onOpenSettings: () => void
}

export const Header: React.FC<HeaderProps> = ({
  isRunning,
  durationMs,
  onRun,
  onStop,
  onNewTab,
  onClearOutput,
  onOpenPackages,
  onOpenSnippets,
  onOpenSettings
}) => {
  return (
    <header className="h-11 bg-surface border-b border-border flex items-center justify-between px-3 pl-20 select-none">
      {/* Left controls: Run / Stop / New Tab */}
      <div className="flex items-center space-x-2">
        {isRunning ? (
          <button
            onClick={onStop}
            className="flex items-center space-x-1.5 px-3 py-1 bg-error/20 hover:bg-error/30 text-error rounded text-xs font-semibold transition"
            title="Stop Execution (Cmd+.)"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            onClick={onRun}
            className="flex items-center space-x-1.5 px-3 py-1 bg-primary/20 hover:bg-primary/30 text-primary rounded text-xs font-semibold transition"
            title="Run Code (Cmd+Enter / Ctrl+Enter)"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run</span>
          </button>
        )}

        <button
          onClick={onNewTab}
          className="flex items-center space-x-1 px-2 py-1 text-textMuted hover:text-text hover:bg-surfaceHover rounded text-xs transition"
          title="New Tab (Cmd+T)"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Tab</span>
        </button>

        <button
          onClick={onClearOutput}
          className="flex items-center space-x-1 px-2 py-1 text-textMuted hover:text-text hover:bg-surfaceHover rounded text-xs transition"
          title="Clear Output (Cmd+K)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>

      {/* Center status: Execution status & timer */}
      <div className="flex items-center space-x-2 text-xs text-textMuted">
        {isRunning && (
          <div className="flex items-center space-x-1.5 text-accent animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Running…</span>
          </div>
        )}
        {!isRunning && durationMs !== null && (
          <span className="text-[11px] text-textMuted/70">Completed in {durationMs}ms</span>
        )}
      </div>

      {/* Right controls: Packages, Snippets, Settings */}
      <div className="flex items-center space-x-1">
        <button
          onClick={onOpenPackages}
          className="p-1.5 text-textMuted hover:text-text hover:bg-surfaceHover rounded transition"
          title="NPM Packages"
        >
          <Package className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSnippets}
          className="p-1.5 text-textMuted hover:text-text hover:bg-surfaceHover rounded transition"
          title="Snippets"
        >
          <Bookmark className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 text-textMuted hover:text-text hover:bg-surfaceHover rounded transition"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
