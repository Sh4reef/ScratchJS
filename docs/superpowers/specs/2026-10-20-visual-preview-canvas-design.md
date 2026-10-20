# Design Specification: Visual Preview & Canvas Support (Option A)

**Date**: 2026-10-20  
**Status**: Approved / Ready for Planning  
**Target Project**: ScratchJS (`rea-runjs`)

---

## 1. Intent & Context

ScratchJS currently executes JavaScript and TypeScript snippets strictly in an isolated Node.js child process (`src/main/runner/executor.ts`). In this environment, any browser-specific APIs like `document.createElement('canvas')`, `document.body.append()`, `window`, or DOM rendering fail with `ReferenceError: document is not defined`.

The goal of this update is to introduce visual DOM and Canvas rendering inspired by RunJS's architecture. ScratchJS will run all tabs in a **hybrid DOM + Node.js environment by default**. Users can run code that interacts with Node.js APIs (`fs`, `path`, `process`) alongside Browser APIs (`document`, `window`, `<canvas>`, WebGL, `fetch`), with visual elements rendered in a dedicated Preview pane and console logs streamed to the Console pane.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Run DOM & Canvas Code by Default**: Out-of-the-box support for browser DOM APIs (`document.createElement('canvas')`, `document.body.append()`, `ctx.roundRect()`, `requestAnimationFrame`) without requiring special setup.
- **Hybrid Node + DOM Access**: Support simultaneous access to Node.js built-ins (`fs`, `path`) and DOM globals (`document`, `window`).
- **NPM Package Bundling**: Automatically bundle third-party npm package imports (e.g. `d3`, `chart.js`, `canvas-confetti`) from ScratchJS's package directory using `esbuild`.
- **Visual Display & View Options**: Render DOM output in a smooth Preview pane with options to view `[Console]`, `[Preview]`, or `[Split]`.
- **Log & Error Synchronization**: Route `console.log`, `console.info`, `console.warn`, `console.error`, and magic comment probes (`//?`) from the preview environment back to the Console Output pane.
- **Clean Slate on Each Run**: Reload the preview document before execution to ensure previous DOM elements, canvases, and timers do not leak or accumulate.

### Non-Goals
- Full multi-page browser navigation (navigation away from `preview.html` is guarded and blocked).
- Heavy multi-window GPU footprint (only 1 shared preview window is maintained).

### Anti-Goals
- Regressing pure console output or magic comment probe functionality.
- Leaking child windows or listeners on tab switch or window close.

---

## 3. Architecture & Mechanics (Option A: Electron Window Overlay)

```
┌─────────────────────────────────────────────────────────────┐
│ ScratchJS Main Window                                       │
│                                                             │
│ ┌───────────────────────┐ ┌───────────────────────────────┐ │
│ │ Monaco Editor         │ │ Right Panel (Output Area)     │ │
│ │                       │ │ ┌─────────┬─────────┬───────┐ │ │
│ │ const canvas =        │ │ │ Console │ Preview │ Split │ │ │
│ │   document.create...  │ │ ├─────────┴─────────┴───────┤ │ │
│ │                       │ │ │ [Shared Child Window]     │ │ │
│ │                       │ │ │ <canvas width="320"...>   │ │ │
│ │                       │ │ │                           │ │ │
│ └───────────────────────┘ └─┴───────────────────────────┴─┘ │
└─────────────────────────────────────────────────────────────┘
                                  │
                   IPC (Bounds, Visibility, Logs)
                                  ▼
                PreviewWindowManager (Electron Main)
```

### 3.1. Main Process: Preview Window Manager (`src/main/runner/preview-manager.ts`)
- **Single Shared Child Window**:
  - Attached to `mainWindow` (`parent: mainWindow`, `frame: false`, `transparent: true`, `backgroundColor: '#1e1e2e'`).
  - Configured with `skipTaskbar: true`, `hasShadow: false`, `hiddenInMissionControl: true`.
  - `webPreferences`:
    - `nodeIntegration: true` (Hybrid DOM + Node environment)
    - `contextIsolation: false`
    - `sandbox: false`
    - `preload: preview-preload.js`
- **Navigation Guard**:
  - Intercepts `will-navigate` and `setWindowOpenHandler` on `webContents` to prevent navigation away from `preview.html`.
- **IPC Interface**:
  - `preview:set-bounds`: Updates window bounds (`childWin.setBounds(bounds)`).
  - `preview:set-visible`: Toggles visibility (`showInactive()` / `hide()`).
  - `preview:execute`: Reloads `preview.html`, loads environment variables / path context, and executes the transpiled/bundled code via `webContents.executeJavaScript(code)`.
  - `preview:stop`: Stops ongoing scripts or reloads the preview window.

### 3.2. Static Preview Template (`src/renderer/preview.html` or `resources/preview.html`)
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

### 3.3. Preload Script (`src/preload/preview-preload.ts`)
- Intercepts console methods (`log`, `info`, `warn`, `error`, `table`, `time`, `timeEnd`, `count`).
- Defines magic comment handler `globalThis.__runjs_probe__ = (line, val) => ...` to format and emit probe entries.
- Hooks `window.onerror` and `window.addEventListener('unhandledrejection')` to forward runtime exceptions.
- Dispatches batched log events to the host window via `ipcRenderer.send('preview:log', { tabId, entries })`.
- Configures module search paths so `require()` and node built-ins resolve correctly from the tab's working directory and central packages directory.

### 3.4. Transpilation & Bundling Pipeline
1. Check if user code contains ESM `import` statements.
2. If imports are present, bundle with `esbuild.build` using `bundle: true`, targeting Node/browser with `node_modules` search path directed at `~/.scratchjs/packages/node_modules`.
3. If no imports are present, use fast `esbuild.transform` with TypeScript/JSX support and probe instrumentation.
4. Send bundled code to `PreviewWindowManager.execute(tabId, code)`.

### 3.5. Renderer UI Integration
- **Output Area (`OutputPane.tsx`)**:
  - Top header toolbar includes view mode switcher:
    - `Console` (full console log list)
    - `Preview` (visual DOM only)
    - `Split` (side-by-side or stacked Console + Preview)
- **Preview Tile Container (`<div ref={previewRef} className="preview-tile">`)**:
  - Houses the visual target area.
  - Sized flexibly using Tailwind / flexbox.
- **Bounds Synchronizer Hook (`usePreviewOverlay`)**:
  - Uses `ResizeObserver` on `previewRef` and monitors active tab switches / window moves.
  - Computes client rect relative to the Electron window and sends `preview:set-bounds` IPC.
  - Hides the preview window when the user selects pure `Console` mode or minimizes the pane.

---

## 4. Summary of Builder Calls
1. **Hybrid Execution Default**: Every tab defaults to the hybrid DOM + Node environment, eliminating configuration friction for canvas, DOM, and Node scripts.
2. **Single Shared Child Window**: Keeps resource usage low (~50MB RAM instead of scaling with open tabs) by re-targeting the single preview window to whichever tab is active.
3. **Automated NPM Bundling**: Handles both CommonJS and modern ESM packages transparently via esbuild.
