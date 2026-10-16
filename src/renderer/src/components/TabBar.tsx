import React, { useState } from 'react'
import { X, Plus, FileCode } from 'lucide-react'
import { TabData } from '../types'

interface TabBarProps {
  tabs: TabData[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
  onRenameTab: (id: string, newTitle: string) => void
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onRenameTab
}) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const startEditing = (tab: TabData) => {
    setEditingId(tab.id)
    setEditTitle(tab.title)
  }

  const saveEditing = () => {
    if (editingId && editTitle.trim()) {
      onRenameTab(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="h-9 bg-background border-b border-border flex items-center overflow-x-auto select-none no-scrollbar">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const isEditing = editingId === tab.id

        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            onDoubleClick={() => startEditing(tab)}
            className={`group h-full flex items-center px-3 space-x-2 border-r border-border text-xs cursor-pointer transition ${
              isActive
                ? 'bg-surface text-primary border-b-2 border-b-primary font-medium'
                : 'text-textMuted hover:bg-surface/50 hover:text-text'
            }`}
          >
            <FileCode className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'text-textMuted'}`} />

            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                autoFocus
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={saveEditing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEditing()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="bg-background text-text text-xs px-1 py-0.5 rounded outline-none border border-primary w-24"
              />
            ) : (
              <span className="truncate max-w-[130px]">{tab.title}</span>
            )}

            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-border text-textMuted hover:text-text transition"
                title="Close Tab (Cmd+W)"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )
      })}

      <button
        onClick={onNewTab}
        className="px-2 h-full flex items-center justify-center text-textMuted hover:text-text hover:bg-surface/50 transition"
        title="Add Tab (Cmd+T)"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}
