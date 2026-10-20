import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions } from 'electron'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { store, TabData, UserPreferences } from './store'
import { ExecutionOptions } from './runner/executor'
import { previewManager, PreviewBounds } from './runner/preview-manager'
import { packageManager } from './packages/manager'
import { setupEnvironmentPath } from './path-utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Setup system environment PATH early for shell tools, node, and npm
setupEnvironmentPath()

app.name = 'ScratchJS'

// Ensure esbuild binary path and process cwd are valid in packaged mode
if (app && app.isPackaged) {
  const candidates = [
    join(process.resourcesPath, `app.asar.unpacked/node_modules/@esbuild/${process.platform}-${process.arch}/bin/esbuild`),
    join(process.resourcesPath, 'app.asar.unpacked/node_modules/esbuild/bin/esbuild')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      process.env.ESBUILD_BINARY_PATH = candidate
      break
    }
  }
}

if (process.cwd().includes('.asar')) {
  try {
    process.chdir(app.getPath('home'))
  } catch {}
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'ScratchJS',
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e2e',
    show: false,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  previewManager.init(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Development vs Production URL
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  buildMenu()
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'ScratchJS',
            submenu: [
              {
                label: 'About ScratchJS',
                click: () => app.showAboutPanel()
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const, label: 'Hide ScratchJS' },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const, label: 'Quit ScratchJS' }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow?.webContents.send('menu:new-tab')
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow?.webContents.send('menu:close-tab')
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const }
      ]
    },
    {
      label: 'Action',
      submenu: [
        {
          label: 'Run Code',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => mainWindow?.webContents.send('menu:run-code')
        },
        {
          label: 'Stop Execution',
          accelerator: 'CmdOrCtrl+.',
          click: () => mainWindow?.webContents.send('menu:stop-code')
        },
        { type: 'separator' as const },
        {
          label: 'Clear Output',
          accelerator: 'CmdOrCtrl+K',
          click: () => mainWindow?.webContents.send('menu:clear-output')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function registerIpcHandlers(): void {
  // Preview Overlay IPC
  ipcMain.on('preview:set-bounds', (_event, bounds: PreviewBounds) => {
    previewManager.setBounds(bounds)
  })

  ipcMain.on('preview:set-visible', (_event, visible: boolean) => {
    previewManager.setVisible(visible)
  })

  ipcMain.on('preview:get-module-paths', (event) => {
    event.returnValue = packageManager.getNodeModulesPaths()
  })

  // Runner IPC
  ipcMain.handle('runner:execute', async (event, code: string, options: ExecutionOptions) => {
    const fullOptions = {
      ...options,
      centralModulesPath: packageManager.getNodeModulesPath(),
      centralModulesPaths: packageManager.getNodeModulesPaths()
    }

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

  // Tabs & Preferences Store IPC
  ipcMain.handle('tabs:get', () => {
    return store.getTabs()
  })

  ipcMain.handle('tabs:save', (_event, tabs: TabData[], activeTabId?: string) => {
    store.setTabs(tabs, activeTabId)
    return true
  })

  ipcMain.handle('store:get-data', () => {
    return store.getData()
  })

  ipcMain.handle('prefs:get', () => {
    return store.getPreferences()
  })

  ipcMain.handle('prefs:save', (_event, prefs: Partial<UserPreferences>) => {
    store.setPreferences(prefs)
    return true
  })

  // Packages IPC
  ipcMain.handle('packages:list', () => {
    return packageManager.listInstalled()
  })

  ipcMain.handle('packages:search', (_event, query: string) => {
    return packageManager.search(query)
  })

  ipcMain.handle('packages:install', (_event, name: string, version?: string) => {
    return packageManager.install(name, version)
  })

  ipcMain.handle('packages:remove', (_event, name: string) => {
    return packageManager.remove(name)
  })

  ipcMain.handle('packages:getNodeModulesPath', () => {
    return packageManager.getNodeModulesPath()
  })

  // Window Management IPC
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    } else {
      win.maximize()
      return true
    }
  })
}

app.whenReady().then(() => {
  app.setName('ScratchJS')
  const iconPath = join(__dirname, '../../resources/icon.png')
  if (process.platform === 'darwin' && app.dock) {
    if (existsSync(iconPath)) {
      app.dock.setIcon(iconPath)
    }
  }

  app.setAboutPanelOptions({
    applicationName: 'ScratchJS',
    applicationVersion: '1.0.0',
    version: '1.0.0',
    copyright: 'Copyright © 2026 ScratchJS',
    credits: 'Instant scratchpads for JavaScript & TypeScript',
    iconPath: existsSync(iconPath) ? iconPath : undefined
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { previewManager }
