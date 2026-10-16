import React, { useRef } from 'react'
import Editor, { Monaco, OnMount } from '@monaco-editor/react'
import { UserPreferences } from '../types'

interface EditorProps {
  code: string
  onChange: (value: string) => void
  onRun: () => void
  onStop?: () => void
  preferences: UserPreferences
}

export const CodeEditor: React.FC<EditorProps> = ({ code, onChange, onRun, onStop, preferences }) => {
  const monacoRef = useRef<Monaco | null>(null)
  const onRunRef = useRef(onRun)
  onRunRef.current = onRun

  const onStopRef = useRef(onStop)
  onStopRef.current = onStop

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco

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
    <div className="w-full h-full relative overflow-hidden">
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
  )
}
