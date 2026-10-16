import { useState, useEffect, useCallback } from 'react'
import { LogEntry } from '../types'

export function useRunner(activeTabId: string, workingDirectory?: string) {
  const [logsByTab, setLogsByTab] = useState<Record<string, LogEntry[]>>({})
  const [isRunning, setIsRunning] = useState(false)
  const [durationMs, setDurationMs] = useState<number | null>(null)

  // Subscribe to live log streaming for active tab
  useEffect(() => {
    if (!activeTabId) return

    const unsubscribe = window.api.onRunnerLog(activeTabId, (entry: LogEntry) => {
      setLogsByTab((prev) => ({
        ...prev,
        [activeTabId]: [...(prev[activeTabId] || []), entry]
      }))
    })

    return () => unsubscribe()
  }, [activeTabId])

  const runCode = useCallback(
    async (code: string) => {
      if (!activeTabId || isRunning) return

      setIsRunning(true)
      setDurationMs(null)
      // Reset logs for this tab
      setLogsByTab((prev) => ({ ...prev, [activeTabId]: [] }))

      try {
        const result = await window.api.executeCode(code, {
          tabId: activeTabId,
          isTypeScript: true,
          workingDirectory
        })

        setDurationMs(result.durationMs)
        if (result.logs && result.logs.length > 0) {
          setLogsByTab((prev) => ({ ...prev, [activeTabId]: result.logs }))
        }
      } catch (err: any) {
        setLogsByTab((prev) => ({
          ...prev,
          [activeTabId]: [
            ...(prev[activeTabId] || []),
            {
              type: 'error',
              args: [err?.message || String(err)],
              timestamp: Date.now()
            }
          ]
        }))
      } finally {
        setIsRunning(false)
      }
    },
    [activeTabId, isRunning, workingDirectory]
  )

  const stopCode = useCallback(async () => {
    if (!activeTabId) return
    await window.api.stopCode(activeTabId)
    setIsRunning(false)
  }, [activeTabId])

  const clearLogs = useCallback(() => {
    if (!activeTabId) return
    setLogsByTab((prev) => ({ ...prev, [activeTabId]: [] }))
    setDurationMs(null)
  }, [activeTabId])

  return {
    logs: logsByTab[activeTabId] || [],
    isRunning,
    durationMs,
    runCode,
    stopCode,
    clearLogs
  }
}
