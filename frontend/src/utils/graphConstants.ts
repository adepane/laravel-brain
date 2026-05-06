export const LARGE_GRAPH_THRESHOLD = 80
export const PACKET_ANIMATION_THRESHOLD = 40

export const ACCENT_COLORS: Record<string, string> = {
  route:      '#4CAF50',
  middleware: '#FF9800',
  controller: '#2196F3',
  action:     '#03A9F4',
  service:    '#9C27B0',
  model:      '#F44336',
  event:      '#FFD600',
  job:        '#607D8B',
  command:    '#14b8a6',
  channel:    '#8b5cf6',
  schedule:   '#f97316',
  filament_panel:            '#7C3AED',
  filament_resource:         '#A855F7',
  filament_page:             '#C084FC',
  filament_page_method:      '#E879F9',
  filament_widget:           '#06B6D4',
  filament_relation_manager: '#0891B2',
}

/** Darkened accent colours for text / icons on light card backgrounds */
export const ACCENT_COLORS_LIGHT: Record<string, string> = {
  route:      '#2e7d32',
  middleware: '#e65100',
  controller: '#1565c0',
  action:     '#0277bd',
  service:    '#6a1b9a',
  model:      '#c62828',
  event:      '#b45309',
  job:        '#37474f',
  command:    '#0d7d6e',
  channel:    '#5b21b6',
  schedule:   '#c2410c',
  filament_panel:            '#5b21b6',
  filament_resource:         '#7e22ce',
  filament_page:             '#9333ea',
  filament_page_method:      '#a21caf',
  filament_widget:           '#0369a1',
  filament_relation_manager: '#075985',
}

/** Dark-mode node background colours (deep tinted darks) */
export const BG_COLORS: Record<string, string> = {
  route:      '#0C1A0C',
  middleware: '#1C1408',
  controller: '#08141C',
  action:     '#07151D',
  service:    '#150C1C',
  model:      '#1C0C0C',
  event:      '#1C1A08',
  job:        '#0D1113',
  command:    '#061514',
  channel:    '#110c1c',
  schedule:   '#1c1008',
  filament_panel:            '#150C2A',
  filament_resource:         '#1A0C26',
  filament_page:             '#1E0F2E',
  filament_page_method:      '#240E30',
  filament_widget:           '#071A1E',
  filament_relation_manager: '#06161A',
}

/** Light-mode node background colours (soft tinted pastels) */
export const BG_COLORS_LIGHT: Record<string, string> = {
  route:      '#f0fdf4',
  middleware: '#fff7ed',
  controller: '#eff6ff',
  action:     '#e0f7fa',
  service:    '#fdf4ff',
  model:      '#fff1f2',
  event:      '#fefce8',
  job:        '#f1f5f9',
  command:    '#f0fdfa',
  channel:    '#f5f3ff',
  schedule:   '#fff7ed',
  filament_panel:            '#f5f3ff',
  filament_resource:         '#faf5ff',
  filament_page:             '#fdf4ff',
  filament_page_method:      '#fef0ff',
  filament_widget:           '#ecfeff',
  filament_relation_manager: '#e0f2fe',
}

export const HIGHLIGHT_COLOR = '#8B6FE8'

export const CC_TIERS = [
  { label: 'Low',      min: 1,  max: 5,        fill: '#0d2e1a', border: '#4ade80' },
  { label: 'Moderate', min: 6,  max: 10,       fill: '#2e2200', border: '#facc15' },
  { label: 'High',     min: 11, max: 15,       fill: '#2e1200', border: '#fb923c' },
  { label: 'Critical', min: 16, max: Infinity, fill: '#2e0a0a', border: '#f87171' },
]

export const CC_TIERS_LIGHT = [
  { label: 'Low',      min: 1,  max: 5,        fill: '#f0fdf4', border: '#16a34a' },
  { label: 'Moderate', min: 6,  max: 10,       fill: '#fefce8', border: '#ca8a04' },
  { label: 'High',     min: 11, max: 15,       fill: '#fff7ed', border: '#ea580c' },
  { label: 'Critical', min: 16, max: Infinity, fill: '#fff1f2', border: '#dc2626' },
]

export function ccTier(cc: number, dark = true) {
  const tiers = dark ? CC_TIERS : CC_TIERS_LIGHT
  return tiers.find(t => cc >= t.min && cc <= t.max) ?? tiers[0]
}
