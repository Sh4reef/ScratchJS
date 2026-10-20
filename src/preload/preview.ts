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

function serializeArg(arg: any, depth = 0, seen = new WeakSet()): any {
  if (arg === null || arg === undefined) return arg
  if (typeof arg === 'function') return `[Function: ${arg.name || 'anonymous'}]`
  if (typeof arg === 'symbol') return arg.toString()
  if (typeof arg === 'bigint') return `${arg.toString()}n`
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`
  if (typeof arg !== 'object') return arg

  // DOM & Browser host objects
  if (typeof HTMLElement !== 'undefined' && arg instanceof HTMLElement) {
    const id = arg.id ? `#${arg.id}` : ''
    const cls = arg.className ? `.${arg.className.trim().split(/\s+/).join('.')}` : ''
    return `<${arg.tagName.toLowerCase()}${id}${cls}>`
  }
  if (typeof Node !== 'undefined' && arg instanceof Node) {
    return `[Node: ${arg.nodeName}]`
  }
  if (typeof Window !== 'undefined' && arg instanceof Window) {
    return '[Window]'
  }
  if (typeof Document !== 'undefined' && arg instanceof Document) {
    return '[Document]'
  }
  if (typeof Event !== 'undefined' && arg instanceof Event) {
    return `[Event: ${arg.type}]`
  }

  // Circular references & deep nesting guard
  if (seen.has(arg)) return '[Circular]'
  if (depth >= 3) return Array.isArray(arg) ? '[Array]' : '[Object]'
  seen.add(arg)

  try {
    if (Array.isArray(arg)) {
      return arg.map((item) => serializeArg(item, depth + 1, seen))
    }
    const copy: Record<string, any> = {}
    for (const [k, v] of Object.entries(arg)) {
      copy[k] = serializeArg(v, depth + 1, seen)
    }
    return copy
  } catch {
    return String(arg)
  }
}

function emitLog(type: 'log' | 'info' | 'warn' | 'error' | 'probe' | 'result', args: any[], line?: number) {
  try {
    const serializedArgs = args.map((arg) => serializeArg(arg))
    ipcRenderer.send(`preview:log:${tabId}`, {
      type,
      args: serializedArgs,
      line,
      timestamp: Date.now()
    })
  } catch {
    try {
      const fallbackArgs = args.map((a) => {
        try {
          return String(a)
        } catch {
          return '[Unserializable]'
        }
      })
      ipcRenderer.send(`preview:log:${tabId}`, {
        type,
        args: fallbackArgs,
        line,
        timestamp: Date.now()
      })
    } catch {}
  }
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
  let errorMsg: string
  if (reason instanceof Error) {
    errorMsg = reason.stack || reason.message
  } else if (typeof reason === 'object' && reason !== null) {
    try {
      errorMsg = JSON.stringify(reason)
    } catch {
      errorMsg = String(reason)
    }
  } else {
    errorMsg = String(reason)
  }
  emitLog('error', [errorMsg])
})

// Node uncaughtException handling in hybrid mode
if (typeof process !== 'undefined' && process.on) {
  process.on('uncaughtException', (err: any) => {
    emitLog('error', [err?.stack || String(err)])
  })
}
