import { useState, useEffect, useCallback } from 'react'
import { PackageInfo, SearchResult } from '../types'

export function usePackages() {
  const [installed, setInstalled] = useState<PackageInfo[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [nodeModulesPath, setNodeModulesPath] = useState('')

  const refreshInstalled = useCallback(async () => {
    try {
      const list = await window.api.listPackages()
      setInstalled(list)
      const path = await window.api.getNodeModulesPath()
      setNodeModulesPath(path)
    } catch (e) {
      console.error('Failed to list installed packages:', e)
    }
  }, [])

  useEffect(() => {
    refreshInstalled()
  }, [refreshInstalled])

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    setIsSearching(true)
    try {
      const results = await window.api.searchPackages(query)
      setSearchResults(results)
    } catch (e) {
      console.error('Failed to search packages:', e)
    } finally {
      setIsSearching(false)
    }
  }, [])

  const install = useCallback(
    async (name: string, version?: string) => {
      setIsInstalling(true)
      try {
        const res = await window.api.installPackage(name, version)
        if (res.success) {
          await refreshInstalled()
          return true
        } else {
          alert(`Failed to install ${name}: ${res.error}`)
          return false
        }
      } catch (err: any) {
        alert(`Error installing ${name}: ${err?.message || err}`)
        return false
      } finally {
        setIsInstalling(false)
      }
    },
    [refreshInstalled]
  )

  const remove = useCallback(
    async (name: string) => {
      try {
        const res = await window.api.removePackage(name)
        if (res.success) {
          await refreshInstalled()
          return true
        } else {
          alert(`Failed to uninstall ${name}: ${res.error}`)
          return false
        }
      } catch (err: any) {
        alert(`Error removing ${name}: ${err?.message || err}`)
        return false
      }
    },
    [refreshInstalled]
  )

  return {
    installed,
    searchResults,
    isSearching,
    isInstalling,
    nodeModulesPath,
    refreshInstalled,
    search,
    install,
    remove
  }
}
