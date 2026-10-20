import React, { useState, useEffect, useRef } from 'react'
import { Header } from './components/Header'
import { TabBar } from './components/TabBar'
import { CodeEditor } from './components/Editor'
import { OutputPane } from './components/OutputPane'
import { PackageModal } from './components/modals/PackageModal'
import { SnippetsModal } from './components/modals/SnippetsModal'
import { SettingsModal } from './components/modals/SettingsModal'
import { useTabs } from './hooks/useTabs'
import { useRunner } from './hooks/useRunner'

export const App: React.FC = () => {
  const {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    updateActiveCode,
    addTab,
    closeTab,
    renameTab,
    preferences,
    updatePreferences,
    isLoaded
  } = useTabs()

  const { logs, isRunning, durationMs, runCode, stopCode, clearLogs } = useRunner(
    activeTabId,
    preferences.workingDirectory
  )

  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab

  const runCodeRef = useRef(runCode)
  runCodeRef.current = runCode

  const stopCodeRef = useRef(stopCode)
  stopCodeRef.current = stopCode

  const clearLogsRef = useRef(clearLogs)
  clearLogsRef.current = clearLogs

  const [isPackagesOpen, setIsPackagesOpen] = useState(false)
  const [isSnippetsOpen, setIsSnippetsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Global capture-phase shortcut listener (ensures Cmd+Enter / Cmd+. / Cmd+K works even when Monaco or any input is focused)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      if (isCmdOrCtrl && e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (activeTabRef.current) {
          runCodeRef.current(activeTabRef.current.code)
        }
      } else if (isCmdOrCtrl && (e.key === '.' || e.code === 'Period')) {
        e.preventDefault()
        e.stopPropagation()
        stopCodeRef.current()
      } else if (isCmdOrCtrl && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
        e.preventDefault()
        e.stopPropagation()
        clearLogsRef.current()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown, true)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true)
  }, [])

  // Bind Native Menu Accelerators
  useEffect(() => {
    const unsubRun = window.api.onMenuAction('run-code', () => {
      if (activeTabRef.current) runCodeRef.current(activeTabRef.current.code)
    })
    const unsubStop = window.api.onMenuAction('stop-code', () => stopCodeRef.current())
    const unsubNewTab = window.api.onMenuAction('new-tab', () => addTab())
    const unsubCloseTab = window.api.onMenuAction('close-tab', () => closeTab(activeTabId))
    const unsubClear = window.api.onMenuAction('clear-output', () => clearLogs())

    return () => {
      unsubRun()
      unsubStop()
      unsubNewTab()
      unsubCloseTab()
      unsubClear()
    }
  }, [addTab, closeTab, activeTabId, clearLogs])

  if (!isLoaded || !activeTab) {
    return <div className="h-screen w-screen bg-background flex items-center justify-center text-textMuted text-xs">Loading playground…</div>
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-text overflow-hidden">
      {/* Top Header */}
      <Header
        isRunning={isRunning}
        durationMs={durationMs}
        onRun={() => runCode(activeTab.code)}
        onStop={stopCode}
        onNewTab={addTab}
        onClearOutput={clearLogs}
        onOpenPackages={() => setIsPackagesOpen(true)}
        onOpenSnippets={() => setIsSnippetsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Tabs */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onNewTab={addTab}
        onRenameTab={renameTab}
      />

      {/* Split Workspace: Editor (Left) & Output (Right) */}
      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 h-full min-w-[300px]">
          <CodeEditor
            code={activeTab.code}
            onChange={updateActiveCode}
            onRun={() => {
              if (activeTabRef.current) {
                runCodeRef.current(activeTabRef.current.code)
              }
            }}
            onStop={stopCode}
            onClear={clearLogs}
            preferences={preferences}
          />
        </div>

        <div className="w-[45%] h-full min-w-[280px]">
          <OutputPane logs={logs} onClear={clearLogs} activeTabId={activeTabId} />
        </div>
      </main>

      {/* Modals */}
      <PackageModal isOpen={isPackagesOpen} onClose={() => setIsPackagesOpen(false)} />

      <SnippetsModal
        isOpen={isSnippetsOpen}
        onClose={() => setIsSnippetsOpen(false)}
        onInsertSnippet={(snippetCode) => {
          updateActiveCode(activeTab.code + '\n\n' + snippetCode)
        }}
        onInsertInNewTab={(title, snippetCode) => {
          addTab()
          // Update the newly created tab on the next tick
          setTimeout(() => {
            updateActiveCode(snippetCode)
            renameTab(activeTabId, title)
          }, 50)
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        preferences={preferences}
        onSavePreferences={updatePreferences}
      />
    </div>
  )
}

export default App
