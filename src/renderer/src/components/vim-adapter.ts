import { initVimMode, VimMode, VimAdapterInstance } from 'monaco-vim'
import type * as monacoEditor from 'monaco-editor'

let isPatched = false

export function setupVimPatch(): void {
  if (isPatched) return
  isPatched = true

  if (VimMode?.prototype) {
    // 1. Fix readOnly check in modern Monaco
    const originalGetOption = VimMode.prototype.getOption
    VimMode.prototype.getOption = function (key: string) {
      if (key === 'readOnly') {
        const editor = this.editor
        if (editor && typeof editor.getOption === 'function') {
          const monaco = (window as any).monaco
          const readOnlyId = monaco?.editor?.EditorOption?.readOnly ?? 92
          const val = editor.getOption(readOnlyId)
          return typeof val === 'boolean' ? val : false
        }
        return false
      }
      return originalGetOption ? originalGetOption.call(this, key) : false
    }

    // 2. Fix triggerEditorAction to forward payload
    VimMode.prototype.triggerEditorAction = function (action: string, payload?: any) {
      if (this.editor && typeof this.editor.trigger === 'function') {
        this.editor.trigger('vim', action, payload)
      }
    }

    // 3. Fix setSelections to avoid cross-bundle / cross-realm class mismatch
    const originalSetSelections = VimMode.prototype.setSelections
    VimMode.prototype.setSelections = function (selections: any[], primIndex?: number) {
      if (!this.editor) return
      try {
        const monaco = (window as any).monaco
        if (monaco?.Selection && monaco?.Position) {
          const hasSel = !!this.editor.getSelections()?.length
          const toMonacoPos = (pos: any) => new monaco.Position(pos.line + 1, pos.ch + 1)
          const sels = selections.map((s: any) => {
            const { anchor, head } = s
            if (hasSel) {
              return monaco.Selection.fromPositions(toMonacoPos(anchor), toMonacoPos(head))
            }
            return monaco.Selection.fromPositions(toMonacoPos(head), toMonacoPos(anchor))
          })
          if (primIndex && sels[primIndex]) {
            sels.push(sels.splice(primIndex, 1)[0])
          }
          if (!sels.length) return
          this.editor.setSelections(sels)
          const revealPos = sels[0].getEndPosition ? sels[0].getEndPosition() : sels[0].getPosition()
          this.editor.revealPosition(revealPos)
          return
        }
      } catch {
        // Fallback to original
      }
      return originalSetSelections ? originalSetSelections.call(this, selections, primIndex) : undefined
    }
  }

  if (VimMode?.commands) {
    VimMode.commands.newlineAndIndent = function (cm: any) {
      if (cm.editor && typeof cm.editor.trigger === 'function') {
        cm.editor.trigger('vim', 'type', { text: '\n' })
      }
    }
  }
}

export function registerVimCommand(command: string, short: string, handler: () => void): void {
  setupVimPatch()
  try {
    if (VimMode?.Vim?.defineEx) {
      VimMode.Vim.defineEx(command, short, handler)
    }
  } catch {
    // Ignore if already registered
  }
}

export function attachVimMode(
  editor: monacoEditor.editor.IStandaloneCodeEditor,
  statusNode: HTMLElement | null
): VimAdapterInstance {
  setupVimPatch()
  return initVimMode(editor, statusNode)
}

export type { VimAdapterInstance }
