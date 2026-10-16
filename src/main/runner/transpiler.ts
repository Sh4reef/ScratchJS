import { transform } from 'esbuild'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

function ensureEsbuildBinary(): void {
  if (app && app.isPackaged && !process.env.ESBUILD_BINARY_PATH) {
    const arch = process.arch
    const unpackedBin = join(
      process.resourcesPath,
      `app.asar.unpacked/node_modules/@esbuild/darwin-${arch}/bin/esbuild`
    )
    if (existsSync(unpackedBin)) {
      process.env.ESBUILD_BINARY_PATH = unpackedBin
    }
  }
}

export interface TranspileResult {
  code: string
  error?: string
}

/**
 * Instruments magic comments (// ? and /* ? * /) so their runtime values
 * are captured and reported with line number coordinates.
 */
export function instrumentMagicComments(source: string): string {
  const lines = source.split('\n')
  const magicLineRegex = /^(.*?)(?:\s*\/\/\s*\?\s*$|\s*\/\*\s*\?\s*\*\/)/

  const transformedLines = lines.map((line, index) => {
    const match = line.match(magicLineRegex)
    if (!match) return line

    const codePart = match[1].trim()
    if (!codePart) return line

    // If it's a variable declaration: const x = foo(); // ?
    const varDeclMatch = codePart.match(/^(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(.+)$/)
    if (varDeclMatch) {
      const varName = varDeclMatch[1]
      // Preserve the declaration and insert the probe on the same line or right after
      return `${codePart}; globalThis.__runjs_probe__ && globalThis.__runjs_probe__(${index + 1}, ${varName});`
    }

    // If it's an assignment: x = foo(); // ?
    const assignMatch = codePart.match(/^([a-zA-Z0-9_$]+)\s*=\s*(.+)$/)
    if (assignMatch) {
      const varName = assignMatch[1]
      return `${codePart}; globalThis.__runjs_probe__ && globalThis.__runjs_probe__(${index + 1}, ${varName});`
    }

    // If it's a standalone expression: [1, 2].map(x => x * 2); // ?
    const cleanExpr = codePart.replace(/;+$/, '')
    return `(() => { const _val = (${cleanExpr}); globalThis.__runjs_probe__ && globalThis.__runjs_probe__(${index + 1}, _val); return _val; })();`
  })

  return transformedLines.join('\n')
}

/**
 * Transpiles TypeScript / modern JavaScript using esbuild
 */
export async function transpileCode(source: string, isTypeScript: boolean = true): Promise<TranspileResult> {
  try {
    ensureEsbuildBinary()
    const instrumented = instrumentMagicComments(source)
    const result = await transform(instrumented, {
      loader: isTypeScript ? 'ts' : 'js',
      target: 'node18',
      format: 'esm',
      sourcemap: 'inline'
    })

    return { code: result.code }
  } catch (err: any) {
    return {
      code: '',
      error: err?.message || String(err)
    }
  }
}
