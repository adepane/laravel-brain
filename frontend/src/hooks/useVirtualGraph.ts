import { useEffect, useState, useMemo } from 'react'
import type { ElementDefinition } from 'cytoscape'

/**
 * useVirtualGraph
 * For very large graphs, we don't want to dump 1000+ elements into Cytoscape at once.
 * This hook progressively adds elements to the graph in chunks.
 */
export function useVirtualGraph(elements: ElementDefinition[], threshold = 300) {
  const [limit, setLimit] = useState(threshold)

  // Reset limit when elements change (e.g. tab switch)
  useEffect(() => {
    setLimit(threshold)
  }, [elements, threshold])

  // Progressively increase limit using requestIdleCallback if available, or setTimeout
  useEffect(() => {
    if (limit >= elements.length) return

    const nextFrame = (window as any).requestIdleCallback 
      ? (window as any).requestIdleCallback 
      : (cb: any) => setTimeout(cb, 100)

    const handle = nextFrame(() => {
      setLimit(prev => Math.min(prev + 200, elements.length))
    })

    return () => {
      if ((window as any).cancelIdleCallback) (window as any).cancelIdleCallback(handle)
      else clearTimeout(handle)
    }
  }, [limit, elements.length])

  const virtualElements = useMemo(() => {
    if (elements.length <= threshold) return elements
    return elements.slice(0, limit)
  }, [elements, limit, threshold])

  return virtualElements
}
