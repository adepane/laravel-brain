export const LARGE_GRAPH_THRESHOLD = 80
export const PACKET_ANIMATION_THRESHOLD = 40

export const ACCENT_COLORS: Record<string, string> = {
  route: '#4CAF50',
  middleware: '#FF9800',
  controller: '#2196F3',
  action: '#03A9F4',
  service: '#9C27B0',
  model: '#F44336',
  event: '#FFD600',
  job: '#607D8B',
  filament_panel:            '#7C3AED',
  filament_resource:         '#A855F7',
  filament_page:             '#C084FC',
  filament_page_method:      '#E879F9',
  filament_widget:           '#06B6D4',
  filament_relation_manager: '#0891B2',
}

export const BG_COLORS: Record<string, string> = {
  route: '#0C1A0C',
  middleware: '#1C1408',
  controller: '#08141C',
  action: '#07151D',
  service: '#150C1C',
  model: '#1C0C0C',
  event: '#1C1A08',
  job: '#0D1113',
  filament_panel:            '#150C2A',
  filament_resource:         '#1A0C26',
  filament_page:             '#1E0F2E',
  filament_page_method:      '#240E30',
  filament_widget:           '#071A1E',
  filament_relation_manager: '#06161A',
}

export const HIGHLIGHT_COLOR = '#8B6FE8'

export const CC_TIERS = [
  { label: 'Low',      min: 1,  max: 5,          fill: '#0d2e1a', border: '#4ade80' },
  { label: 'Moderate', min: 6,  max: 10,         fill: '#2e2200', border: '#facc15' },
  { label: 'High',     min: 11, max: 15,         fill: '#2e1200', border: '#fb923c' },
  { label: 'Critical', min: 16, max: Infinity,   fill: '#2e0a0a', border: '#f87171' },
]

export function ccTier(cc: number) {
  return CC_TIERS.find(t => cc >= t.min && cc <= t.max) ?? CC_TIERS[0]
}
