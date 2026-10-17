import { useState, useEffect, useRef } from 'react'
import { TabData, UserPreferences } from '../types'

export function useTabs() {
  const [tabs, setTabs] = useState<TabData[]>([])
  const [activeTabId, setActiveTabId] = useState<string>('')
  const [preferences, setPreferences] = useState<UserPreferences>({
    theme: 'vs-dark',
    fontSize: 14,
    tabSize: 2,
    lineNumbers: true,
    wordWrap: true,
    autoFormatOnRun: false,
    vimMode: false
  })
  const [isLoaded, setIsLoaded] = useState(false)

  // Initial load from store
  useEffect(() => {
    async function init() {
      try {
        const data = await window.api.getStoreData()
        if (data.tabs && data.tabs.length > 0) {
          setTabs(data.tabs)
          setActiveTabId(data.activeTabId || data.tabs[0].id)
        }
        if (data.preferences) {
          setPreferences(data.preferences)
        }
      } catch (err) {
        console.error('Failed to load initial tab data:', err)
      } finally {
        setIsLoaded(true)
      }
    }
    init()
  }, [])

  // Auto-save debounce
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    if (!isLoaded || tabs.length === 0) return

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      window.api.saveTabs(tabs, activeTabId)
    }, 500)

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [tabs, activeTabId, isLoaded])

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]

  const updateActiveCode = (newCode: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, code: newCode, updatedAt: Date.now() } : t))
    )
  }

  const addTab = () => {
    const newTabNum = tabs.length + 1
    const newTab: TabData = {
      id: `tab-${Date.now()}`,
      title: `Scratchpad ${newTabNum}`,
      code: `// Scratchpad ${newTabNum}\n\n`,
      language: 'typescript',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
  }

  const closeTab = (idToClose: string) => {
    if (tabs.length <= 1) return // keep at least one tab
    const nextTabs = tabs.filter((t) => t.id !== idToClose)
    setTabs(nextTabs)
    if (activeTabId === idToClose) {
      setActiveTabId(nextTabs[nextTabs.length - 1].id)
    }
  }

  const closeOtherTabs = (keepId: string) => {
    const keepTab = tabs.find((t) => t.id === keepId)
    if (!keepTab) return
    setTabs([keepTab])
    setActiveTabId(keepTab.id)
  }

  const renameTab = (id: string, newTitle: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title: newTitle } : t)))
  }

  const updatePreferences = (newPrefs: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const merged = { ...prev, ...newPrefs }
      window.api.savePreferences(merged)
      return merged
    })
  }

  return {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    updateActiveCode,
    addTab,
    closeTab,
    closeOtherTabs,
    renameTab,
    preferences,
    updatePreferences,
    isLoaded
  }
}
