import { ipcRenderer } from 'electron'
import { createRequire } from 'module'

// Extract tabId from query/search params or global
const urlParams = new URLSearchParams(window.location.search)
const tabId = urlParams.get('tabId') || 'default'

// Setup Node require support for hybrid mode
try {
  const customRequire = createRequire(window.location.href)
  ;(globalThis as any).require = customRequire
} catch {}

function emitLog(type: 'log' | 'info' | 'warn' | 'error' | 'probe' | 'result', args: any[], line?: number) {
  try {
    // Clone args safely for IPC
    const serializedArgs = args.map((arg) => {
      if (typeof arg === 'function') return `[Function: ${arg.name || 'anonymous'}]`
      if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`
      if (typeof arg === 'symbol') return arg.toString()
      return arg
    })
    ipcRenderer.send(`preview:log:${tabId}`, {
      type,
      args: serializedArgs,
      line,
      timestamp: Date.now()
    })
  } catch {}
}

// Override standard console methods
const originalLog = console.log
const originalInfo = console.info
const originalWarn = console.warn
const originalError = console.error

console.log = (...args: any[]) => {
  originalLog.apply(console, args)
  emitLog('log', args)
}
console.info = (...args: any[]) => {
  originalInfo.apply(console, args)
  emitLog('info', args)
}
console.warn = (...args: any[]) => {
  originalWarn.apply(console, args)
  emitLog('warn', args)
}
console.error = (...args: any[]) => {
  originalError.apply(console, args)
  emitLog('error', args)
}

// Magic comment probe handler
;(globalThis as any).__runjs_probe__ = (line: number, value: any) => {
  emitLog('probe', [value], line)
}

// Global error handlers
window.onerror = (message, source, lineno, _colno, error) => {
  emitLog('error', [error ? error.stack || String(error) : `${message} at ${source}:${lineno}`], lineno)
  return false
}

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  emitLog('error', [reason instanceof Error ? reason.stack || reason.message : String(reason)])
})
