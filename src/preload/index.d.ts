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

export interface ElectronAPI {
  // Runner
  executeCode: (code: string, options: { tabId: string; isTypeScript?: boolean; workingDirectory?: string }) => Promise<ExecutionResult>
  stopCode: (tabId: string) => Promise<boolean>
  onRunnerLog: (tabId: string, callback: (entry: LogEntry) => void) => () => void

  // Tabs & Storage
  getTabs: () => Promise<TabData[]>
  saveTabs: (tabs: TabData[], activeTabId?: string) => Promise<boolean>
  getStoreData: () => Promise<{ activeTabId: string; tabs: TabData[]; preferences: UserPreferences }>
  getPreferences: () => Promise<UserPreferences>
  savePreferences: (prefs: Partial<UserPreferences>) => Promise<boolean>

  // Packages
  listPackages: () => Promise<PackageInfo[]>
  searchPackages: (query: string) => Promise<SearchResult[]>
  installPackage: (name: string, version?: string) => Promise<{ success: boolean; error?: string }>
  removePackage: (name: string) => Promise<{ success: boolean; error?: string }>
  getNodeModulesPath: () => Promise<string>

  // Menu Accelerators
  onMenuAction: (action: 'run-code' | 'stop-code' | 'new-tab' | 'close-tab' | 'clear-output', callback: () => void) => () => void

  // Window Management
  toggleMaximize: () => Promise<boolean>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
