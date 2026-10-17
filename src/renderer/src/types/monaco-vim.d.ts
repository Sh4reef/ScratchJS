import * as monaco from 'monaco-editor'

declare module 'monaco-vim' {
  export interface VimAdapterInstance {
    dispose(): void
    [key: string]: any
  }

  export interface VimApi {
    defineEx(name: string, prefix: string, callback: (...args: any[]) => void): void
    map(lhs: string, rhs: string, mode?: string): void
    [key: string]: any
  }

  export class VimMode {
    static Vim: VimApi
    static commands: Record<string, any>
    static prototype: any
    [key: string]: any
  }

  export function initVimMode(
    editor: monaco.editor.IStandaloneCodeEditor,
    statusbarNode?: HTMLElement | null,
    StatusBarClass?: any,
    sanitizer?: any
  ): VimAdapterInstance
}
