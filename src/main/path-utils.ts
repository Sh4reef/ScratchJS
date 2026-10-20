import { execSync } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

let isPathSetupDone = false

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
 * Attempts to retrieve PATH from the user's interactive login shell on Unix.
 */
function getShellPath(): string | null {
  if (process.platform === 'win32') return null

  const userShell = process.env.SHELL || '/bin/zsh'
  try {
    const rawOutput = execSync(
      `${userShell} -ilc "echo __SCRATCHJS_PATH_START__; echo \\$PATH; echo __SCRATCHJS_PATH_END__"`,
      {
        encoding: 'utf-8',
        timeout: 2500,
        stdio: ['ignore', 'pipe', 'ignore']
      }
    )

    const match = rawOutput.match(/__SCRATCHJS_PATH_START__\s*([\s\S]*?)\s*__SCRATCHJS_PATH_END__/)
    if (match && match[1]) {
      return match[1].trim()
    }
  } catch {
    // Shell execution timed out or failed; will fallback to scanning candidate paths
  }

  return null
}

/**
 * Ensures process.env.PATH is properly populated with the user's shell PATH
 * and standard node/npm installation directories.
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

  // 1. Try to extract shell PATH on Unix
  const shellPath = getShellPath()
  if (shellPath) {
    for (const p of shellPath.split(delimiter)) {
      addPath(p)
    }
  }

  // 2. Include existing process.env.PATH entries
  for (const p of existingPath.split(delimiter)) {
    addPath(p)
  }

  // 3. Include platform candidate paths if they exist
  const candidates = process.platform === 'win32' ? getWindowsCandidatePaths() : getUnixCandidatePaths()
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      addPath(candidate)
    }
  }

  process.env.PATH = pathParts.join(delimiter)
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
