import { useRef, useState, useCallback, useMemo } from 'react'
import { FilterPanel } from './FilterPanel'
import type { TabEntry } from '../types/graph'

interface PrefixGroup {
  prefix: string
  tabs: TabEntry[]
}

interface FileGroup {
  fileName: string
  prefixGroups: PrefixGroup[]
}

interface Props {
  allTab: TabEntry | null
  fileGroups: FileGroup[]
  activeId: string | null
  loadingId: string | null
  onSelect: (tab: TabEntry) => void
  visibleTypes: Set<string>
  counts: Record<string, number>
  onToggle: (type: string) => void
  onShowAll: () => void
  onHideAll: () => void
}

const METHOD_COLORS: Record<string, string> = {
  GET:    '#4ade80',
  POST:   '#60a5fa',
  PUT:    '#f59e0b',
  PATCH:  '#a78bfa',
  DELETE: '#f87171',
}

function RouteItem({ tab, isActive, isLoading, onSelect }: {
  tab: TabEntry
  isActive: boolean
  isLoading: boolean
  onSelect: (tab: TabEntry) => void
}) {
  const [first, ...rest] = tab.label.split(' ')
  const hasMethod = first in METHOD_COLORS
  const method = hasMethod ? first : null
  const uri    = hasMethod ? rest.join(' ') : tab.label
  const color  = method ? METHOD_COLORS[method] : '#94a3b8'

  return (
    <button
      className={`left-nav-item ${isActive ? 'left-nav-item--active' : ''}`}
      onClick={() => onSelect(tab)}
      title={`${tab.nodeCount} nodes · ${tab.edgeCount} edges`}
    >
      {method
        ? <span className="left-nav-method" style={{ color }}>{method}</span>
        : <span className="left-nav-method" style={{ color }}>›</span>
      }
      <span className="left-nav-uri">{uri}</span>
      {isLoading && <span className="left-nav-badge">…</span>}
    </button>
  )
}

export function LeftSidebar({
  allTab, fileGroups, activeId, loadingId, onSelect,
  visibleTypes, counts, onToggle, onShowAll, onHideAll,
}: Props) {
  const [topHeight, setTopHeight] = useState(320)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)

  // Track collapsed state for files and prefixes
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [collapsedPrefixes, setCollapsedPrefixes] = useState<Set<string>>(new Set())

  const toggleFile = (fileName: string) =>
    setCollapsedFiles((s) => {
      const n = new Set(s)
      n.has(fileName) ? n.delete(fileName) : n.add(fileName)
      return n
    })

  const togglePrefix = (key: string) =>
    setCollapsedPrefixes((s) => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragStartY.current = e.clientY
    dragStartHeight.current = topHeight

    const onMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const delta = e.clientY - dragStartY.current
      const totalHeight = container.clientHeight
      setTopHeight(Math.max(80, Math.min(totalHeight - 80, dragStartHeight.current + delta)))
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [topHeight])

  const filteredFileGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return fileGroups
    return fileGroups
      .map((fg) => ({
        ...fg,
        prefixGroups: fg.prefixGroups
          .map((pg) => ({ ...pg, tabs: pg.tabs.filter((t) => t.label.toLowerCase().includes(q)) }))
          .filter((pg) => pg.tabs.length > 0),
      }))
      .filter((fg) => fg.prefixGroups.length > 0)
  }, [fileGroups, search])

  return (
    <div className="left-sidebar" ref={containerRef}>
      <div className="left-sidebar-top" style={{ height: topHeight }}>

        <div className="left-nav-search">
          <input
            className="left-nav-search-input"
            type="text"
            placeholder="Search routes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="left-nav-search-clear" onClick={() => setSearch('')}>×</button>
          )}
        </div>

        <div className="left-nav">

          {/* All-routes overview tab */}
          {allTab && (
            <div className="left-nav-overview">
              <button
                className={`left-nav-item left-nav-item--all ${activeId === allTab.id ? 'left-nav-item--active' : ''}`}
                onClick={() => onSelect(allTab)}
                title={`${allTab.nodeCount} nodes · ${allTab.edgeCount} edges`}
              >
                <span className="left-nav-all-icon">◈</span>
                <span className="left-nav-uri">All Routes</span>
                <span className="left-nav-badge">{allTab.routeCount}</span>
              </button>
            </div>
          )}

          {/* File groups → prefix groups → routes */}
          {filteredFileGroups.map((fg) => {
            const fileOpen = !collapsedFiles.has(fg.fileName)
            const totalRoutes = fg.prefixGroups.reduce((s, pg) => s + pg.tabs.length, 0)

            return (
              <div key={fg.fileName} className="left-nav-file-group">
                <button
                  className="left-nav-file-header"
                  onClick={() => toggleFile(fg.fileName)}
                  title={fg.fileName}
                >
                  <span className="left-nav-file-chevron">{fileOpen ? '▾' : '▸'}</span>
                  <span className="left-nav-file-icon">📄</span>
                  <span className="left-nav-file-name">{fg.fileName}</span>
                  <span className="left-nav-file-count">{totalRoutes}</span>
                </button>

                {fileOpen && fg.prefixGroups.map((pg) => {
                  // '_flat' = non-HTTP tabs (commands/channels): no prefix wrapper
                  if (pg.prefix === '_flat') {
                    return pg.tabs.map((tab) => (
                      <RouteItem
                        key={tab.id}
                        tab={tab}
                        isActive={tab.id === activeId}
                        isLoading={tab.id === loadingId}
                        onSelect={onSelect}
                      />
                    ))
                  }

                  const prefixKey = `${fg.fileName}::${pg.prefix}`
                  const prefixOpen = !collapsedPrefixes.has(prefixKey)

                  return (
                    <div key={pg.prefix} className="left-nav-prefix-group">
                      <button
                        className="left-nav-prefix-header"
                        onClick={() => togglePrefix(prefixKey)}
                      >
                        <span className="left-nav-prefix-chevron">{prefixOpen ? '▾' : '▸'}</span>
                        <span className="left-nav-prefix-name">/{pg.prefix}</span>
                        <span className="left-nav-prefix-count">{pg.tabs.length}</span>
                      </button>

                      {prefixOpen && pg.tabs.map((tab) => (
                        <RouteItem
                          key={tab.id}
                          tab={tab}
                          isActive={tab.id === activeId}
                          isLoading={tab.id === loadingId}
                          onSelect={onSelect}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <div className="left-sidebar-handle" onMouseDown={onMouseDown} />

      <div className="left-sidebar-bottom">
        <FilterPanel
          visibleTypes={visibleTypes}
          counts={counts}
          onToggle={onToggle}
          onShowAll={onShowAll}
          onHideAll={onHideAll}
        />
      </div>
    </div>
  )
}
