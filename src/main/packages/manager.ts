import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

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

export class PackageManager {
  private baseDir: string

  constructor() {
    const runjsDir = join(app.getPath('userData'), 'runjs-packages')
    const scratchDir = join(app.getPath('userData'), 'scratchjs-packages')
    this.baseDir = existsSync(scratchDir) ? scratchDir : existsSync(runjsDir) ? runjsDir : scratchDir
    this.ensureInitialized()
  }

  public getBaseDir(): string {
    return this.baseDir
  }

  public getNodeModulesPath(): string {
    return join(this.baseDir, 'node_modules')
  }

  private ensureInitialized(): void {
    try {
      if (!existsSync(this.baseDir)) {
        mkdirSync(this.baseDir, { recursive: true })
      }
      const pkgJsonPath = join(this.baseDir, 'package.json')
      if (!existsSync(pkgJsonPath)) {
        writeFileSync(
          pkgJsonPath,
          JSON.stringify(
            {
              name: 'scratchjs-user-packages',
              version: '1.0.0',
              description: 'ScratchJS User Installed NPM Packages',
              dependencies: {}
            },
            null,
            2
          ),
          'utf-8'
        )
      }
    } catch (e) {
      console.error('Failed to initialize runjs-packages directory:', e)
    }
  }

  public listInstalled(): PackageInfo[] {
    this.ensureInitialized()
    const pkgJsonPath = join(this.baseDir, 'package.json')
    try {
      if (existsSync(pkgJsonPath)) {
        const data = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
        const deps = data.dependencies || {}
        return Object.entries(deps).map(([name, version]) => ({
          name,
          version: String(version)
        }))
      }
    } catch (e) {
      console.error('Failed to list installed packages:', e)
    }
    return []
  }

  public async install(name: string, version?: string): Promise<{ success: boolean; error?: string }> {
    this.ensureInitialized()
    const pkgTarget = version ? `${name}@${version}` : name
    try {
      await execAsync(`npm install ${pkgTarget} --save-exact --legacy-peer-deps --package-lock=false`, {
        cwd: this.baseDir
      })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    }
  }

  public async remove(name: string): Promise<{ success: boolean; error?: string }> {
    this.ensureInitialized()
    try {
      await execAsync(`npm uninstall ${name}`, {
        cwd: this.baseDir
      })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    }
  }

  public async search(query: string): Promise<SearchResult[]> {
    if (!query || !query.trim()) return []
    try {
      const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=15`)
      if (!response.ok) {
        throw new Error(`NPM registry returned status ${response.status}`)
      }
      const data: any = await response.json()
      return (data.objects || []).map((item: any) => ({
        name: item.package.name,
        version: item.package.version,
        description: item.package.description || '',
        keywords: item.package.keywords || []
      }))
    } catch (err) {
      console.error('NPM registry search failed:', err)
      return []
    }
  }
}

export const packageManager = new PackageManager()
