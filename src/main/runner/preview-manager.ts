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
