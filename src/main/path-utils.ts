import { exec } from 'child_process'
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app } from 'electron'

let isPathSetupDone = false
let isAsyncShellPathInProgress = false

function getCacheFilePath(): string | null {
  try {
    if (app && typeof app.getPath === 'function') {
      return join(app.getPath('userData'), 'env-path-cache.json')
    }
  } catch {
    // app.getPath might fail if called before app is ready
  }
  return null
}

/**
 * Returns candidate bin paths commonly used by node managers and package managers on Unix.
 */
function getUnixCandidatePaths(): string[] {
  const home = homedir()
  const candidates: string[] = []

  // 1. Homebrew (Apple Silicon & Intel)
  candidates.push('/opt/homebrew/bin', '/opt/homebrew/sbin')
  candidates.push('/usr/local/bin', '/usr/local/sbin')

  // 2. NVM (Node Version Manager)
  const nvmVersionsDir = join(home, '.nvm/versions/node')
  if (existsSync(nvmVersionsDir)) {
    try {
      const versions = readdirSync(nvmVersionsDir)
        .filter((dir) => {
          try {
            return statSync(join(nvmVersionsDir, dir)).isDirectory()
          } catch {
            return false
          }
        })
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

      for (const ver of versions) {
        candidates.push(join(nvmVersionsDir, ver, 'bin'))
      }
    } catch {
      // Ignore directory read errors
    }
  }

  // 3. FNM (Fast Node Manager)
  candidates.push(join(home, '.fnm/current/bin'))
  candidates.push(join(home, '.local/share/fnm/current/bin'))

  // 4. Volta, ASDF, Bun, Cargo, Local bin
  candidates.push(join(home, '.volta/bin'))
  candidates.push(join(home, '.asdf/shims'))
  candidates.push(join(home, '.asdf/bin'))
  candidates.push(join(home, '.bun/bin'))
  candidates.push(join(home, '.cargo/bin'))
  candidates.push(join(home, '.local/bin'))

  // 5. System fallbacks
  candidates.push('/usr/bin', '/bin', '/usr/sbin', '/sbin')

  return candidates
}

/**
 * Returns candidate bin paths on Windows.
 */
function getWindowsCandidatePaths(): string[] {
  const candidates: string[] = []
  const appData = process.env.APPDATA
  const localAppData = process.env.LOCALAPPDATA
  const programFiles = process.env.ProgramFiles
  const programFilesX86 = process.env['ProgramFiles(x86)']

  if (appData) candidates.push(join(appData, 'npm'))
  if (localAppData) {
    candidates.push(join(localAppData, 'Programs', 'fnm'))
    candidates.push(join(localAppData, 'nvm'))
  }
  if (programFiles) candidates.push(join(programFiles, 'nodejs'))
  if (programFilesX86) candidates.push(join(programFilesX86, 'nodejs'))

  return candidates
}

/**
 * Loads cached shell PATH from disk if available.
 */
function getCachedShellPath(): string | null {
  const cacheFile = getCacheFilePath()
  if (!cacheFile || !existsSync(cacheFile)) return null
  try {
    const data = JSON.parse(readFileSync(cacheFile, 'utf-8'))
    if (data && typeof data.path === 'string' && data.path.trim().length > 0) {
      return data.path.trim()
    }
  } catch {
    // Ignore invalid cache file
  }
  return null
}

/**
 * Saves resolved shell PATH to disk for instant loading on subsequent startups.
 */
function setCachedShellPath(resolvedPath: string): void {
  const cacheFile = getCacheFilePath()
  if (!cacheFile) return
  try {
    writeFileSync(cacheFile, JSON.stringify({ path: resolvedPath, updatedAt: Date.now() }), 'utf-8')
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Asynchronously retrieves PATH from the user's interactive login shell on Unix without blocking the main thread.
 */
export function refreshShellPathInBackground(): void {
  if (process.platform === 'win32' || isAsyncShellPathInProgress) return
  isAsyncShellPathInProgress = true

  const userShell = process.env.SHELL || '/bin/zsh'
  exec(
    `${userShell} -ilc "echo __SCRATCHJS_PATH_START__; echo \\$PATH; echo __SCRATCHJS_PATH_END__"`,
    {
      encoding: 'utf-8',
      timeout: 5000
    },
    (error, stdout) => {
      isAsyncShellPathInProgress = false
      if (error || !stdout) return

      const match = stdout.match(/__SCRATCHJS_PATH_START__\s*([\s\S]*?)\s*__SCRATCHJS_PATH_END__/)
      if (match && match[1]) {
        const shellPath = match[1].trim()
        setCachedShellPath(shellPath)

        // Merge newly discovered shell paths into process.env.PATH
        const delimiter = process.platform === 'win32' ? ';' : ':'
        const currentParts = (process.env.PATH || '').split(delimiter).filter(Boolean)
        const newParts = [...currentParts]

        for (const dir of shellPath.split(delimiter)) {
          const trimmed = dir.trim()
          if (trimmed && !newParts.includes(trimmed)) {
            newParts.push(trimmed)
          }
        }
        process.env.PATH = newParts.join(delimiter)
      }
    }
  )
}

/**
 * Ensures process.env.PATH is properly populated with the user's shell PATH
 * and standard node/npm installation directories.
 * This function runs in < 1ms by using cached paths and platform candidate directories.
 */
export function setupEnvironmentPath(): void {
  if (isPathSetupDone) return
  isPathSetupDone = true

  const delimiter = process.platform === 'win32' ? ';' : ':'
  const existingPath = process.env.PATH || ''
  const pathParts: string[] = []

  // Helper to add unique valid directory
  const addPath = (dir: string) => {
    if (!dir) return
    const trimmed = dir.trim()
    if (!trimmed) return
    if (!pathParts.includes(trimmed)) {
      pathParts.push(trimmed)
    }
  }

  // 1. Try to load cached shell PATH if available (instant disk read)
  const cachedPath = getCachedShellPath()
  if (cachedPath) {
    for (const p of cachedPath.split(delimiter)) {
      addPath(p)
    }
  }

  // 2. Include existing process.env.PATH entries
  for (const p of existingPath.split(delimiter)) {
    addPath(p)
  }

  // 3. Include platform candidate paths if they exist (< 1ms scan)
  const candidates = process.platform === 'win32' ? getWindowsCandidatePaths() : getUnixCandidatePaths()
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      addPath(candidate)
    }
  }

  process.env.PATH = pathParts.join(delimiter)

  // 4. Trigger non-blocking background refresh to keep cache and PATH up-to-date
  refreshShellPathInBackground()
}

/**
 * Finds the absolute path to the npm executable.
 */
export function findNpmExecutable(): string | null {
  setupEnvironmentPath()

  // 1. Explicit environment override
  if (process.env.NPM_PATH && existsSync(process.env.NPM_PATH)) {
    return process.env.NPM_PATH
  }

  const delimiter = process.platform === 'win32' ? ';' : ':'
  const pathDirs = (process.env.PATH || '').split(delimiter)
  const isWin = process.platform === 'win32'
  const binaryNames = isWin ? ['npm.cmd', 'npm.exe', 'npm'] : ['npm']

  // 2. Search all directories in PATH
  for (const dir of pathDirs) {
    if (!dir) continue
    for (const binName of binaryNames) {
      const candidate = join(dir, binName)
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return candidate
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  // 3. Fallback: Search candidate directories directly
  const candidates = isWin ? getWindowsCandidatePaths() : getUnixCandidatePaths()
  for (const dir of candidates) {
    for (const binName of binaryNames) {
      const candidate = join(dir, binName)
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return candidate
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return null
}

/**
 * Returns environment variables with the updated PATH for spawning child processes.
 */
export function getAugmentedEnv(): NodeJS.ProcessEnv {
  setupEnvironmentPath()
  return {
    ...process.env,
    PATH: process.env.PATH
  }
}
