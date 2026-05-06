import type { GraphNode } from '../types/graph'

const NODE_TYPES: { type: GraphNode['type']; label: string; color: string }[] = [
  { type: 'route',      label: 'Routes',      color: '#4CAF50' },
  { type: 'middleware', label: 'Middleware',   color: '#FF9800' },
  { type: 'controller', label: 'Controllers', color: '#2196F3' },
  { type: 'action',     label: 'Actions',     color: '#03A9F4' },
  { type: 'service',    label: 'Services',    color: '#9C27B0' },
  { type: 'validation_request', label: 'Validation requests', color: '#0d9488' },
  { type: 'model',      label: 'Models',      color: '#F44336' },
  { type: 'event',      label: 'Events',      color: '#FFD600' },
  { type: 'job',        label: 'Jobs',        color: '#607D8B' },
  { type: 'command',    label: 'Commands',    color: '#14b8a6' },
  { type: 'channel',    label: 'Channels',    color: '#8b5cf6' },
  { type: 'schedule',   label: 'Schedules',   color: '#f97316' },
  { type: 'view',       label: 'Views',       color: '#ec4899' },
  { type: 'mail',       label: 'Mail',         color: '#f472b6' },
  { type: 'notification', label: 'Notifications', color: '#db2777' },
  { type: 'enum',       label: 'Enums',       color: '#0ea5e9' },
  { type: 'interface',  label: 'Interfaces',  color: '#38bdf8' },
  { type: 'trait',      label: 'Traits',        color: '#a78bfa' },
  { type: 'abstract_class', label: 'Abstract classes', color: '#94a3b8' },
  { type: 'service_provider', label: 'Service providers', color: '#ca8a04' },
  { type: 'filament_panel',            label: 'Filament Panels',    color: '#7C3AED' },
  { type: 'filament_resource',         label: 'Filament Resources', color: '#A855F7' },
  { type: 'filament_page',             label: 'Filament Pages',     color: '#C084FC' },
  { type: 'filament_page_method',      label: 'Page Methods',       color: '#E879F9' },
  { type: 'filament_widget',           label: 'Filament Widgets',   color: '#06B6D4' },
  { type: 'filament_relation_manager', label: 'Relation Managers',  color: '#0891B2' },
]

interface Props {
  visibleTypes: Set<string>
  counts: Record<string, number>
  onToggle: (type: string) => void
  onShowAll: () => void
  onHideAll: () => void
}

export function FilterPanel({ visibleTypes, counts, onToggle, onShowAll, onHideAll }: Props) {
  return (
    <div className="filter-panel">
      <div className="filter-header">
        <span className="filter-title">Filters</span>
        <div className="filter-actions">
          <button onClick={onShowAll} className="filter-link">all</button>
          <span className="filter-sep">·</span>
          <button onClick={onHideAll} className="filter-link">none</button>
        </div>
      </div>

      {NODE_TYPES.map(({ type, label, color }) => {
        const count = counts[type] ?? 0
        if (count === 0) return null
        const checked = visibleTypes.has(type)
        return (
          <label key={type} className={`filter-item ${!checked ? 'filter-item--dim' : ''}`}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(type)}
              className="filter-checkbox"
            />
            <span className="filter-dot" style={{ backgroundColor: color }} />
            <span className="filter-label">{label}</span>
            <span className="filter-count">{count}</span>
          </label>
        )
      })}
    </div>
  )
}
