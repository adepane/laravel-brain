import type { GraphNode } from '../types/graph'
import { Tooltip } from './Tooltip'

const NODE_TYPES: { type: GraphNode['type']; label: string; color: string; tip: string }[] = [
  { type: 'route', label: 'Routes', color: '#4CAF50', tip: 'HTTP route entry points (method + URI) into your application.' },
  { type: 'middleware', label: 'Middleware', color: '#FF9800', tip: 'Pipeline classes that wrap requests before they reach controllers.' },
  { type: 'controller', label: 'Controllers', color: '#2196F3', tip: 'Controller classes that orchestrate HTTP requests.' },
  { type: 'action', label: 'Actions', color: '#03A9F4', tip: 'Controller methods or invokable actions that run for a route.' },
  { type: 'service', label: 'Services', color: '#9C27B0', tip: 'Injected services and domain/helper classes resolved from the container.' },
  { type: 'validation_request', label: 'Validation requests', color: '#0d9488', tip: 'Form request classes that validate and authorize input.' },
  { type: 'model', label: 'Models', color: '#F44336', tip: 'Eloquent models and data-layer classes.' },
  { type: 'event', label: 'Events', color: '#FFD600', tip: 'Domain events dispatched on the event bus.' },
  { type: 'job', label: 'Jobs', color: '#607D8B', tip: 'Queueable jobs for background work.' },
  { type: 'command', label: 'Commands', color: '#14b8a6', tip: 'Artisan console commands.' },
  { type: 'channel', label: 'Channels', color: '#8b5cf6', tip: 'Broadcast channels for realtime messaging.' },
  { type: 'schedule', label: 'Schedules', color: '#f97316', tip: 'Scheduled task definitions (cron / scheduler).' },
  { type: 'view', label: 'Views', color: '#ec4899', tip: 'Blade templates and view names returned from controllers.' },
  { type: 'mail', label: 'Mail', color: '#f472b6', tip: 'Mailable classes.' },
  { type: 'notification', label: 'Notifications', color: '#db2777', tip: 'Notification classes (mail, database, etc.).' },
  { type: 'enum', label: 'Enums', color: '#0ea5e9', tip: 'PHP backed enums referenced from analyzed code.' },
  { type: 'interface', label: 'Interfaces', color: '#38bdf8', tip: 'PHP interfaces implemented or type-hinted in this graph.' },
  { type: 'trait', label: 'Traits', color: '#a78bfa', tip: 'PHP traits used by classes in this lifecycle.' },
  { type: 'abstract_class', label: 'Abstract classes', color: '#94a3b8', tip: 'Abstract base classes extended in this path.' },
  { type: 'service_provider', label: 'Service providers', color: '#ca8a04', tip: 'Service providers that register bindings and boot logic.' },
  { type: 'filament_panel', label: 'Filament Panels', color: '#7C3AED', tip: 'Filament panel configuration (admin area).' },
  { type: 'filament_resource', label: 'Filament Resources', color: '#A855F7', tip: 'Filament CRUD resources for Eloquent models.' },
  { type: 'filament_page', label: 'Filament Pages', color: '#C084FC', tip: 'Custom Filament pages (non-resource screens).' },
  { type: 'filament_page_method', label: 'Page Methods', color: '#E879F9', tip: 'Methods on Filament pages (actions, hooks).' },
  { type: 'filament_widget', label: 'Filament Widgets', color: '#06B6D4', tip: 'Filament dashboard or resource widgets.' },
  { type: 'filament_relation_manager', label: 'Relation Managers', color: '#0891B2', tip: 'Filament relation managers on resource edit pages.' },
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
        <Tooltip content="Show or hide node categories in the graph. Edges to hidden types may disappear.">
          <span className="filter-title">Filters</span>
        </Tooltip>
        <div className="filter-actions">
          <Tooltip content="Show every node type that appears in this graph.">
            <button type="button" onClick={onShowAll} className="filter-link">
              all
            </button>
          </Tooltip>
          <span className="filter-sep">·</span>
          <Tooltip content="Hide all types (graph may be empty until you re-enable some).">
            <button type="button" onClick={onHideAll} className="filter-link">
              none
            </button>
          </Tooltip>
        </div>
      </div>

      {NODE_TYPES.map(({ type, label, color, tip }) => {
        const count = counts[type] ?? 0
        if (count === 0) return null
        const checked = visibleTypes.has(type)
        return (
          <Tooltip key={type} content={tip}>
            <label className={`filter-item ${!checked ? 'filter-item--dim' : ''}`}>
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
          </Tooltip>
        )
      })}
    </div>
  )
}
