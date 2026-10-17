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
  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // Ignore double-clicks on buttons or interactive controls
    if (target.closest('button, input, select, textarea, a')) {
      return
    }
    window.api.toggleMaximize()
  }

  return (
    <header
      onDoubleClick={handleDoubleClick}
      className="h-11 bg-surface border-b border-border flex items-center justify-between px-3 pl-20 select-none drag-region"
    >
      {/* Left controls: Brand, Run, Stop, New Tab, Clear */}
      <div className="flex items-center space-x-2">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-2 mr-2 pr-3 border-r border-border/70">
          <svg className="w-5 h-5 rounded" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" rx="115" fill="#18181f"/>
            <rect x="6" y="6" width="500" height="500" rx="110" stroke="#2d2d3a" stroke-width="8"/>
            <rect x="115" y="95" width="280" height="310" rx="42" fill="#242430" stroke="#383849" stroke-width="8" transform="rotate(-6 256 250)"/>
            <rect x="128" y="105" width="280" height="310" rx="42" fill="#1e1e27" stroke="#4a4a5e" stroke-width="8" transform="rotate(3 268 260)"/>
            <rect x="116" y="122" width="280" height="310" rx="42" fill="#121216" stroke="#F7DF1E" stroke-width="12"/>
            <line x1="160" y1="188" x2="280" y2="188" stroke="#3b3b4d" stroke-width="12" stroke-linecap="round"/>
            <line x1="160" y1="226" x2="350" y2="226" stroke="#2c2c3b" stroke-width="12" stroke-linecap="round"/>
            <line x1="160" y1="264" x2="320" y2="264" stroke="#2c2c3b" stroke-width="12" stroke-linecap="round"/>
            <rect x="235" y="288" width="140" height="118" rx="28" fill="#F7DF1E"/>
            <text x="305" y="372" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="900" font-size="66" fill="#121216" text-anchor="middle" letter-spacing="-1">JS</text>
          </svg>
          <span className="font-semibold text-xs tracking-tight">
            <span className="text-text">Scratch</span>
            <span className="text-brand font-bold">JS</span>
          </span>
        </div>

        {isRunning ? (
          <button
            onClick={onStop}
            className="no-drag flex items-center space-x-1.5 px-3 py-1 bg-error/20 hover:bg-error/30 text-error rounded text-xs font-semibold transition"
            title="Stop Execution (Cmd+.)"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            onClick={onRun}
            className="no-drag flex items-center space-x-1.5 px-3 py-1 bg-primary/20 hover:bg-primary/30 text-primary rounded text-xs font-semibold transition"
            title="Run Code (Cmd+Enter / Ctrl+Enter)"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run</span>
          </button>
        )}

        <button
          onClick={onNewTab}
          className="no-drag flex items-center space-x-1 px-2 py-1 text-textMuted hover:text-text hover:bg-surfaceHover rounded text-xs transition"
          title="New Tab (Cmd+T)"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Tab</span>
        </button>

        <button
          onClick={onClearOutput}
          className="no-drag flex items-center space-x-1 px-2 py-1 text-textMuted hover:text-text hover:bg-surfaceHover rounded text-xs transition"
          title="Clear Output (Cmd+K)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear</span>
        </button>
      </div>

      {/* Center status: Execution status & timer */}
      <div className="flex items-center space-x-2 text-xs text-textMuted pointer-events-none">
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
          className="no-drag p-1.5 text-textMuted hover:text-text hover:bg-surfaceHover rounded transition"
          title="NPM Packages"
        >
          <Package className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSnippets}
          className="no-drag p-1.5 text-textMuted hover:text-text hover:bg-surfaceHover rounded transition"
          title="Snippets"
        >
          <Bookmark className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSettings}
          className="no-drag p-1.5 text-textMuted hover:text-text hover:bg-surfaceHover rounded transition"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
