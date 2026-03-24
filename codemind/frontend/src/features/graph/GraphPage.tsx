import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGraph, useRepo } from '../../api/repos.api'
import Badge from '../../components/Badge'

interface Node { id: string; fullName: string; nodeType: string; x?: number; y?: number; vx?: number; vy?: number }
interface Edge { fromId: string; toId: string; label: string }

const TYPE_COLORS: Record<string, string> = {
  FILE:      '#38bdf8',
  FUNCTION:  '#4ade80',
  CLASS:     '#c084fc',
  METHOD:    '#fb923c',
  INTERFACE: '#22d3ee',
  MODULE:    '#f97316',
  EXPORT:    '#f472b6',
}

export default function GraphPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: repo } = useRepo(id!)
  const { data, isLoading } = useGraph(id!)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState<Node | null>(null)
  const [query, setQuery]       = useState('')
  const [fitted, setFitted]     = useState(false)

  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const isDragging   = useRef(false)
  const lastMouse    = useRef({ x: 0, y: 0 })
  const nodesRef     = useRef<Node[]>([])

  const nodes: Node[] = (data?.nodes ?? []).slice(0, 800).map((n: any) => ({ ...n }))
  const edges: Edge[] = data?.edges ?? []

  useEffect(() => {
    if (!nodes.length) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width  = canvas.offsetWidth
    const H = canvas.height = canvas.offsetHeight

    // Precompute edge degree for variable node size
    const degree = new Map<string, number>()
    edges.forEach((e) => {
      degree.set(e.fromId, (degree.get(e.fromId) ?? 0) + 1)
      degree.set(e.toId,   (degree.get(e.toId)   ?? 0) + 1)
    })

    function nodeRadius(type: string, nid: string): number {
      const deg  = degree.get(nid) ?? 0
      const base = type === 'FILE' ? 7 : type === 'CLASS' ? 5 : 3
      return Math.max(base, base + Math.sqrt(deg) * 1.2)
    }

    // All nodes start near origin — repulsion spreads them organically
    nodes.forEach((n) => {
      n.x  ??= (Math.random() - 0.5) * 80
      n.y  ??= (Math.random() - 0.5) * 80
      n.vx ??= 0
      n.vy ??= 0
    })
    nodesRef.current = nodes

    const nodeMap  = new Map(nodes.map((n) => [n.id, n]))
    let tickCount  = 0
    let didFit     = false
    let animFrame: number

    function autoFit() {
      if (!nodes.length) return
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      nodes.forEach((n) => {
        minX = Math.min(minX, n.x!); maxX = Math.max(maxX, n.x!)
        minY = Math.min(minY, n.y!); maxY = Math.max(maxY, n.y!)
      })
      const pad    = 80
      const graphW = maxX - minX + pad * 2
      const graphH = maxY - minY + pad * 2
      const scale  = Math.min(W / graphW, H / graphH, 2)
      transformRef.current = {
        x:     W / 2 - ((minX + maxX) / 2) * scale,
        y:     H / 2 - ((minY + maxY) / 2) * scale,
        scale,
      }
      setFitted(true)
    }

    function drawArrow(ax: number, ay: number, bx: number, by: number, toR: number) {
      const dx   = bx - ax, dy = by - ay
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const ux   = dx / dist, uy = dy / dist
      const tx   = bx - ux * toR, ty = by - uy * toR
      const { scale } = transformRef.current

      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke()

      const angle = Math.atan2(dy, dx)
      const aSize = Math.max(5, 7 / scale)
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(tx - aSize * Math.cos(angle - 0.4), ty - aSize * Math.sin(angle - 0.4))
      ctx.lineTo(tx - aSize * Math.cos(angle + 0.4), ty - aSize * Math.sin(angle + 0.4))
      ctx.closePath()
      ctx.fill()
    }

    function tick() {
      if (tickCount < 1000) {
        // Repulsion between all pairs
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j]
            const dx = (b.x! - a.x!) || 0.01, dy = (b.y! - a.y!) || 0.01
            const d2 = dx * dx + dy * dy
            const f  = Math.min(3000 / d2, 40)
            a.vx! -= f * dx; a.vy! -= f * dy
            b.vx! += f * dx; b.vy! += f * dy
          }
        }

        // Edge attraction
        edges.forEach(({ fromId, toId, label }) => {
          const a = nodeMap.get(fromId), b = nodeMap.get(toId)
          if (!a || !b) return
          const dx = b.x! - a.x!, dy = b.y! - a.y!
          const d  = Math.sqrt(dx * dx + dy * dy) || 1
          const restDist = label === 'DEFINES' ? 60  : 200
          const strength = label === 'DEFINES' ? 0.015 : 0.005
          const f = (d - restDist) * strength
          a.vx! += f * dx / d; a.vy! += f * dy / d
          b.vx! -= f * dx / d; b.vy! -= f * dy / d
        })

        // Gentle gravity to prevent infinite drift
        nodes.forEach((n) => {
          n.vx! += -n.x! * 0.0008
          n.vy! += -n.y! * 0.0008
          n.vx! *= 0.75; n.vy! *= 0.75
          n.x! += n.vx!   // ← NO CLAMPING — unbounded space
          n.y! += n.vy!
        })

        tickCount++

        // Auto-fit once when simulation finishes
        if (tickCount === 1000 && !didFit) {
          autoFit()
          didFit = true
        }
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      const { x: ox, y: oy, scale } = transformRef.current

      ctx.save()
      ctx.fillStyle = '#030712'
      ctx.fillRect(0, 0, W, H)
      ctx.setTransform(scale, 0, 0, scale, ox, oy)

      // DEFINES edges — subtle blue-gray lines
      ctx.strokeStyle = 'rgba(100, 130, 180, 0.30)'
      ctx.lineWidth   = 0.6 / scale
      ctx.setLineDash([4 / scale, 4 / scale])
      edges.forEach(({ fromId, toId, label }) => {
        if (label !== 'DEFINES') return
        const a = nodeMap.get(fromId), b = nodeMap.get(toId)
        if (!a || !b) return
        ctx.beginPath(); ctx.moveTo(a.x!, a.y!); ctx.lineTo(b.x!, b.y!); ctx.stroke()
      })
      ctx.setLineDash([])

      // IMPORTS edges — amber/orange with arrowhead
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)'
      ctx.fillStyle   = 'rgba(251, 191, 36, 0.55)'
      ctx.lineWidth   = 1 / scale
      edges.forEach(({ fromId, toId, label }) => {
        if (label === 'DEFINES') return
        const a = nodeMap.get(fromId), b = nodeMap.get(toId)
        if (!a || !b) return
        const toR = nodeRadius(b.nodeType, b.id)
        drawArrow(a.x!, a.y!, b.x!, b.y!, toR)
      })

      // Nodes
      nodes.forEach((n) => {
        const r          = nodeRadius(n.nodeType, n.id)
        const isSelected = selected?.id === n.id
        const color      = TYPE_COLORS[n.nodeType] ?? '#6b7280'

        // Glow for selected
        if (isSelected) {
          ctx.shadowBlur  = 18 / scale
          ctx.shadowColor = color
        }

        ctx.beginPath()
        ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()

        if (isSelected) {
          ctx.shadowBlur = 0
          // White ring
          ctx.beginPath()
          ctx.arc(n.x!, n.y!, r + 3 / scale, 0, Math.PI * 2)
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth   = 1.5 / scale
          ctx.stroke()
        }

        // Label
        const showLabel = n.nodeType === 'FILE' || scale > 1.5 || isSelected
        if (showLabel) {
          const label    = n.fullName.split('/').pop()?.replace(/::.*$/, '') ?? ''
          const fontSize = Math.max(8 / scale, 7)
          ctx.font       = `${fontSize}px -apple-system, monospace`
          ctx.textAlign  = 'center'
          ctx.fillStyle  = isSelected ? '#ffffff' : 'rgba(200,210,220,0.85)'
          ctx.fillText(label, n.x!, n.y! + r + (11 / scale))
        }
      })

      ctx.restore()

      animFrame = requestAnimationFrame(tick)
    }

    tick()
    return () => cancelAnimationFrame(animFrame)
  }, [data, selected])

  // ── Zoom ────────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.12 : 0.9
    const t = transformRef.current
    const newScale = Math.max(0.05, Math.min(10, t.scale * factor))
    transformRef.current = {
      x:     mx - (mx - t.x) * (newScale / t.scale),
      y:     my - (my - t.y) * (newScale / t.scale),
      scale: newScale,
    }
  }, [])

  // ── Pan ─────────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    lastMouse.current  = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return
    transformRef.current.x += e.clientX - lastMouse.current.x
    transformRef.current.y += e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseUp = useCallback(() => { isDragging.current = false }, [])

  // ── Click to select ─────────────────────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const { x: ox, y: oy, scale } = transformRef.current
    const gx = (e.clientX - rect.left - ox) / scale
    const gy = (e.clientY - rect.top  - oy) / scale

    let closest: Node | null = null
    let minDist = 24 / scale

    for (const n of nodesRef.current) {
      const dx = n.x! - gx, dy = n.y! - gy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < minDist) { minDist = d; closest = n }
    }
    setSelected(closest)
  }, [])

  const filtered   = query ? nodes.filter((n) => n.fullName.toLowerCase().includes(query.toLowerCase())).slice(0, 20) : []
  const defEdges   = edges.filter((e) => e.label === 'DEFINES').length
  const impEdges   = edges.filter((e) => e.label !== 'DEFINES').length

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <div className="flex w-64 flex-col border-r border-gray-800 bg-gray-900 p-4">
        <button onClick={() => navigate('/')} className="mb-4 text-sm text-gray-400 hover:text-white">← Back</button>
        <h2 className="mb-1 font-bold truncate">{repo?.fullName ?? 'Graph'}</h2>
        <p className="text-xs text-gray-500">{nodes.length} nodes · {edges.length} edges</p>
        <p className="mb-4 text-xs text-gray-600">{defEdges} defines · {impEdges} imports</p>

        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes..."
          className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none"
        />

        {filtered.length > 0 && (
          <div className="mb-3 max-h-40 overflow-y-auto space-y-0.5">
            {filtered.map((n) => (
              <button key={n.id} onClick={() => setSelected(n)}
                className="w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-800 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[n.nodeType] }} />
                <span className="truncate text-gray-300">{n.fullName.split('/').pop()}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mb-3 rounded-lg border border-gray-700 bg-gray-800 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: TYPE_COLORS[selected.nodeType] }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[selected.nodeType] }} />
                {selected.nodeType}
              </span>
              <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-white">✕</button>
            </div>
            <p className="break-all text-xs text-gray-300 mt-1">{selected.fullName}</p>
          </div>
        )}

        <div className="mt-auto">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Nodes</p>
          <div className="space-y-1 mb-3">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-2 text-xs text-gray-400">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {type}
              </div>
            ))}
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Edges</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="block h-px w-5 border-t border-dashed" style={{ borderColor: 'rgba(100,130,180,0.6)' }} />
              DEFINES
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="block h-px w-5" style={{ backgroundColor: 'rgba(251,191,36,0.7)' }} />
              IMPORTS
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-600">Scroll · Drag · Click</p>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        )}
        {!isLoading && !fitted && nodes.length > 0 && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 text-xs text-gray-500 pointer-events-none">
            Simulating layout…
          </div>
        )}
        {!isLoading && edges.length === 0 && nodes.length > 0 && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-yellow-800 bg-yellow-900/30 px-4 py-2 text-xs text-yellow-400">
            No edges — re-ingest to generate the dependency graph
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleCanvasClick}
        />
        <button onClick={() => navigate(`/repos/${id}/tasks/new`)}
          className="absolute bottom-4 right-4 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 shadow-lg">
          Request a Change →
        </button>
      </div>
    </div>
  )
}
