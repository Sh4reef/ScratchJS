import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { store, TabData, UserPreferences } from './store'
import { executor, ExecutionOptions } from './runner/executor'
import { packageManager } from './packages/manager'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e2e',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

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
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
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
  // Runner IPC
  ipcMain.handle('runner:execute', async (event, code: string, options: ExecutionOptions) => {
    const fullOptions: ExecutionOptions = {
      ...options,
      centralModulesPath: packageManager.getNodeModulesPath()
    }

    return executor.execute(code, fullOptions, (entry) => {
      event.sender.send(`runner:log:${options.tabId}`, entry)
    })
  })

  ipcMain.handle('runner:stop', (_event, tabId: string) => {
    return executor.stop(tabId)
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
}

app.whenReady().then(() => {
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
