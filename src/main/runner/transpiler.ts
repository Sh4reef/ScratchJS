import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { builtinModules } from 'module'

export interface TranspileResult {
  code: string
  error?: string
}

export interface TranspileOptions {
  isTypeScript?: boolean
  workingDirectory?: string
  centralModulesPath?: string
  centralModulesPaths?: string[]
}

let esbuildInstance: typeof import('esbuild') | null = null

function ensureEsbuildBinary(): void {
  if (typeof app !== 'undefined' && app?.isPackaged && !process.env.ESBUILD_BINARY_PATH) {
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
}

async function getEsbuild(): Promise<typeof import('esbuild')> {
  if (!esbuildInstance) {
    ensureEsbuildBinary()
    esbuildInstance = await import('esbuild')
  }
  return esbuildInstance
}

export function transformMagicComments(code: string): string {
  const lines = code.split('\n')
  return lines
    .map((line, idx) => {
      const lineNum = idx + 1
      // Match line comment "// ?" / "//?" or block comment "/* ? */"
      const commentMatch = line.match(/^(\s*)(.*?)(?:\s*\/\/\s*\?.*$|\s*\/\*\s*\?\s*\*\/.*$)/)
      if (commentMatch) {
        const [, indent, expr] = commentMatch
        const trimmedExpr = expr.trim()
        if (trimmedExpr) {
          // Check for variable declaration with optional TypeScript type annotation
          const varDeclMatch = trimmedExpr.match(/^(?:const|let|var)\s+([a-zA-Z0-9_$]+)(?:\s*:[^=]+)?\s*=/)
          if (varDeclMatch) {
            // Keep on same line to preserve line numbers in stack traces
            return `${indent}${trimmedExpr.replace(/;+$/, '')}; __runjs_probe__(${lineNum}, (${varDeclMatch[1]}));`
          }
          return `${indent}__runjs_probe__(${lineNum}, (${trimmedExpr.replace(/;+$/, '')}));`
        }
      }
      return line
    })
    .join('\n')
}

export const instrumentMagicComments = transformMagicComments

export function transpileCode(code: string, isTypeScript?: boolean): Promise<TranspileResult>
export function transpileCode(code: string, options?: TranspileOptions): Promise<TranspileResult>
export async function transpileCode(
  code: string,
  options: TranspileOptions | boolean = {}
): Promise<TranspileResult> {
  const opts: TranspileOptions = typeof options === 'boolean' ? { isTypeScript: options } : options
  const { isTypeScript = true, workingDirectory, centralModulesPath } = opts
  try {
    const esbuild = await getEsbuild()
    const transformed = transformMagicComments(code)
    const hasImports = /^\s*import\s+/m.test(transformed)

    if (hasImports && (workingDirectory || centralModulesPath || opts.centralModulesPaths?.length)) {
      const nodePaths: string[] = []
      if (Array.isArray(opts.centralModulesPaths)) {
        nodePaths.push(...opts.centralModulesPaths)
      } else if (centralModulesPath) {
        nodePaths.push(centralModulesPath)
      }
      if (workingDirectory) {
        nodePaths.push(join(workingDirectory, 'node_modules'))
        nodePaths.push(workingDirectory)
      }

      // Convert Node built-in imports to CommonJS require calls inside the bundle
      const builtinPlugin = {
        name: 'node-builtins-require',
        setup(build: any) {
          const filter = new RegExp(`^(node:.*|electron|${builtinModules.join('|')})$`)
          build.onResolve({ filter }, (args: any) => ({
            path: args.path,
            namespace: 'node-builtin'
          }))
          build.onLoad({ filter: /.*/, namespace: 'node-builtin' }, (args: any) => ({
            contents: `module.exports = require(${JSON.stringify(args.path)});`,
            loader: 'js'
          }))
        }
      }

      const buildResult = await esbuild.build({
        stdin: {
          contents: transformed,
          resolveDir: workingDirectory || process.cwd(),
          loader: isTypeScript ? 'ts' : 'js'
        },
        bundle: true,
        write: false,
        platform: 'node',
        mainFields: ['module', 'main'],
        format: 'esm',
        target: 'es2022',
        plugins: [builtinPlugin],
        nodePaths
      })

      return {
        code: buildResult.outputFiles?.[0]?.text ?? ''
      }
    }

    const result = await esbuild.transform(transformed, {
      loader: isTypeScript ? 'ts' : 'js',
      target: 'es2022',
      format: 'esm'
    })

    return {
      code: result.code
    }
  } catch (err: any) {
    return {
      code: '',
      error: err?.message || String(err)
    }
  }
}
