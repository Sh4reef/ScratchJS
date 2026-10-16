import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, statSync } from 'fs'
import os from 'os'
import { transpileCode } from './transpiler'

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

export interface ExecutionOptions {
  tabId: string
  isTypeScript?: boolean
  workingDirectory?: string
  centralModulesPath?: string
  timeoutMs?: number
}

export class CodeExecutor {
  private activeProcesses = new Map<string, ChildProcess>()

  public stop(tabId: string): boolean {
    const proc = this.activeProcesses.get(tabId)
    if (proc && !proc.killed) {
      proc.kill('SIGKILL')
      this.activeProcesses.delete(tabId)
      return true
    }
    return false
  }

  public async execute(
    code: string,
    options: ExecutionOptions,
    onLog?: (entry: LogEntry) => void
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    const { tabId, isTypeScript = true, workingDirectory, centralModulesPath, timeoutMs = 15000 } = options

    // Stop any existing execution on this tab
    this.stop(tabId)

    // 1. Transpile code
    const transpileResult = await transpileCode(code, isTypeScript)
    if (transpileResult.error) {
      return {
        logs: [
          {
            type: 'error',
            args: [transpileResult.error],
            timestamp: Date.now()
          }
        ],
        durationMs: Date.now() - startTime,
        error: transpileResult.error
      }
    }

    // 2. Prepare execution runner payload
    const runnerScript = `
import * as __runjs_module__ from 'node:module';
globalThis.require = __runjs_module__.createRequire(import.meta.url);

// Send structured message back to host
function emitMessage(type, args, line) {
  process.stdout.write('__RUNJS_OUTPUT__:' + JSON.stringify({ type, args, line, timestamp: Date.now() }) + '\\n');
}

// Global magic comment probe handler
globalThis.__runjs_probe__ = function(line, value) {
  emitMessage('probe', [value], line);
};

// Console overrides
console.log = function(...args) { emitMessage('log', args); };
console.info = function(...args) { emitMessage('info', args); };
console.warn = function(...args) { emitMessage('warn', args); };
console.error = function(...args) { emitMessage('error', args); };

process.on('uncaughtException', (err) => {
  emitMessage('error', [err && err.stack ? err.stack : String(err)]);
});

process.on('unhandledRejection', (err) => {
  emitMessage('error', [err && err.stack ? err.stack : String(err)]);
});

${transpileResult.code}
`

    // Configure module resolution paths
    const nodePaths: string[] = []
    if (centralModulesPath) {
      nodePaths.push(centralModulesPath)
    }
    if (workingDirectory) {
      nodePaths.push(join(workingDirectory, 'node_modules'))
    }
    if (process.env.NODE_PATH) {
      nodePaths.push(process.env.NODE_PATH)
    }

    const isPackaged = app ? app.isPackaged : false
    const executable = isPackaged ? process.execPath : 'node'

    const resolvedCwd = (() => {
      if (workingDirectory && existsSync(workingDirectory)) {
        try {
          if (statSync(workingDirectory).isDirectory()) return workingDirectory
        } catch {}
      }
      const rawCwd = process.cwd()
      if (rawCwd && !rawCwd.includes('.asar')) {
        try {
          if (existsSync(rawCwd) && statSync(rawCwd).isDirectory()) return rawCwd
        } catch {}
      }
      return app ? app.getPath('home') : os.homedir()
    })()

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_PATH: nodePaths.join(process.platform === 'win32' ? ';' : ':'),
      ...(isPackaged ? { ELECTRON_RUN_AS_NODE: '1' } : {})
    }

    return new Promise((resolve) => {
      const logs: LogEntry[] = []

      const proc = spawn(executable, ['--input-type=module', '-e', runnerScript], {
        cwd: resolvedCwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      this.activeProcesses.set(tabId, proc)

      // Watchdog timeout
      const timer = setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL')
          const timeoutLog: LogEntry = {
            type: 'error',
            args: [`Execution timed out after ${timeoutMs / 1000}s`],
            timestamp: Date.now()
          }
          logs.push(timeoutLog)
          onLog && onLog(timeoutLog)
          resolve({
            logs,
            durationMs: Date.now() - startTime,
            error: 'Execution timed out'
          })
        }
      }, timeoutMs)

      let lineBuffer = ''

      proc.stdout.on('data', (chunk) => {
        lineBuffer += chunk.toString()
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('__RUNJS_OUTPUT__:')) {
            try {
              const entry: LogEntry = JSON.parse(line.slice('__RUNJS_OUTPUT__:'.length))
              logs.push(entry)
              onLog && onLog(entry)
            } catch (e) {
              console.error('Failed to parse runner output:', e)
            }
          } else if (line.trim()) {
            const rawLog: LogEntry = {
              type: 'log',
              args: [line],
              timestamp: Date.now()
            }
            logs.push(rawLog)
            onLog && onLog(rawLog)
          }
        }
      })

      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString().trim()
        if (text) {
          const errLog: LogEntry = {
            type: 'error',
            args: [text],
            timestamp: Date.now()
          }
          logs.push(errLog)
          onLog && onLog(errLog)
        }
      })

      proc.on('close', () => {
        clearTimeout(timer)
        this.activeProcesses.delete(tabId)
        resolve({
          logs,
          durationMs: Date.now() - startTime
        })
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        this.activeProcesses.delete(tabId)
        const errLog: LogEntry = {
          type: 'error',
          args: [`Process error: ${err.message}`],
          timestamp: Date.now()
        }
        logs.push(errLog)
        onLog && onLog(errLog)
        resolve({
          logs,
          durationMs: Date.now() - startTime,
          error: err.message
        })
      })
    })
  }
}

export const executor = new CodeExecutor()
