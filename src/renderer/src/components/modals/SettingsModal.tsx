import React, { useState, useEffect } from 'react'
import { X, Settings, Folder, Check } from 'lucide-react'
import { UserPreferences } from '../../types'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  preferences: UserPreferences
  onSavePreferences: (prefs: Partial<UserPreferences>) => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  preferences,
  onSavePreferences
}) => {
  const [theme, setTheme] = useState(preferences.theme || 'vs-dark')
  const [fontSize, setFontSize] = useState(preferences.fontSize || 14)
  const [tabSize, setTabSize] = useState(preferences.tabSize || 2)
  const [lineNumbers, setLineNumbers] = useState(preferences.lineNumbers ?? true)
  const [wordWrap, setWordWrap] = useState(preferences.wordWrap ?? true)
  const [vimMode, setVimMode] = useState(preferences.vimMode ?? false)
  const [workingDirectory, setWorkingDirectory] = useState(preferences.workingDirectory || '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setTheme(preferences.theme || 'vs-dark')
      setFontSize(preferences.fontSize || 14)
      setTabSize(preferences.tabSize || 2)
      setLineNumbers(preferences.lineNumbers ?? true)
      setWordWrap(preferences.wordWrap ?? true)
      setVimMode(preferences.vimMode ?? false)
      setWorkingDirectory(preferences.workingDirectory || '')
    }
  }, [isOpen, preferences])

  if (!isOpen) return null

  const handleSave = () => {
    onSavePreferences({
      theme,
      fontSize: Number(fontSize),
      tabSize: Number(tabSize),
      lineNumbers,
      wordWrap,
      vimMode,
      workingDirectory: workingDirectory.trim() || undefined
    })
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 600)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-border w-full max-w-lg rounded-lg shadow-2xl flex flex-col max-h-[500px] overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-border flex items-center justify-between select-none">
          <div className="flex items-center space-x-2 font-semibold text-text">
            <Settings className="w-4 h-4 text-warning" />
            <span>Settings</span>
          </div>

          <button onClick={onClose} className="p-1 rounded text-textMuted hover:text-text hover:bg-surfaceHover">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-text">
          {/* Theme */}
          <div className="space-y-1.5">
            <label className="font-semibold text-textMuted">Editor Theme</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-1.5 text-xs text-text outline-none focus:border-primary"
            >
              <option value="vs-dark">Visual Studio Dark</option>
              <option value="vs-light">Visual Studio Light</option>
              <option value="hc-black">High Contrast Dark</option>
            </select>
          </div>

          {/* Font Size & Tab Size */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-semibold text-textMuted">Font Size (px)</label>
              <input
                type="number"
                min={10}
                max={24}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full bg-background border border-border rounded px-3 py-1.5 text-xs text-text outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-textMuted">Tab Size</label>
              <select
                value={tabSize}
                onChange={(e) => setTabSize(Number(e.target.value))}
                className="w-full bg-background border border-border rounded px-3 py-1.5 text-xs text-text outline-none focus:border-primary"
              >
                <option value={2}>2 Spaces</option>
                <option value={4}>4 Spaces</option>
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lineNumbers}
                onChange={(e) => setLineNumbers(e.target.checked)}
                className="rounded border-border text-primary focus:ring-0"
              />
              <span>Show Line Numbers</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={wordWrap}
                onChange={(e) => setWordWrap(e.target.checked)}
                className="rounded border-border text-primary focus:ring-0"
              />
              <span>Wrap Long Lines</span>
            </label>

            <label className="flex items-start space-x-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={vimMode}
                onChange={(e) => setVimMode(e.target.checked)}
                className="rounded border-border text-primary focus:ring-0 mt-0.5"
              />
              <div className="flex flex-col">
                <div className="flex items-center space-x-1.5">
                  <span className="font-medium text-text">Vim Mode</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-mono font-medium leading-none">
                    modal navigation
                  </span>
                </div>
                <span className="text-[11px] text-textMuted/70 mt-0.5">
                  Enable Vim keybindings, modal navigation (Normal, Insert, Visual), and command mode in the editor
                </span>
              </div>
            </label>
          </div>

          {/* Custom Working Directory */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            <label className="flex items-center space-x-1.5 font-semibold text-textMuted">
              <Folder className="w-3.5 h-3.5" />
              <span>Custom Working Directory (CWD)</span>
            </label>
            <input
              type="text"
              placeholder="/Users/username/Projects/my-app"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-1.5 text-xs text-text outline-none focus:border-primary placeholder:text-textMuted/40 font-mono"
            />
            <p className="text-[11px] text-textMuted/60">
              When set, relative `fs` operations and local `node_modules` will resolve from this folder.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-12 px-4 border-t border-border bg-background/50 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-surfaceHover hover:bg-border text-text rounded font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center space-x-1 px-4 py-1.5 bg-primary text-background font-semibold rounded hover:bg-primary/90 transition"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{saved ? 'Saved!' : 'Save Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
