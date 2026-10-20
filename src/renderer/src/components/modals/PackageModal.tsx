import React, { useState } from 'react'
import { X, Search, Package, Trash2, Download, Loader2, CheckCircle2 } from 'lucide-react'
import { usePackages } from '../../hooks/usePackages'

interface PackageModalProps {
  isOpen: boolean
  onClose: () => void
}

export const PackageModal: React.FC<PackageModalProps> = ({ isOpen, onClose }) => {
  const { installed, searchResults, isSearching, isInstalling, search, install, remove } = usePackages()
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'installed' | 'search'>('installed')

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      setActiveTab('search')
      search(query.trim())
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-surface border border-border w-full max-w-xl rounded-lg shadow-2xl flex flex-col h-[520px] overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-border flex items-center justify-between select-none">
          <div className="flex items-center space-x-2 font-semibold text-text">
            <Package className="w-4 h-4 text-primary" />
            <span>NPM Packages</span>
          </div>

          <button onClick={onClose} className="p-1 rounded text-textMuted hover:text-text hover:bg-surfaceHover">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-border bg-background/50">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-textMuted" />
            <input
              type="text"
              placeholder="Search npm packages (e.g. lodash, axios, zod)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-20 py-2 bg-surface border border-border rounded text-text placeholder:text-textMuted/50 focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-1.5 px-3 py-1 bg-primary text-background font-semibold rounded text-[11px] hover:bg-primary/90 transition"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
            </button>
          </form>
        </div>

        {/* Tab switch: Installed vs Search Results */}
        <div className="flex border-b border-border bg-surface px-4 select-none">
          <button
            onClick={() => setActiveTab('installed')}
            className={`py-2 px-3 border-b-2 font-medium ${
              activeTab === 'installed'
                ? 'border-primary text-primary'
                : 'border-transparent text-textMuted hover:text-text'
            }`}
          >
            Installed ({installed.length})
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`py-2 px-3 border-b-2 font-medium ${
              activeTab === 'search'
                ? 'border-primary text-primary'
                : 'border-transparent text-textMuted hover:text-text'
            }`}
          >
            Search Results {searchResults.length > 0 && `(${searchResults.length})`}
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeTab === 'installed' ? (
            installed.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-textMuted/50 py-12">
                <Package className="w-8 h-8 mb-2 opacity-50" />
                <p>No npm packages installed yet.</p>
                <p className="text-[11px] text-textMuted/40 mt-1">Search above to install libraries for your scratchpads.</p>
              </div>
            ) : (
              installed.map((pkg) => (
                <div
                  key={pkg.name}
                  className="flex items-center justify-between p-2.5 bg-background/50 hover:bg-background border border-border rounded transition"
                >
                  <div>
                    <span className="font-semibold text-text">{pkg.name}</span>
                    <span className="ml-2 text-[11px] text-textMuted font-mono">v{pkg.version}</span>
                  </div>

                  <button
                    onClick={() => remove(pkg.name)}
                    className="p-1 text-textMuted hover:text-error hover:bg-error/10 rounded transition"
                    title={`Uninstall ${pkg.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )
          ) : searchResults.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-textMuted/50 py-12">
              <Search className="w-8 h-8 mb-2 opacity-50" />
              <p>Type a package name above and hit Enter to search.</p>
            </div>
          ) : (
            searchResults.map((item) => {
              const isAlreadyInstalled = installed.some((p) => p.name === item.name)

              return (
                <div
                  key={item.name}
                  className="flex items-start justify-between p-2.5 bg-background/50 hover:bg-background border border-border rounded transition"
                >
                  <div className="flex-1 pr-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-text">{item.name}</span>
                      <span className="text-[11px] text-textMuted font-mono">v{item.version}</span>
                    </div>
                    {item.description && (
                      <p className="text-textMuted text-[11px] mt-1 line-clamp-2">{item.description}</p>
                    )}
                  </div>

                  <div>
                    {isAlreadyInstalled ? (
                      <span className="flex items-center space-x-1 px-2.5 py-1 text-success text-[11px] font-medium bg-success/10 rounded">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Installed</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => install(item.name, item.version)}
                        disabled={isInstalling}
                        className="flex items-center space-x-1 px-2.5 py-1 bg-primary text-background font-semibold rounded text-[11px] hover:bg-primary/90 transition disabled:opacity-50"
                      >
                        <Download className="w-3 h-3" />
                        <span>Install</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
