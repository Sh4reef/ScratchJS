import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

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

export interface AppStoreData {
  activeTabId: string
  tabs: TabData[]
  preferences: UserPreferences
}

const DEFAULT_TABS: TabData[] = [
  {
    id: 'tab-1',
    title: 'Scratchpad 1',
    code: `// 👋 Welcome to RunJS Clone!
// Write TypeScript or JavaScript here and click "Run" (or press Cmd+Enter / Ctrl+Enter)

const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2); // ?

console.log("Doubled values:", doubled);

// Top-level await is fully supported:
const data = await Promise.resolve({ user: "Developer", ready: true });
console.log(data);
`,
    language: 'typescript',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
]

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'vs-dark',
  fontSize: 14,
  tabSize: 2,
  lineNumbers: true,
  wordWrap: true,
  autoFormatOnRun: false
}

export class AppStore {
  private filePath: string
  private data: AppStoreData

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = join(userDataPath, 'runjs-data.json')
    this.data = this.load()
  }

  private load(): AppStoreData {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        return {
          activeTabId: parsed.activeTabId || DEFAULT_TABS[0].id,
          tabs: Array.isArray(parsed.tabs) && parsed.tabs.length > 0 ? parsed.tabs : DEFAULT_TABS,
          preferences: { ...DEFAULT_PREFERENCES, ...(parsed.preferences || {}) }
        }
      }
    } catch (e) {
      console.error('Failed to read store file, using defaults:', e)
    }

    return {
      activeTabId: DEFAULT_TABS[0].id,
      tabs: DEFAULT_TABS,
      preferences: DEFAULT_PREFERENCES
    }
  }

  public save(newData?: Partial<AppStoreData>): void {
    if (newData) {
      this.data = { ...this.data, ...newData }
    }
    try {
      const dir = join(app.getPath('userData'))
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: !0 })
      }
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save store file:', e)
    }
  }

  public getData(): AppStoreData {
    return this.data
  }

  public getTabs(): TabData[] {
    return this.data.tabs
  }

  public setTabs(tabs: TabData[], activeTabId?: string): void {
    this.data.tabs = tabs
    if (activeTabId) {
      this.data.activeTabId = activeTabId
    }
    this.save()
  }

  public getPreferences(): UserPreferences {
    return this.data.preferences
  }

  public setPreferences(prefs: Partial<UserPreferences>): void {
    this.data.preferences = { ...this.data.preferences, ...prefs }
    this.save()
  }
}

export const store = new AppStore()
