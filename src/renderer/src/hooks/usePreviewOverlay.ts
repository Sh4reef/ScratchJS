import { useEffect, RefObject } from 'react'

export function usePreviewOverlay(
  containerRef: RefObject<HTMLElement>,
  isVisible: boolean,
  activeTabId: string
) {
  useEffect(() => {
    if (!isVisible || !containerRef.current) {
      window.api.setPreviewVisible(false)
      return
    }

    const updateBounds = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        window.api.setPreviewVisible(false)
        return
      }

      window.api.setPreviewBounds({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      })
      window.api.setPreviewVisible(true)
    }

    updateBounds()

    const resizeObserver = new ResizeObserver(() => {
      updateBounds()
    })
    resizeObserver.observe(containerRef.current)

    window.addEventListener('resize', updateBounds)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateBounds)
      window.api.setPreviewVisible(false)
    }
  }, [containerRef, isVisible, activeTabId])
}
