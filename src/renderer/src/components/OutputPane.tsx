import React, { useState, useRef } from 'react'
import { Copy, Check, Terminal, AlertTriangle, AlertCircle, Sparkles, Eye, Columns } from 'lucide-react'
import { LogEntry } from '../types'
import { usePreviewOverlay } from '../hooks/usePreviewOverlay'

interface OutputPaneProps {
  logs: LogEntry[]
  onClear: () => void
  activeTabId?: string
  isModalOpen?: boolean
}

type ViewMode = 'console' | 'preview' | 'split'

function formatValue(val: any): string {
  if (typeof val === 'string') return val
  if (typeof val === 'undefined') return 'undefined'
  if (val === null) return 'null'
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2)
    } catch {
      return String(val)
    }
  }
  return String(val)
}

export const OutputPane: React.FC<OutputPaneProps> = ({ logs, onClear: _onClear, activeTabId, isModalOpen = false }) => {
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const previewRef = useRef<HTMLDivElement>(null)

  usePreviewOverlay(
    previewRef,
    (viewMode === 'preview' || viewMode === 'split') && !isModalOpen,
    activeTabId || 'default'
  )

  const handleCopyAll = () => {
    if (logs.length === 0) return
    const text = logs
      .map((log) => {
        const prefix = log.type === 'probe' ? `[L${log.line || '?'}] ` : ''
        return prefix + log.args.map(formatValue).join(' ')
      })
      .join('\n')

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-full h-full bg-[#181825] flex flex-col font-mono text-xs select-text overflow-hidden border-l border-border">
      {/* Output Header */}
      <div className="h-8 bg-surface/50 border-b border-border flex items-center justify-between px-2 select-none">
        {/* Segmented View Mode Buttons */}
        <div className="flex items-center space-x-1 bg-surface/80 p-0.5 rounded border border-border/70">
          <button
            onClick={() => setViewMode('console')}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium transition ${
              viewMode === 'console'
                ? 'bg-accent/20 text-accent font-semibold shadow-sm'
                : 'text-textMuted hover:text-text hover:bg-surfaceHover'
            }`}
            title="Console Output"
          >
            <Terminal className="w-3 h-3" />
            <span>Console</span>
          </button>

          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium transition ${
              viewMode === 'split'
                ? 'bg-accent/20 text-accent font-semibold shadow-sm'
                : 'text-textMuted hover:text-text hover:bg-surfaceHover'
            }`}
            title="Split (Preview & Console)"
          >
            <Columns className="w-3 h-3" />
            <span>Split</span>
          </button>

          <button
            onClick={() => setViewMode('preview')}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium transition ${
              viewMode === 'preview'
                ? 'bg-accent/20 text-accent font-semibold shadow-sm'
                : 'text-textMuted hover:text-text hover:bg-surfaceHover'
            }`}
            title="Preview Tile"
          >
            <Eye className="w-3 h-3" />
            <span>Preview</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={handleCopyAll}
            disabled={logs.length === 0}
            className="flex items-center space-x-1 px-2 py-0.5 text-textMuted hover:text-text hover:bg-surfaceHover rounded transition disabled:opacity-30"
            title="Copy Output to Clipboard"
          >
            {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
            <span className="text-[11px]">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Output Body */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {/* Preview Tile - kept mounted when viewMode is preview or split */}
        <div
          ref={previewRef}
          style={{ display: viewMode === 'console' ? 'none' : 'block' }}
          className={`w-full bg-[#181825] ${
            viewMode === 'preview'
              ? 'flex-1 h-full'
              : viewMode === 'split'
              ? 'h-1/2 border-b border-border shrink-0'
              : ''
          }`}
        />

        {/* Console Logs */}
        {viewMode !== 'preview' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-textMuted/40 select-none space-y-2">
                <Terminal className="w-8 h-8 stroke-[1.5]" />
                <p className="text-xs">Run code to see output here (Cmd+Enter)</p>
              </div>
            ) : (
              logs.map((log, index) => {
                if (log.type === 'probe') {
                  return (
                    <div
                      key={index}
                      className="flex items-start space-x-2 py-1 px-2 rounded bg-accent/10 border-l-2 border-accent text-accent"
                    >
                      <div className="flex items-center space-x-1 opacity-70 shrink-0">
                        <Sparkles className="w-3 h-3" />
                        <span className="font-semibold text-[10px]">Line {log.line}:</span>
                      </div>
                      <pre className="whitespace-pre-wrap break-all text-text">
                        {log.args.map(formatValue).join(' ')}
                      </pre>
                    </div>
                  )
                }

                if (log.type === 'error') {
                  return (
                    <div
                      key={index}
                      className="flex items-start space-x-2 py-1 px-2 rounded bg-error/10 border-l-2 border-error text-error"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <pre className="whitespace-pre-wrap break-all">{log.args.map(formatValue).join(' ')}</pre>
                    </div>
                  )
                }

                if (log.type === 'warn') {
                  return (
                    <div
                      key={index}
                      className="flex items-start space-x-2 py-1 px-2 rounded bg-warning/10 border-l-2 border-warning text-warning"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <pre className="whitespace-pre-wrap break-all">{log.args.map(formatValue).join(' ')}</pre>
                    </div>
                  )
                }

                return (
                  <div key={index} className="flex items-start space-x-2 py-0.5 text-text hover:bg-surface/30 px-1 rounded">
                    <span className="text-textMuted select-none opacity-40 shrink-0">&gt;</span>
                    <pre className="whitespace-pre-wrap break-all flex-1">{log.args.map(formatValue).join(' ')}</pre>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
