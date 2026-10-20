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
  centralModulesPaths?: string[]
  timeoutMs?: number
}

export class PreviewWindowManager {
  private parentWindow: BrowserWindow | null = null
  private previewWindow: BrowserWindow | null = null
  private activeTabId: string = ''
  private lastRelativeBounds: PreviewBounds | null = null
  private isLoaded: boolean = false

  public init(parent: BrowserWindow): void {
    this.parentWindow = parent

    // Reposition child window when parent moves (especially on Windows & Linux)
    this.parentWindow.on('move', () => {
      if (this.lastRelativeBounds && this.previewWindow && !this.previewWindow.isDestroyed() && this.previewWindow.isVisible()) {
        this.setBounds(this.lastRelativeBounds)
      }
    })

    // Clean up when parent window is closed
    this.parentWindow.once('closed', () => {
      this.destroy()
    })

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

  private async loadPreviewHtml(): Promise<void> {
    if (!this.previewWindow || this.previewWindow.isDestroyed()) return
    const htmlPath = this.getPreviewHtmlPath()
    try {
      this.isLoaded = false
      await this.previewWindow.loadFile(htmlPath, { search: `tabId=${this.activeTabId}` })
      this.isLoaded = true
    } catch {
      // Ignore navigation cancellation if new load starts
    }
  }

  public setBounds(bounds: PreviewBounds): void {
    if (!this.previewWindow || this.previewWindow.isDestroyed()) return
    this.lastRelativeBounds = bounds

    if (bounds.width <= 0 || bounds.height <= 0) {
      this.previewWindow.hide()
      return
    }

    // Convert relative viewport coordinates to absolute screen coordinates
    const parentBounds = this.parentWindow && !this.parentWindow.isDestroyed()
      ? this.parentWindow.getContentBounds()
      : { x: 0, y: 0 }

    this.previewWindow.setBounds({
      x: Math.round(parentBounds.x + bounds.x),
      y: Math.round(parentBounds.y + bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    })
  }

  public setVisible(visible: boolean): void {
    if (!this.previewWindow || this.previewWindow.isDestroyed()) return
    if (visible) {
      if (!this.previewWindow.isVisible()) {
        if (this.lastRelativeBounds) {
          this.setBounds(this.lastRelativeBounds)
        }
        this.previewWindow.showInactive()
      }
    } else {
      if (this.previewWindow.isVisible()) {
        this.previewWindow.hide()
      }
    }
  }

  public stop(tabId: string): boolean {
    if (!this.previewWindow || this.previewWindow.isDestroyed()) return false
    if (tabId) {
      this.activeTabId = tabId
    }
    this.loadPreviewHtml()
    return true
  }

  public async execute(
    code: string,
    options: PreviewExecuteOptions,
    onLog?: (entry: LogEntry) => void
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    const { tabId, isTypeScript = true, workingDirectory, centralModulesPath, centralModulesPaths, timeoutMs = 15000 } = options
    this.activeTabId = tabId

    // 1. Transpile/bundle code
    const transpileResult = await transpileCode(code, {
      isTypeScript,
      workingDirectory,
      centralModulesPath,
      centralModulesPaths
    })

    if (transpileResult.error) {
      const errEntry: LogEntry = {
        type: 'error',
        args: [transpileResult.error],
        timestamp: Date.now()
      }
      onLog?.(errEntry)
      return {
        logs: [],
        durationMs: Date.now() - startTime,
        error: transpileResult.error
      }
    }

    // 2. Ensure preview window exists and reset clean state
    if (!this.previewWindow || this.previewWindow.isDestroyed()) {
      this.createWindow()
    } else {
      await this.loadPreviewHtml()
    }

    // 3. Execute with watchdog timeout
    try {
      if (this.previewWindow && !this.previewWindow.isDestroyed()) {
        let timeoutHandle: NodeJS.Timeout | null = null
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            this.stop(tabId)
            reject(new Error(`Execution timed out after ${timeoutMs / 1000}s`))
          }, timeoutMs)
        })

        const pathsToSync: string[] = []
        if (Array.isArray(centralModulesPaths)) {
          pathsToSync.push(...centralModulesPaths)
        } else if (centralModulesPath) {
          pathsToSync.push(centralModulesPath)
        }
        if (workingDirectory) {
          pathsToSync.push(join(workingDirectory, 'node_modules'))
          pathsToSync.push(workingDirectory)
        }

        if (pathsToSync.length > 0) {
          await this.previewWindow.webContents
            .executeJavaScript(
              `window.__scratchjs_set_module_paths && window.__scratchjs_set_module_paths(${JSON.stringify(pathsToSync)})`
            )
            .catch(() => {})
        }

        const execPromise = this.previewWindow.webContents.executeJavaScript(transpileResult.code)

        try {
          await Promise.race([execPromise, timeoutPromise])
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle)
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err)
      const errEntry: LogEntry = {
        type: 'error',
        args: [errMsg],
        timestamp: Date.now()
      }
      onLog?.(errEntry)
      return {
        logs: [],
        durationMs: Date.now() - startTime,
        error: errMsg
      }
    }

    return {
      logs: [],
      durationMs: Date.now() - startTime
    }
  }

  public destroy(): void {
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      this.previewWindow.destroy()
    }
    this.previewWindow = null
    this.parentWindow = null
    this.lastRelativeBounds = null
  }
}

export const previewManager = new PreviewWindowManager()
