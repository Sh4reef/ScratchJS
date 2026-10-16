# RunJS Clone Design Specification

**Date:** 2026-10-15  
**Topic:** Desktop JavaScript & TypeScript Playground (RunJS Clone)  
**Status:** Complete for Approval  

---

## 1. Intent & Why

Developers frequently need a zero-friction scratchpad to test snippets of JavaScript or TypeScript, experiment with library APIs (e.g. `lodash`, `date-fns`, `zod`, `axios`), debug algorithms, or prototype logic without creating a throwaway Vite/Node project on disk. 

The original RunJS application provided this experience, but restricted core capabilities (such as multiple tabs, NPM package installation, logpoints, and snippets) behind a paid commercial license. This project creates a free, open, and lightweight desktop replica that delivers immediate execution feedback, seamless multi-tab scratchpads, and integrated NPM package management.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Instant Scratchpad Experience**: Fast startup and lightweight footprint optimized for opening dozens of quick testing tabs.
- **Explicit Execution Control**: Code execution is triggered on demand via a "Run" button or keyboard shortcut (`Cmd+Enter` on macOS, `Ctrl+Enter` on Windows/Linux) to avoid noisy partial execution and background lag.
- **Node.js Primary Runtime**: Direct access to full Node.js APIs (`fs`, `path`, `crypto`, `http`, etc.), top-level `await`, and installed NPM modules.
- **RunJS-Identical NPM Experience**: Centralized package installation into user application storage so any installed NPM package can be imported/required immediately in any tab without per-tab `package.json` setup.
- **First-Class TypeScript & Modern JS**: On-the-fly transpilation using `esbuild` supporting TypeScript, JSX, TSX, top-level `await`, and modern ECMAScript features.
- **Interactive Output & Magic Comments**: Rich output panel capturing console logs, return values, errors with stack traces, and inline evaluation comments (`// ?` and `/* ? */`).
- **Session & Tab State Persistence**: Full automatic restoration of open tabs, draft snippet code, editor settings, and window states across application restarts.
- **Safety & Process Control**: Script execution runs in an isolated runner process with a responsive "Stop/Kill" button to terminate infinite loops or hung async promises.

### Non-Goals
- Full IDE capabilities: This is a playground and snippet runner, not a replacement for VS Code or a project-wide workspace editor (no git GUI, no multi-file project tree management).
- Browser / DOM runtime: Excluded from core scope to keep execution deterministic, fast, and focused on backend/algorithm testing.
- Cloud sync / mandatory accounts: All data (snippets, tabs, packages) resides locally on the user's machine with optional export to GitHub Gist.
- Commercial license gating: All features are completely open and unlocked.

### Anti-Goals
- Sluggish or heavy background processes: Having dozens of tabs open must not spawn dozens of idle Node processes; runner processes are pooled or launched on demand.
- Silent code execution while editing: No automatic background execution on every keystroke by default, preventing unexpected side effects (e.g., API requests or file mutations) during drafting.

---

## 3. System Architecture & Decisions

### 3.1 Tech Stack (Decided)
- **App Shell**: Electron (v33+) + TypeScript.
- **Build & Bundling Tool**: Vite (using `electron-vite`) for instant dev HMR and lean production builds.
- **Frontend / Renderer**: React 18/19 + Tailwind CSS + Lucide Icons.
- **Code Editor**: Monaco Editor configured for TypeScript/JavaScript syntax highlighting, bracket matching, and configurable keymaps.
- **Transpiler**: `esbuild` for ultra-fast in-memory transpilation of TS/TSX/JSX to executable JavaScript.
- **Runner Sandbox**: Child process / Worker with Node.js VM context executing transpiled code, capturing `console` output, timing, and inline expression results.

### 3.2 Process Boundary & IPC Design
1. **Main Process (`src/main/`)**:
   - Manages application lifecycle and main window.
   - Manages tab persistence and user configuration using `electron-store` (storing tab titles, code drafts, active tab ID).
   - Controls NPM package lifecycle (`npm install`, `.npmrc`, package search via npm registry API) inside `<userData>/runjs-packages/`.
2. **Preload Layer (`src/preload/`)**:
   - Secure IPC bridge via `contextBridge` exposing strictly typed APIs:
     - `runCode(code, options)`
     - `stopCode()`
     - `installPackage(name, version)`
     - `listPackages()`
     - `removePackage(name)`
     - `saveTabs(tabsState)` / `loadTabs()`
     - `loadPreferences()` / `savePreferences(prefs)`
3. **Renderer Process (`src/renderer/`)**:
   - **Tab Bar**: Add new tab, close tab, close others, close to right, editable tab titles.
   - **Editor Area**: Monaco Editor instance bound to the active tab's draft.
   - **Run Controls**: Header bar with "Run (Cmd+Enter)", "Stop", execution status indicator, and clear output.
   - **Output Pane**: Resizable split-pane (vertical/horizontal) showing formatted output, console streams, and expandable JSON/objects.
   - **In-App Dialogs**: Clean React modal overlays for NPM Package Manager, Snippets Library, Environment Variables, and Settings.
4. **Execution Engine (`src/main/runner/`)**:
   - Receives code payload and execution settings.
   - Transforms code using `esbuild` (handling top-level await and instrumenting magic comments `// ?` into probe calls).
   - Evaluates code in a stateless, fresh Node.js VM context per run to avoid variable collision and lingering listeners.
   - Streams formatted logs, return values, errors, and timing back to the renderer.

### 3.3 NPM Package Architecture
- Packages install into `<userData>/runjs-packages/node_modules`.
- The runner process configures `NODE_PATH` and `module.paths` to include this central `node_modules` directory.
- Any tab can immediately `import _ from 'lodash'` or `const axios = require('axios')`.
- If a user sets a custom Working Directory (`cwd`) on a tab, that folder's `node_modules` is prepended to the module resolution path.

---

## 4. Builder Decisions (Settled)

1. **Stateless Tab Execution**: Each click of "Run" executes the script from the top in a clean environment. This guarantees predictability, prevents `const` re-declaration errors, and cleans up timers.
2. **In-App React Modals**: Package management, Snippets, Environment variables, and Settings are built as fluid in-app React dialog overlays rather than separate Electron browser windows, making the app faster, single-window, and simpler to maintain.
3. **Monaco TypeScript Type Acquisition**: The Monaco editor connects to `<userData>/runjs-packages/node_modules/` to ingest installed `.d.ts` typings so third-party imports enjoy autocomplete and type hints.
4. **Project Structure**:
   ```
   rea-runjs/
   ├── src/
   │   ├── main/           # Electron main process (lifecycle, IPC handlers, store)
   │   │   ├── runner/     # Code transpilation (esbuild) & Node execution sandbox
   │   │   ├── packages/   # NPM install / search manager
   │   │   └── store.ts    # Tab & settings persistence
   │   ├── preload/        # Secure contextBridge API bindings
   │   └── renderer/       # React UI application
   │       ├── components/ # Tabs, Editor, OutputPane, Header, Modals
   │       ├── hooks/      # useTabs, useRunner, usePackages
   │       └── App.tsx
   ├── electron.vite.config.ts
   ├── package.json
   └── tsconfig.json
   ```
