import React, { useRef, useEffect, useState } from 'react'
import Editor, { Monaco, OnMount } from '@monaco-editor/react'
import type * as monacoEditor from 'monaco-editor'
import { initVimMode, VimMode, VimAdapterInstance } from 'monaco-vim'
import { UserPreferences } from '../types'

// Ensure monaco-vim compatibility with modern Monaco Editor
if (VimMode?.prototype) {
  // 1. Fix readOnly check in modern Monaco:
  // Older monaco-vim hardcodes option 65 (readOnly in old Monaco), but in modern Monaco option 65 is lightbulb!
  // Lightbulb returns an object ({ enabled: true }), which is truthy, causing enterInsertMode to abort
  // immediately for 'i', 'I', 'a', 'A'. We ensure it only returns a true boolean if actually read-only.
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

  // 2. Fix triggerEditorAction to forward payload:
  // newlineAndIndent for 'o' and 'O' calls triggerEditorAction('type', { text: '\n' }),
  // but monaco-vim originally omitted the payload argument, breaking 'o' and 'O' line creation.
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
      // Fallback to original if anything fails
    }
    return originalSetSelections ? originalSetSelections.call(this, selections, primIndex) : undefined
  }
}

if (VimMode?.commands) {
  // Ensure newlineAndIndent correctly triggers typing a newline in Monaco
  VimMode.commands.newlineAndIndent = function (cm: any) {
    if (cm.editor && typeof cm.editor.trigger === 'function') {
      cm.editor.trigger('vim', 'type', { text: '\n' })
    }
  }
}

interface EditorProps {
  code: string
  onChange: (value: string) => void
  onRun: () => void
  onStop?: () => void
  onClear?: () => void
  preferences: UserPreferences
}

export const CodeEditor: React.FC<EditorProps> = ({ code, onChange, onRun, onStop, onClear, preferences }) => {
  const monacoRef = useRef<Monaco | null>(null)
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null)
  const vimModeRef = useRef<VimAdapterInstance | null>(null)
  const statusNodeRef = useRef<HTMLDivElement | null>(null)
  const [isEditorMounted, setIsEditorMounted] = useState(false)

  const onRunRef = useRef(onRun)
  onRunRef.current = onRun

  const onStopRef = useRef(onStop)
  onStopRef.current = onStop

  const onClearRef = useRef(onClear)
  onClearRef.current = onClear

  // Register custom Vim ex commands (e.g. :w or :write runs the code)
  useEffect(() => {
    try {
      if (VimMode?.Vim?.defineEx) {
        VimMode.Vim.defineEx('write', 'w', () => {
          onRunRef.current()
        })
      }
    } catch {
      // Ignore if already registered
    }
  }, [])

  // Attach or detach Vim mode dynamically when preferences change
  useEffect(() => {
    if (!isEditorMounted || !editorRef.current) return

    if (preferences.vimMode) {
      if (!vimModeRef.current) {
        try {
          const vim = initVimMode(editorRef.current, statusNodeRef.current)
          vimModeRef.current = vim

          // Provide cursor feedback matching Vim modes
          vim.on('vim-mode-change', (modeObj: { mode: string }) => {
            if (editorRef.current) {
              if (modeObj.mode === 'insert' || modeObj.mode === 'replace') {
                editorRef.current.updateOptions({
                  cursorStyle: 'line',
                  cursorBlinking: 'blink',
                  cursorWidth: 0
                })
              } else {
                editorRef.current.updateOptions({
                  cursorStyle: 'block',
                  cursorBlinking: 'solid'
                })
              }
            }
          })

          editorRef.current.focus()
        } catch (err) {
          console.error('Failed to initialize Vim mode:', err)
        }
      }
    } else {
      if (vimModeRef.current) {
        try {
          vimModeRef.current.dispose()
        } catch (err) {
          console.error('Error disposing Vim mode:', err)
        }
        vimModeRef.current = null
        if (editorRef.current) {
          editorRef.current.updateOptions({
            cursorStyle: 'line',
            cursorBlinking: 'smooth',
            cursorWidth: 0
          })
        }
        if (statusNodeRef.current) {
          statusNodeRef.current.innerHTML = ''
          statusNodeRef.current.style.display = 'none'
        }
      }
    }
  }, [preferences.vimMode, isEditorMounted])

  // Cleanup Vim mode on unmount
  useEffect(() => {
    return () => {
      if (vimModeRef.current) {
        try {
          vimModeRef.current.dispose()
        } catch {}
        vimModeRef.current = null
      }
    }
  }, [])

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco
    editorRef.current = editor
    ;(window as any).monaco = monaco
    setIsEditorMounted(true)

    // Intercept Cmd+Enter / Ctrl+Enter before Vim mode consumes it
    editor.onKeyDown((e) => {
      if ((e.metaKey || e.ctrlKey) && e.keyCode === monaco.KeyCode.Enter) {
        e.preventDefault()
        e.stopPropagation()
        onRunRef.current()
      }
    })

    // Bind Cmd+Enter / Ctrl+Enter to Run (always uses latest onRunRef)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current()
    })

    // Bind Cmd+. / Ctrl+. to Stop execution
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period, () => {
      if (onStopRef.current) {
        onStopRef.current()
      }
    })

    // Bind Cmd+K / Ctrl+K to Clear output (overrides Monaco chord prefix)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      if (onClearRef.current) {
        onClearRef.current()
      }
    })

    // Configure TypeScript compiler defaults
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTextFiles: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      allowJs: true
    })

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false
    })
  }

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden bg-background">
      <div className="flex-1 w-full min-h-0 relative">
        <Editor
          height="100%"
          defaultLanguage="typescript"
          language="typescript"
          theme={preferences.theme || 'vs-dark'}
          value={code}
          onChange={(val) => onChange(val || '')}
          onMount={handleEditorDidMount}
          options={{
            fontSize: preferences.fontSize || 14,
            tabSize: preferences.tabSize || 2,
            lineNumbers: preferences.lineNumbers ? 'on' : 'off',
            wordWrap: preferences.wordWrap ? 'on' : 'off',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', monospace",
            fontLigatures: true,
            cursorBlinking: 'smooth',
            bracketPairColorization: { enabled: true },
            renderLineHighlight: 'all',
            padding: { top: 12, bottom: 12 }
          }}
        />
      </div>
      <div
        ref={statusNodeRef}
        className="vim-status-bar"
        style={{ display: 'none' }}
      />
    </div>
  )
}
