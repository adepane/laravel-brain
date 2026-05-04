import type { GraphData, GraphEdge, SequenceActor, SequenceMessage, SequenceDiagram } from '../types/graph'
import { ACCENT_COLORS } from './graphConstants'

const TYPE_PRIORITY = ['route', 'middleware', 'controller', 'service', 'model', 'job', 'event', 'command', 'channel', 'schedule']

function normalizeType(type: string): string {
  return type === 'action' ? 'controller' : type
}

function shortLabel(label: string): string {
  // Strip namespace prefix, keep last segment
  const parts = label.split('\\')
  const last = parts[parts.length - 1]
  // For routes like "GET /users", keep as-is but truncate
  if (last.length <= 20) return last
  return last.substring(0, 18) + '…'
}

function buildOutgoingMap(edges: GraphEdge[]): Map<string, GraphEdge[]> {
  const map = new Map<string, GraphEdge[]>()
  for (const edge of edges) {
    if (!map.has(edge.source)) map.set(edge.source, [])
    map.get(edge.source)!.push(edge)
  }
  return map
}

export function buildSequenceDiagram(routeNodeId: string, graphData: GraphData): SequenceDiagram {
  const nodeMap = new Map(graphData.nodes.map(n => [n.id, n]))
  const outMap = buildOutgoingMap(graphData.edges)

  // BFS from route node
  const visited = new Set<string>()
  const orderedNodeIds: string[] = []
  const orderedEdges: GraphEdge[] = []
  const queue: string[] = [routeNodeId]
  visited.add(routeNodeId)

  while (queue.length > 0) {
    const current = queue.shift()!
    orderedNodeIds.push(current)
    for (const edge of outMap.get(current) ?? []) {
      orderedEdges.push(edge)
      if (!visited.has(edge.target)) {
        visited.add(edge.target)
        queue.push(edge.target)
      }
    }
  }

  // Build actors: collapse nodes of same canonical type into one actor (first seen wins)
  const actors: SequenceActor[] = []
  const canonTypeToActorIndex = new Map<string, number>()
  const nodeToActorIndex = new Map<string, number>()

  // Sort orderedNodeIds by TYPE_PRIORITY to get deterministic column order
  const sortedNodeIds = [...orderedNodeIds].sort((a, b) => {
    const nodeA = nodeMap.get(a)
    const nodeB = nodeMap.get(b)
    const typeA = nodeA ? normalizeType(nodeA.type) : 'unknown'
    const typeB = nodeB ? normalizeType(nodeB.type) : 'unknown'
    const pa = TYPE_PRIORITY.indexOf(typeA)
    const pb = TYPE_PRIORITY.indexOf(typeB)
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
  })

  for (const nodeId of sortedNodeIds) {
    const node = nodeMap.get(nodeId)
    if (!node) continue
    const canonType = normalizeType(node.type)
    if (!canonTypeToActorIndex.has(canonType)) {
      const idx = actors.length
      canonTypeToActorIndex.set(canonType, idx)
      actors.push({
        id: node.id,
        label: shortLabel(node.label),
        type: canonType,
        color: ACCENT_COLORS[canonType] ?? ACCENT_COLORS[node.type] ?? '#888',
      })
    }
    nodeToActorIndex.set(nodeId, canonTypeToActorIndex.get(canonType)!)
  }

  // Prepend a synthetic "Client" actor
  actors.unshift({ id: '__client__', label: 'Client', type: 'client', color: '#78909C' })
  // Shift all actor indices by 1
  for (const [key, val] of nodeToActorIndex) {
    nodeToActorIndex.set(key, val + 1)
  }
  for (const [key, val] of canonTypeToActorIndex) {
    canonTypeToActorIndex.set(key, val + 1)
  }

  // Append synthetic DB actor if model is present
  let dbActorIndex: number | null = null
  if (canonTypeToActorIndex.has('model')) {
    dbActorIndex = actors.length
    actors.push({ id: '__db__', label: 'Database', type: 'db', color: '#78909C' })
  }

  // Build messages from edges (in BFS traversal order)
  const messages: SequenceMessage[] = []

  // First message: Client → Route
  const routeActorIndex = nodeToActorIndex.get(routeNodeId)
  if (routeActorIndex !== undefined) {
    messages.push({ fromIndex: 0, toIndex: routeActorIndex, label: 'request', isReturn: false })
  }

  // Edges from BFS
  for (const edge of orderedEdges) {
    const from = nodeToActorIndex.get(edge.source)
    const to = nodeToActorIndex.get(edge.target)
    if (from === undefined || to === undefined || from === to) continue
    const isAsync = edge.type === 'dispatches' || edge.type === 'fires' || edge.type === 'queues'
    messages.push({
      fromIndex: from,
      toIndex: to,
      label: edge.label || '',
      isAsync,
    })
  }

  // Synthetic DB query/result messages if model actor exists
  if (dbActorIndex !== null && canonTypeToActorIndex.has('model')) {
    const modelIdx = canonTypeToActorIndex.get('model')!
    messages.push({ fromIndex: modelIdx, toIndex: dbActorIndex, label: 'query', isReturn: false })
    messages.push({ fromIndex: dbActorIndex, toIndex: modelIdx, label: 'result', isReturn: true })
  }

  // Final return: Route → Client
  if (routeActorIndex !== undefined) {
    messages.push({ fromIndex: routeActorIndex, toIndex: 0, label: 'response', isReturn: true })
  }

  // Deduplicate messages with same from/to/label — suffix with ×N count
  const seen = new Map<string, { idx: number; count: number }>()
  const dedupedMessages: SequenceMessage[] = []
  for (const msg of messages) {
    const key = `${msg.fromIndex}|${msg.toIndex}|${msg.label}|${msg.isReturn ? 'r' : ''}|${msg.isAsync ? 'a' : ''}`
    const existing = seen.get(key)
    if (existing) {
      existing.count++
      const baseLabel = msg.label
      dedupedMessages[existing.idx] = {
        ...dedupedMessages[existing.idx],
        label: `${baseLabel} ×${existing.count}`,
      }
    } else {
      seen.set(key, { idx: dedupedMessages.length, count: 1 })
      dedupedMessages.push(msg)
    }
  }

  return { actors, messages: dedupedMessages }
}

export function sequenceDiagramToMermaid(diagram: SequenceDiagram, routeLabel: string): string {
  const lines: string[] = [
    `%% Sequence Diagram — ${routeLabel}`,
    `sequenceDiagram`,
    `  autonumber`,
  ]

  for (const actor of diagram.actors) {
    const safeId = actor.id.replace(/[^a-zA-Z0-9_]/g, '_')
    const displayLabel = actor.label.replace(/"/g, "'")
    if (safeId === actor.label || actor.label === actor.id) {
      lines.push(`  participant ${safeId}`)
    } else {
      lines.push(`  participant ${safeId} as "${displayLabel}"`)
    }
  }

  lines.push(``)

  for (const msg of diagram.messages) {
    const fromId = diagram.actors[msg.fromIndex]?.id.replace(/[^a-zA-Z0-9_]/g, '_') ?? 'Unknown'
    const toId = diagram.actors[msg.toIndex]?.id.replace(/[^a-zA-Z0-9_]/g, '_') ?? 'Unknown'
    const label = msg.label.replace(/"/g, "'")

    let arrow: string
    if (msg.isAsync) {
      arrow = '->>'  // fire-and-forget
    } else if (msg.isReturn) {
      arrow = '-->>'
    } else {
      arrow = '->>'
    }

    lines.push(`  ${fromId}${arrow}${toId}: ${label}`)
  }

  return lines.join('\n')
}
