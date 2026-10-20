import { contextBridge, ipcRenderer } from 'electron'

export interface LogEntry {
  type: 'log' | 'info' | 'warn' | 'error' | 'probe' | 'result'
  args: any[]
  line?: number
  timestamp: number
}

export interface ExecutionResult {
  logs: LogEntry[]
  durationMs: number
  error?: string
}

export interface TabData {
  id: string
  title: string
  code: string
  language: 'typescript' | 'javascript'
  createdAt: number
  updatedAt: number
}

export interface UserPreferences {
  theme: string
  fontSize: number
  tabSize: number
  lineNumbers: boolean
  wordWrap: boolean
  autoFormatOnRun: boolean
  workingDirectory?: string
}

export interface PackageInfo {
  name: string
  version: string
  description?: string
}

export interface SearchResult {
  name: string
  version: string
  description: string
  keywords?: string[]
}

const api = {
  // Runner
  executeCode: (code: string, options: { tabId: string; isTypeScript?: boolean; workingDirectory?: string }): Promise<ExecutionResult> => {
    return ipcRenderer.invoke('runner:execute', code, options)
  },
  stopCode: (tabId: string): Promise<boolean> => {
    return ipcRenderer.invoke('runner:stop', tabId)
  },
  onRunnerLog: (tabId: string, callback: (entry: LogEntry) => void) => {
    const channel = `runner:log:${tabId}`
    const handler = (_event: any, entry: LogEntry) => callback(entry)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // Tabs & Storage
  getTabs: (): Promise<TabData[]> => {
    return ipcRenderer.invoke('tabs:get')
  },
  saveTabs: (tabs: TabData[], activeTabId?: string): Promise<boolean> => {
    return ipcRenderer.invoke('tabs:save', tabs, activeTabId)
  },
  getStoreData: (): Promise<{ activeTabId: string; tabs: TabData[]; preferences: UserPreferences }> => {
    return ipcRenderer.invoke('store:get-data')
  },
  getPreferences: (): Promise<UserPreferences> => {
    return ipcRenderer.invoke('prefs:get')
  },
  savePreferences: (prefs: Partial<UserPreferences>): Promise<boolean> => {
    return ipcRenderer.invoke('prefs:save', prefs)
  },

  // Packages
  listPackages: (): Promise<PackageInfo[]> => {
    return ipcRenderer.invoke('packages:list')
  },
  searchPackages: (query: string): Promise<SearchResult[]> => {
    return ipcRenderer.invoke('packages:search', query)
  },
  installPackage: (name: string, version?: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('packages:install', name, version)
  },
  removePackage: (name: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('packages:remove', name)
  },
  getNodeModulesPath: (): Promise<string> => {
    return ipcRenderer.invoke('packages:getNodeModulesPath')
  },

  // Menu Accelerators
  onMenuAction: (action: 'run-code' | 'stop-code' | 'new-tab' | 'close-tab' | 'clear-output', callback: () => void) => {
    const channel = `menu:${action}`
    const handler = () => callback()
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // Window Management
  toggleMaximize: (): Promise<boolean> => {
    return ipcRenderer.invoke('window:toggle-maximize')
  },

  // Preview Overlay
  setPreviewBounds: (bounds: { x: number; y: number; width: number; height: number }): void => {
    ipcRenderer.send('preview:set-bounds', bounds)
  },
  setPreviewVisible: (visible: boolean): void => {
    ipcRenderer.send('preview:set-visible', visible)
  }
}

contextBridge.exposeInMainWorld('api', api)
