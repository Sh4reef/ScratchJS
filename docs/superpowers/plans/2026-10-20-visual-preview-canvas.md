# Visual Preview & Canvas Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable ScratchJS to execute browser DOM and Canvas code (e.g. `document.createElement('canvas')`, rendering charts) in a hybrid DOM+Node environment and display visual output in a seamless preview pane.

**Architecture:** A single shared frameless child `BrowserWindow` is attached to the main Electron window and dynamically positioned over a designated Preview tile in the React output pane using `ResizeObserver` and `setBounds`. Transpiled/bundled code runs inside a reloaded `preview.html` context, with console outputs and probe comments forwarded via a dedicated preload script back to the Console output pane.

**Tech Stack:** Electron 33, React 18, TypeScript, esbuild, Tailwind CSS.

---

### Task 1: Build Configuration & Static Preview Template

**Files:**
- Create: `resources/preview.html`
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Create static preview template**

Create `resources/preview.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>ScratchJS Preview</title>
    <style>
      html, body {
        margin: 0;
        padding: 12px;
        background-color: #181825;
        color: #cdd6f4;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        overflow: auto;
        box-sizing: border-box;
      }
      canvas {
        display: block;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

- [ ] **Step 2: Update `electron.vite.config.ts` to build `preview` preload script**

Update `electron.vite.config.ts` so `preload` builds both `index` and `preview`:
```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['esbuild']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          preview: resolve('src/preload/preview.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
```

- [ ] **Step 3: Create stub `src/preload/preview.ts`**

Create `src/preload/preview.ts`:
```typescript
import { ipcRenderer } from 'electron'

// Initial stub for preview preload
console.log('[PreviewPreload] Initialized')
```

- [ ] **Step 4: Verify build generates both preload files**

Run: `npm run build`
Expected: `out/preload/index.mjs` and `out/preload/preview.mjs` are generated without errors.

- [ ] **Step 5: Commit**

```bash
git add resources/preview.html electron.vite.config.ts src/preload/preview.ts
git commit -m "feat(preview): add preview.html template and electron-vite preview preload entry"
```

---

### Task 2: Preview Preload Implementation (`src/preload/preview.ts`)

**Files:**
- Modify: `src/preload/preview.ts`

- [ ] **Step 1: Implement full console interception, probe capture, and module paths**

Replace `src/preload/preview.ts` with:
```typescript
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
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS with code 0.

- [ ] **Step 3: Commit**

```bash
git add src/preload/preview.ts
git commit -m "feat(preview): implement preview preload console and error interception"
```

---

### Task 3: Transpiler & Bundler Enhancement

**Files:**
- Modify: `src/main/runner/transpiler.ts`

- [ ] **Step 1: Update `transpileCode` to support ESM bundling when imports exist**

Edit `src/main/runner/transpiler.ts`:
```typescript
import * as esbuild from 'esbuild'

export interface TranspileResult {
  code: string
  error?: string
}

export interface TranspileOptions {
  isTypeScript?: boolean
  workingDirectory?: string
  centralModulesPath?: string
}

export function transformMagicComments(code: string): string {
  const lines = code.split('\n')
  return lines
    .map((line, idx) => {
      const lineNum = idx + 1
      const commentMatch = line.match(/^(\s*)(.*?)(?:\s*\/\/\?)(.*)$/)
      if (commentMatch) {
        const [, indent, expr] = commentMatch
        const trimmedExpr = expr.trim()
        if (trimmedExpr) {
          return `${indent}__runjs_probe__(${lineNum}, (${trimmedExpr}));`
        }
      }
      return line
    })
    .join('\n')
}

export async function transpileCode(
  code: string,
  options: TranspileOptions = {}
): Promise<TranspileResult> {
  const { isTypeScript = true, workingDirectory, centralModulesPath } = options
  try {
    const transformed = transformMagicComments(code)
    const hasImports = /^\s*import\s+/m.test(transformed)

    if (hasImports && (workingDirectory || centralModulesPath)) {
      const nodePaths: string[] = []
      if (workingDirectory) nodePaths.push(workingDirectory)
      if (centralModulesPath) nodePaths.push(centralModulesPath)

      const buildResult = await esbuild.build({
        stdin: {
          contents: transformed,
          resolveDir: workingDirectory || process.cwd(),
          loader: isTypeScript ? 'ts' : 'js'
        },
        bundle: true,
        write: false,
        platform: 'neutral',
        format: 'esm',
        target: 'es2022',
        nodePaths
      })

      return {
        code: buildResult.outputFiles[0].text
      }
    }

    const result = await esbuild.transform(transformed, {
      loader: isTypeScript ? 'ts' : 'js',
      target: 'es2022',
      format: 'esm'
    })

    return {
      code: result.code
    }
  } catch (err: any) {
    return {
      code: '',
      error: err?.message || String(err)
    }
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS with code 0.

- [ ] **Step 3: Commit**

```bash
git add src/main/runner/transpiler.ts
git commit -m "feat(transpiler): support bundling imports and probe comment transformations"
```

---

### Task 4: Main Process Preview Window Manager

**Files:**
- Create: `src/main/runner/preview-manager.ts`

- [ ] **Step 1: Implement `PreviewWindowManager`**

Create `src/main/runner/preview-manager.ts`:
```typescript
import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { transpileCode } from './transpiler'
import { LogEntry, ExecutionResult } from './executor'

export interface PreviewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PreviewExecuteOptions {
  tabId: string
  isTypeScript?: boolean
  workingDirectory?: string
  centralModulesPath?: string
  timeoutMs?: number
}

export class PreviewWindowManager {
  private parentWindow: BrowserWindow | null = null
  private previewWindow: BrowserWindow | null = null
  private activeTabId: string = ''
  private isLoaded: boolean = false
  private loadPromise: Promise<void> | null = null
  private resolveLoad: (() => void) | null = null

  public init(parent: BrowserWindow): void {
    this.parentWindow = parent
    this.createWindow()
  }

  private getPreviewHtmlPath(): string {
    const candidates = [
      join(app.getAppPath(), 'resources/preview.html'),
      join(process.cwd(), 'resources/preview.html'),
      join(__dirname, '../../resources/preview.html')
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return candidates[0]
  }

  private getPreloadPath(): string {
    return join(__dirname, '../preload/preview.mjs')
  }

  private createWindow(): void {
    if (this.previewWindow && !this.previewWindow.isDestroyed()) return
    if (!this.parentWindow || this.parentWindow.isDestroyed()) return

    this.previewWindow = new BrowserWindow({
      show: false,
      parent: this.parentWindow,
      frame: false,
      transparent: true,
      backgroundColor: '#181825',
      focusable: true,
      minimizable: false,
      maximizable: false,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
        preload: this.getPreloadPath()
      }
    })

    // Navigation guard
    this.previewWindow.webContents.on('will-navigate', (e) => e.preventDefault())
    this.previewWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    this.loadPreviewHtml()
  }

  private loadPreviewHtml(): void {
    if (!this.previewWindow || this.previewWindow.isDestroyed()) return
    this.isLoaded = false
    this.loadPromise = new Promise((resolve) => {
      this.resolveLoad = resolve
    })

    this.previewWindow.webContents.once('did-finish-load', () => {
      this.isLoaded = true
      if (this.resolveLoad) {
        this.resolveLoad()
        this.resolveLoad = null
      }
    })

    const htmlPath = this.getPreviewHtmlPath()
    this.previewWindow.loadFile(htmlPath, { search: `tabId=${this.activeTabId}` })
  }

  public setBounds(bounds: PreviewBounds): void {
    if (!this.previewWindow || this.previewWindow.isDestroyed()) return
    if (bounds.width <= 0 || bounds.height <= 0) {
      this.previewWindow.hide()
      return
    }
    this.previewWindow.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    })
  }

  public setVisible(visible: boolean): void {
    if (!this.previewWindow || this.previewWindow.isDestroyed()) return
    if (visible) {
      if (!this.previewWindow.isVisible()) {
        this.previewWindow.showInactive()
      }
    } else {
      if (this.previewWindow.isVisible()) {
        this.previewWindow.hide()
      }
    }
  }

  public stop(_tabId: string): boolean {
    if (!this.previewWindow || this.previewWindow.isDestroyed()) return false
    this.loadPreviewHtml()
    return true
  }

  public async execute(
    code: string,
    options: PreviewExecuteOptions,
    onLog?: (entry: LogEntry) => void
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    const { tabId, isTypeScript = true, workingDirectory, centralModulesPath } = options
    this.activeTabId = tabId

    // 1. Transpile/bundle code
    const transpileResult = await transpileCode(code, {
      isTypeScript,
      workingDirectory,
      centralModulesPath
    })

    if (transpileResult.error) {
      const errEntry: LogEntry = {
        type: 'error',
        args: [transpileResult.error],
        timestamp: Date.now()
      }
      onLog?.(errEntry)
      return {
        logs: [errEntry],
        durationMs: Date.now() - startTime,
        error: transpileResult.error
      }
    }

    // 2. Ensure preview window exists and reset clean state
    if (!this.previewWindow || this.previewWindow.isDestroyed()) {
      this.createWindow()
    }

    this.loadPreviewHtml()
    if (this.loadPromise) {
      await this.loadPromise
    }

    // 3. Collect logs during execution
    const logs: LogEntry[] = []

    try {
      if (this.previewWindow && !this.previewWindow.isDestroyed()) {
        await this.previewWindow.webContents.executeJavaScript(transpileResult.code)
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err)
      const errEntry: LogEntry = {
        type: 'error',
        args: [errMsg],
        timestamp: Date.now()
      }
      logs.push(errEntry)
      onLog?.(errEntry)
      return {
        logs,
        durationMs: Date.now() - startTime,
        error: errMsg
      }
    }

    return {
      logs,
      durationMs: Date.now() - startTime
    }
  }

  public destroy(): void {
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      this.previewWindow.destroy()
    }
    this.previewWindow = null
  }
}

export const previewManager = new PreviewWindowManager()
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS with code 0.

- [ ] **Step 3: Commit**

```bash
git add src/main/runner/preview-manager.ts
git commit -m "feat(preview): implement PreviewWindowManager for child window overlay and execution"
```

---

### Task 5: IPC Registration & Preload Bridge

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Expose preview controls in `src/preload/index.ts`**

Update `src/preload/index.ts` to add `setPreviewBounds`, `setPreviewVisible`, and `onRunnerLog` support for preview logs:
Add to `api` object:
```typescript
  // Preview Overlay
  setPreviewBounds: (bounds: { x: number; y: number; width: number; height: number }): void => {
    ipcRenderer.send('preview:set-bounds', bounds)
  },
  setPreviewVisible: (visible: boolean): void => {
    ipcRenderer.send('preview:set-visible', visible)
  },
```

- [ ] **Step 2: Update `src/preload/index.d.ts`**

Add typing definitions for `setPreviewBounds` and `setPreviewVisible` to `window.api`.

- [ ] **Step 3: Update `src/main/index.ts`**

Import `previewManager`:
```typescript
import { previewManager, PreviewBounds } from './runner/preview-manager'
```

In `createWindow()`, after `mainWindow` is created:
```typescript
previewManager.init(mainWindow)
```

In IPC handlers:
```typescript
ipcMain.on('preview:set-bounds', (_event, bounds: PreviewBounds) => {
  previewManager.setBounds(bounds)
})

ipcMain.on('preview:set-visible', (_event, visible: boolean) => {
  previewManager.setVisible(visible)
})

ipcMain.on(`preview:log:${options.tabId}`, ...)
```

Update `runner:execute` to run in `previewManager` by default:
```typescript
ipcMain.handle('runner:execute', async (event, code: string, options: ExecutionOptions) => {
  const fullOptions = {
    ...options,
    centralModulesPath: packageManager.getNodeModulesPath()
  }

  // Listen to preview logs and forward to renderer
  const channel = `preview:log:${options.tabId}`
  const logHandler = (_: any, entry: any) => {
    event.sender.send(`runner:log:${options.tabId}`, entry)
  }
  ipcMain.on(channel, logHandler)

  try {
    return await previewManager.execute(code, fullOptions, (entry) => {
      event.sender.send(`runner:log:${options.tabId}`, entry)
    })
  } finally {
    ipcMain.removeListener(channel, logHandler)
  }
})

ipcMain.handle('runner:stop', (_event, tabId: string) => {
  return previewManager.stop(tabId)
})
```

- [ ] **Step 4: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts src/main/index.ts
git commit -m "feat(preview): hook preview manager into IPC and default runner:execute"
```

---

### Task 6: Renderer UI & Overlay Synchronization

**Files:**
- Create: `src/renderer/src/hooks/usePreviewOverlay.ts`
- Modify: `src/renderer/src/components/OutputPane.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create `usePreviewOverlay` hook**

Create `src/renderer/src/hooks/usePreviewOverlay.ts`:
```typescript
import { useEffect, RefObject } from 'react'

export function usePreviewOverlay(
  containerRef: RefObject<HTMLElement>,
  isVisible: boolean,
  activeTabId: string
) {
  useEffect(() => {
    if (!isVisible || !containerRef.current) {
      window.api.setPreviewVisible(false)
      return
    }

    const updateBounds = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        window.api.setPreviewVisible(false)
        return
      }

      window.api.setPreviewBounds({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      })
      window.api.setPreviewVisible(true)
    }

    updateBounds()

    const resizeObserver = new ResizeObserver(() => {
      updateBounds()
    })
    resizeObserver.observe(containerRef.current)

    window.addEventListener('resize', updateBounds)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateBounds)
      window.api.setPreviewVisible(false)
    }
  }, [containerRef, isVisible, activeTabId])
}
```

- [ ] **Step 2: Update `OutputPane.tsx` with View Mode Switcher (`Console`, `Preview`, `Split`)**

Modify `src/renderer/src/components/OutputPane.tsx`:
- Add state `viewMode`: `'console' | 'preview' | 'split'`.
- Render segmented buttons in the header:
  - Terminal icon (`Console`)
  - Eye / Layout icon (`Preview`)
  - Columns icon (`Split`)
- Render `<div ref={previewRef} className="preview-tile flex-1 w-full h-full bg-[#181825]" />`.
- Connect `usePreviewOverlay(previewRef, viewMode === 'preview' || viewMode === 'split', activeTabId)`.

- [ ] **Step 3: Pass `activeTabId` to `OutputPane` in `App.tsx`**

Update `App.tsx` where `<OutputPane />` is rendered:
```tsx
<OutputPane logs={logs} onClear={clearLogs} activeTabId={activeTabId} />
```

- [ ] **Step 4: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/usePreviewOverlay.ts src/renderer/src/components/OutputPane.tsx src/renderer/src/App.tsx
git commit -m "feat(ui): add preview tile and Console/Preview/Split view mode switcher in OutputPane"
```

---

### Task 7: End-to-End Verification with the Canvas Snippet

**Files:**
- Test via Scratchpad verification

- [ ] **Step 1: Run typecheck and clean build**

Run: `npm run typecheck && npm run build`
Expected: Clean build without any errors.

- [ ] **Step 2: Verify the canvas snippet execution**

Snippet to test:
```javascript
const data = [12, 25, 8, 30, 18, 22];

const canvas = document.createElement('canvas');
canvas.width = 320;
canvas.height = 140;
document.body.append(canvas);

const ctx = canvas.getContext('2d');
ctx.fillStyle = '#8661eb';

data.forEach((v, i) => {
  ctx.beginPath();
  ctx.roundRect(
    i*50+4, 130-v*4,
    42, v*4, 4
  );
  ctx.fill();
});
console.log('Canvas rendered with', data.length, 'bars');
```
Expected:
1. `document.createElement('canvas')` executes without error.
2. The canvas bar chart renders visually inside the Preview pane.
3. `console.log` output appears in the Console Output pane.

- [ ] **Step 3: Commit final updates and documentation**

```bash
git commit --allow-empty -m "chore: verify canvas visual rendering and console streaming end-to-end"
```
