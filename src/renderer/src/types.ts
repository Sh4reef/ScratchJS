export interface LogEntry {
  type: 'log' | 'info' | 'warn' | 'error' | 'probe' | 'result'
  args: any[]
  line?: number
  timestamp: number
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

export interface Snippet {
  id: string
  name: string
  description: string
  code: string
}
