import { useEffect, useRef, useMemo } from 'react'
import CytoscapeComponent from 'react-cytoscapejs'
import type { Core, ElementDefinition, NodeSingular, Css } from 'cytoscape'
import cytoscape from 'cytoscape'
// @ts-expect-error: Missing type definitions for cytoscape-dagre
import dagre from 'cytoscape-dagre'
// @ts-expect-error: Missing type definitions for cytoscape-cose-bilkent
import coseBilkent from 'cytoscape-cose-bilkent'

cytoscape.use(dagre)
cytoscape.use(coseBilkent)

import { LARGE_GRAPH_THRESHOLD, ACCENT_COLORS, BG_COLORS, HIGHLIGHT_COLOR } from '../utils/graphConstants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStylesheet(dark: boolean): any[] {
  const edgeLine = dark ? 'rgba(255,255,255, 0.07)' : 'rgba(0,0,0,0.1)'
  const edgeArrow = dark ? 'rgba(255,255,255, 0.12)' : 'rgba(0,0,0,0.15)'
  const edgeLabel = dark ? 'rgba(255,255,255, 0.25)' : 'rgba(0,0,0,0.3)'

  return [
    {
      selector: 'node',
      style: {
        label: (ele: NodeSingular) => {
          let prefix = ''
          if (ele.data('hasN1'))     prefix += '⚠️ '
          if (ele.data('fatMethod')) prefix += '🧱 '
          if (ele.data('fatClass'))  prefix += '🏗️ '
          return prefix + ele.data('label')
        },
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 11,
        'font-weight': 600,
        'font-family': 'ui-monospace, monospace',
        color: '#fff',
        'text-wrap': 'wrap',
        'text-max-width': '140px',
        width: 'label',
        height: 'label',
        padding: '10px 14px',
        shape: 'round-rectangle',
        'background-color': '#181c27',
        'border-width': 1.5,
        'border-color': 'rgba(255,255,255,0.1)',
        'corner-radius': '6px',
      } as Css.Node,
    },
    {
      selector: 'node[hasN1 = 1]',
      style: {
        'border-color': '#F44336',
        'border-width': 2,
        'shadow-blur': 12,
        'shadow-color': '#F44336',
        'shadow-opacity': 0.5,
      } as Css.Node,
    },
    ...Object.entries(ACCENT_COLORS).map(([type, color]) => ({
      selector: `node[type = "${type}"]`,
      style: {
        'border-color': color,
        'background-color': BG_COLORS[type] || '#181c27',
        color: color,
      } as Css.Node,
    })),
    { selector: 'node.dimmed', style: { opacity: 0.1, filter: 'grayscale(100%)' } },
    { selector: 'node.hidden', style: { display: 'none' } },
    {
      selector: 'node:selected',
      style: {
        'border-width': 2.5,
        'border-color': (ele: NodeSingular) => ACCENT_COLORS[ele.data('type')] || '#fff',
        'shadow-blur': 15,
        'shadow-color': (ele: NodeSingular) => ACCENT_COLORS[ele.data('type')] || '#fff',
        'shadow-opacity': 0.8,
        'background-color': (ele: NodeSingular) => {
          const type = ele.data('type')
          return BG_COLORS[type] ? BG_COLORS[type] : '#181c27'
        },
        'overlay-color': '#fff',
        'overlay-padding': 4,
        'overlay-opacity': 0.05,
      } as Css.Node,
    },
    {
      selector: 'edge',
      style: {
        width: 1,
        'line-color': edgeLine,
        'target-arrow-color': edgeArrow,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': 8,
        'font-family': 'ui-monospace, monospace',
        color: edgeLabel,
        'text-rotation': 'autorotate',
        'text-margin-y': -8,
        'text-opacity': 0, // Hidden by default
      } as Css.Edge,
    },
    {
      selector: 'edge.highlighted',
      style: {
        width: 1.5,
        'line-color': HIGHLIGHT_COLOR,
        'target-arrow-color': HIGHLIGHT_COLOR,
        'text-opacity': 1,
        color: HIGHLIGHT_COLOR,
        'z-index': 999,
      } as Css.Edge,
    },
    { selector: 'edge.dimmed', style: { opacity: 0.02 } },
    { selector: 'edge.hidden', style: { display: 'none' } },
  ]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickLayout(name: string, nodeCount: number): any {
  const large = nodeCount > LARGE_GRAPH_THRESHOLD

  if (name === 'dagre') {
    if (large) {
      return { name: 'breadthfirst', directed: true, spacingFactor: 1.4, padding: 40, animate: false }
    }
    return { name: 'dagre', rankDir: 'LR', nodeSep: 40, rankSep: 80, padding: 40, animate: false }
  }
  if (name === 'cose-bilkent') {
    return { name: 'cose-bilkent', animate: false, randomize: false, padding: 40, nodeDimensionsIncludeLabels: true }
  }
  if (name === 'breadthfirst') {
    return { name: 'breadthfirst', directed: true, spacingFactor: 1.4, padding: 40, animate: false }
  }
  return { name, padding: 40, animate: false }
}

interface Props {
  elements: ElementDefinition[]
  layout: string
  searchQuery: string
  visibleTypes: Set<string>
  theme: 'dark' | 'light'
  onNodeSelect: (id: string | null) => void
  cyRef: React.MutableRefObject<Core | null>
}

export function GraphView({ elements, layout, searchQuery, visibleTypes, theme, onNodeSelect, cyRef }: Props) {
  const nodeCount = useMemo(() => elements.filter((e) => !e.data?.source).length, [elements])
  const stylesheet = useMemo(() => buildStylesheet(theme === 'dark'), [theme])
  const prevSearch = useRef(searchQuery)
  const layoutTimeout = useRef<number | null>(null)
  const searchTimeout = useRef<number | null>(null)
  const layoutConfig = useMemo(() => pickLayout(layout, nodeCount), [layout, nodeCount])

  // Search dimming (debounced)
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || prevSearch.current === searchQuery) return
    prevSearch.current = searchQuery

    if (searchTimeout.current) clearTimeout(searchTimeout.current)

    searchTimeout.current = setTimeout(() => {
      cy.startBatch()
      if (!searchQuery) {
        cy.elements().removeClass('dimmed')
      } else {
        const q = searchQuery.toLowerCase()
        const matched = cy.nodes().filter((n) => n.data('label').toLowerCase().includes(q))
        cy.elements().addClass('dimmed')
        matched.removeClass('dimmed')
        matched.connectedEdges().removeClass('dimmed')
      }
      cy.endBatch()
    }, 150)

    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [searchQuery, cyRef])

  // Type visibility & Layout re-run (optimized)
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.startBatch()

    // 1. Hide/Show nodes based on type
    cy.nodes().forEach((n) => {
      const type = n.data('type') as string
      if (visibleTypes.has(type)) {
        n.removeClass('hidden')
      } else {
        n.addClass('hidden')
      }
    })

    // 2. Hide edges if either source or target is hidden
    cy.edges().forEach((e) => {
      const srcVisible = visibleTypes.has(e.source().data('type'))
      const tgtVisible = visibleTypes.has(e.target().data('type'))
      if (srcVisible && tgtVisible) {
        e.removeClass('hidden')
      } else {
        e.addClass('hidden')
      }
    })

    cy.endBatch()

    // 3. Debounced layout re-run
    if (layoutTimeout.current) clearTimeout(layoutTimeout.current)
    layoutTimeout.current = setTimeout(() => {
      const visibleNodes = cy.nodes(':visible')
      if (visibleNodes.length > 0) {
        cy.layout(pickLayout(layout, visibleNodes.length)).run()
      }
    }, 200)

    return () => { if (layoutTimeout.current) clearTimeout(layoutTimeout.current) }
  }, [visibleTypes, layout, cyRef])


  return (
    <CytoscapeComponent
      elements={elements}
      stylesheet={stylesheet}
      layout={layoutConfig}
      style={{ width: '100%', height: '100%' }}
      cy={(cy) => {
        if (cyRef.current === cy) return
        cyRef.current = cy

        // Performance optimizations for Cytoscape
        cy.boxSelectionEnabled(false)

        cy.on('tap', 'node', (evt) => {
          const node = evt.target
          cy.elements().removeClass('highlighted')
          node.connectedEdges().addClass('highlighted')
          onNodeSelect(node.id())
        })

        cy.on('tap', (evt) => {
          if (evt.target === cy) {
            cy.elements().removeClass('highlighted')
            onNodeSelect(null)
          }
        })
      }}
    />
  )
}
