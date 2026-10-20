import React, { useRef, useEffect, useState } from 'react'
import Editor, { Monaco, OnMount, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { UserPreferences } from '../types'
import type { VimAdapterInstance } from './vim-adapter'

// Setup local Monaco web workers (avoids any network/CDN request at runtime)
if (typeof self !== 'undefined') {
  ;(self as any).MonacoEnvironment = {
    getWorker(_: any, label: string) {
      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker()
      }
      return new editorWorker()
    }
  }
}

// Instruct @monaco-editor/react to use our bundled, local monaco instance rather than jsdelivr CDN
loader.config({ monaco })

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
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const vimModeRef = useRef<VimAdapterInstance | null>(null)
  const statusNodeRef = useRef<HTMLDivElement | null>(null)
  const [isEditorMounted, setIsEditorMounted] = useState(false)

  const onRunRef = useRef(onRun)
  onRunRef.current = onRun

  const onStopRef = useRef(onStop)
  onStopRef.current = onStop

  const onClearRef = useRef(onClear)
  onClearRef.current = onClear

  // Attach or detach Vim mode dynamically when preferences change (lazy-loaded on demand)
  useEffect(() => {
    if (!isEditorMounted || !editorRef.current) return

    let isCancelled = false

    if (preferences.vimMode) {
      if (!vimModeRef.current) {
        import('./vim-adapter').then(({ attachVimMode, registerVimCommand }) => {
          if (isCancelled || !editorRef.current) return
          try {
            registerVimCommand('write', 'w', () => {
              onRunRef.current()
            })
            const vim = attachVimMode(editorRef.current, statusNodeRef.current)
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
        })
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

    return () => {
      isCancelled = true
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
