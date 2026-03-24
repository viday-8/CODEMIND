import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGraph, useRepo } from '../../api/repos.api'

// ── Constants ────────────────────────────────────────────────────────────────
const FOV = 600
const STEP = 0.26 // ~15° rotation per button press

const TYPE_COLORS: Record<string, string> = {
  MODULE:    '#f97316',
  FILE:      '#38bdf8',
  CLASS:     '#c084fc',
  INTERFACE: '#22d3ee',
  METHOD:    '#fb923c',
  FUNCTION:  '#4ade80',
  EXPORT:    '#f472b6',
}

const TYPE_BASE_RADIUS: Record<string, number> = {
  MODULE:    18,
  FILE:      12,
  CLASS:      9,
  INTERFACE:  7,
  METHOD:     6,
  FUNCTION:   5,
  EXPORT:     4,
}

const ALWAYS_LABEL = new Set(['MODULE', 'FILE', 'CLASS', 'FUNCTION', 'METHOD'])

// ── Types ─────────────────────────────────────────────────────────────────────
interface Node {
  id: string; fullName: string; name: string; nodeType: string
  startLine?: number; endLine?: number
  x?: number; y?: number; z?: number
  vx?: number; vy?: number; vz?: number
}
interface Edge { fromId: string; toId: string; label: string }

interface Camera {
  rotX: number; rotY: number; distance: number; panX: number; panY: number
}

interface CameraAnim {
  active: boolean
  startRotX: number; startRotY: number; startDist: number; startPanX: number; startPanY: number
  endRotX: number;   endRotY: number;   endDist: number;   endPanX: number;   endPanY: number
  startTime: number; duration: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function easeOut(t: number) { return 1 - Math.pow(1 - t, 3) }

function nodeBaseRadius(type: string): number {
  return TYPE_BASE_RADIUS[type] ?? 5
}

function project3D(wx: number, wy: number, wz: number, cam: Camera, W: number, H: number) {
  const cosY = Math.cos(cam.rotY), sinY = Math.sin(cam.rotY)
  const rx  =  wx * cosY - wz * sinY
  const rz0 =  wx * sinY + wz * cosY
  const cosX = Math.cos(cam.rotX), sinX = Math.sin(cam.rotX)
  const ry  =  wy * cosX - rz0 * sinX
  const rz  =  wy * sinX + rz0 * cosX
  const depth = rz + cam.distance
  const s = FOV / Math.max(depth, 50)
  return { sx: rx * s + W / 2 + cam.panX, sy: ry * s + H / 2 + cam.panY, screenScale: s, depth }
}

function hexToRgb(hex: string): string {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r)
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r)
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y)
  ctx.closePath()
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GraphPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: repo } = useRepo(id!)
  const { data, isLoading } = useGraph(id!)

  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const cameraRef      = useRef<Camera>({ rotX: -0.3, rotY: 0, distance: 1500, panX: 0, panY: 0 })
  const initialDistRef = useRef(1500)
  const maxDistRef     = useRef(12000)
  const zoomVelRef     = useRef(0)
  const isDragging     = useRef(false)
  const didDrag        = useRef(false)
  const mouseMode      = useRef<'pan' | 'rotate'>('pan')
  const lastMouse      = useRef({ x: 0, y: 0 })
  const nodesRef       = useRef<Node[]>([])
  const selectedRef    = useRef<Node | null>(null)
  const highlightedRef = useRef<Set<string>>(new Set())
  const hoverRef       = useRef<Node | null>(null)
  const cameraAnimRef  = useRef<CameraAnim>({
    active: false,
    startRotX:0, startRotY:0, startDist:1500, startPanX:0, startPanY:0,
    endRotX:0,   endRotY:0,   endDist:1500,   endPanX:0,   endPanY:0,
    startTime:0, duration:450,
  })

  const [selected,    setSelected]    = useState<Node | null>(null)
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set())
  const [hoverNode,   setHoverNode]   = useState<Node | null>(null)
  const [query,       setQuery]       = useState('')
  const [fitted,      setFitted]      = useState(false)
  const [legendOpen,  setLegendOpen]  = useState(false)
  const [isRotating,  setIsRotating]  = useState(false)

  useEffect(() => { selectedRef.current    = selected    }, [selected])
  useEffect(() => { highlightedRef.current = highlighted }, [highlighted])
  useEffect(() => { hoverRef.current       = hoverNode   }, [hoverNode])

  const nodes = useMemo(
    () => (data?.nodes ?? []).slice(0, 800).map((n: any) => ({ ...n })) as Node[],
    [data]
  )
  const edges: Edge[] = useMemo(() => data?.edges ?? [], [data])
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  // Search
  useEffect(() => {
    if (!query.trim()) { setHighlighted(new Set()); return }
    const q = query.toLowerCase()
    const ids = new Set<string>()
    for (const n of nodes) {
      if (n.name?.toLowerCase().includes(q) || n.fullName.toLowerCase().includes(q) || n.nodeType.toLowerCase().includes(q))
        ids.add(n.id)
    }
    setHighlighted(ids)
  }, [query, nodes])

  // Zoom-to-node (3D)
  const zoomToNode = useCallback((node: Node) => {
    const canvas = canvasRef.current
    if (!canvas || node.x == null) return
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    const cam = cameraRef.current
    const { sx, sy } = project3D(node.x, node.y ?? 0, node.z ?? 0, cam, W, H)
    const endDist = Math.max(80, initialDistRef.current * 0.2)
    cameraAnimRef.current = {
      active: true,
      startRotX: cam.rotX, startRotY: cam.rotY, startDist: cam.distance,
      startPanX: cam.panX, startPanY: cam.panY,
      endRotX: cam.rotX, endRotY: cam.rotY, endDist,
      endPanX: cam.panX + (W / 2 - sx),
      endPanY: cam.panY + (H / 2 - sy),
      startTime: performance.now(), duration: 550,
    }
  }, [])

  // ── Main render/physics loop ──────────────────────────────────────────────
  useEffect(() => {
    if (!nodes.length) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width  = canvas.offsetWidth
    const H = canvas.height = canvas.offsetHeight

    const degree = new Map<string, number>()
    edges.forEach((e) => {
      degree.set(e.fromId, (degree.get(e.fromId) ?? 0) + 1)
      degree.set(e.toId,   (degree.get(e.toId)   ?? 0) + 1)
    })

    function nodeRadius(type: string, nid: string): number {
      const base = TYPE_BASE_RADIUS[type] ?? 5
      const deg  = degree.get(nid) ?? 0
      return Math.max(base, base + Math.sqrt(deg) * 1.5)
    }

    // Init 3D positions
    nodes.forEach((n) => {
      n.x  ??= (Math.random() - 0.5) * 80
      n.y  ??= (Math.random() - 0.5) * 80
      n.z  ??= (Math.random() - 0.5) * 80
      n.vx ??= 0; n.vy ??= 0; n.vz ??= 0
    })
    nodesRef.current = nodes
    const localNodeMap = new Map(nodes.map((n) => [n.id, n]))
    let tickCount = 0, didFit = false
    let animFrame: number

    function autoFit() {
      let maxR = 0
      nodes.forEach((n) => {
        const r = Math.sqrt(n.x! ** 2 + n.y! ** 2 + n.z! ** 2)
        if (r > maxR) maxR = r
      })
      const dist = Math.max(300, Math.min(maxR * 2.8, 3000))
      cameraRef.current.distance = dist
      initialDistRef.current     = dist
      maxDistRef.current         = dist * 4
      cameraRef.current.panX     = 0
      cameraRef.current.panY     = 0
      setFitted(true)
    }

    function tick() {
      // ── Physics (3D) ──────────────────────────────────────────────────
      if (tickCount < 1000) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j]
            const dx = (b.x! - a.x!) || 0.01, dy = (b.y! - a.y!) || 0.01, dz = (b.z! - a.z!) || 0.01
            const d2 = dx*dx + dy*dy + dz*dz
            const f  = Math.min(3000 / d2, 40)
            a.vx! -= f*dx; a.vy! -= f*dy; a.vz! -= f*dz
            b.vx! += f*dx; b.vy! += f*dy; b.vz! += f*dz
          }
        }
        edges.forEach(({ fromId, toId, label }) => {
          const a = localNodeMap.get(fromId), b = localNodeMap.get(toId)
          if (!a || !b) return
          const dx = b.x! - a.x!, dy = b.y! - a.y!, dz = b.z! - a.z!
          const d = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1
          const restDist = label === 'DEFINES' ? 100 : 250
          const strength = label === 'DEFINES' ? 0.015 : 0.005
          const f = (d - restDist) * strength
          a.vx! += f*dx/d; a.vy! += f*dy/d; a.vz! += f*dz/d
          b.vx! -= f*dx/d; b.vy! -= f*dy/d; b.vz! -= f*dz/d
        })
        nodes.forEach((n) => {
          n.vx! += -n.x! * 0.0008; n.vy! += -n.y! * 0.0008; n.vz! += -n.z! * 0.0008
          n.vx! *= 0.75; n.vy! *= 0.75; n.vz! *= 0.75
          n.x! += n.vx!; n.y! += n.vy!; n.z! += n.vz!
        })
        tickCount++
        if (tickCount === 1000 && !didFit) { autoFit(); didFit = true }
      }

      // ── Camera animation ──────────────────────────────────────────────
      const camAnim = cameraAnimRef.current
      if (camAnim.active) {
        const progress = Math.min((performance.now() - camAnim.startTime) / camAnim.duration, 1)
        const t = easeOut(progress)
        cameraRef.current = {
          rotX:     camAnim.startRotX + (camAnim.endRotX - camAnim.startRotX) * t,
          rotY:     camAnim.startRotY + (camAnim.endRotY - camAnim.startRotY) * t,
          distance: camAnim.startDist + (camAnim.endDist - camAnim.startDist) * t,
          panX:     camAnim.startPanX + (camAnim.endPanX - camAnim.startPanX) * t,
          panY:     camAnim.startPanY + (camAnim.endPanY - camAnim.startPanY) * t,
        }
        if (progress >= 1) camAnim.active = false
      }

      // ── Zoom inertia ─────────────────────────────────────────────────
      if (Math.abs(zoomVelRef.current) > 0.0001) {
        const c = cameraRef.current
        c.distance = Math.max(5, Math.min(maxDistRef.current, c.distance * (1 + zoomVelRef.current)))
        zoomVelRef.current *= 0.85
      }

      // ── Draw ─────────────────────────────────────────────────────────
      const cam = cameraRef.current
      const sel = selectedRef.current
      const hi  = highlightedRef.current
      const hov = hoverRef.current
      const now = performance.now()
      const hasHighlight = hi.size > 0

      // Background
      ctx.save()
      const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.7)
      bg.addColorStop(0, '#0d1117'); bg.addColorStop(1, '#030712')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

      // Project all nodes + sort far→near (painter's algorithm)
      const projected = nodes.map((n) => ({ n, ...project3D(n.x!, n.y!, n.z!, cam, W, H) }))
      projected.sort((a, b) => b.depth - a.depth)
      const projMap = new Map(projected.map((p) => [p.n.id, p]))

      // ── Edges ────────────────────────────────────────────────────────
      edges.forEach(({ fromId, toId, label }) => {
        const pa = projMap.get(fromId), pb = projMap.get(toId)
        if (!pa || !pb) return
        const dim = hasHighlight && !hi.has(fromId) && !hi.has(toId) && sel?.id !== fromId && sel?.id !== toId
        const avgFade = Math.max(0.25, 1 - (pa.depth + pb.depth) / 2 / (cam.distance * 2.8))

        if (label === 'DEFINES') {
          ctx.setLineDash([4, 4])
          ctx.strokeStyle = `rgba(100,130,180,${(dim ? 0.06 : 0.28) * avgFade})`
          ctx.lineWidth   = 0.8
          ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke()
          ctx.setLineDash([])
        } else {
          const alpha = (dim ? 0.1 : 0.55) * avgFade
          ctx.strokeStyle = `rgba(251,191,36,${alpha})`
          ctx.fillStyle   = `rgba(251,191,36,${alpha})`
          ctx.lineWidth   = 1
          const dx = pb.sx - pa.sx, dy = pb.sy - pa.sy
          const dist = Math.sqrt(dx*dx + dy*dy) || 1
          const toR = nodeRadius(pb.n.nodeType, pb.n.id) * pb.screenScale
          const tx = pb.sx - (dx/dist)*toR, ty = pb.sy - (dy/dist)*toR
          ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(tx, ty); ctx.stroke()
          const angle = Math.atan2(dy, dx), aSize = Math.max(3, 5 * pb.screenScale)
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          ctx.lineTo(tx - aSize*Math.cos(angle-0.4), ty - aSize*Math.sin(angle-0.4))
          ctx.lineTo(tx - aSize*Math.cos(angle+0.4), ty - aSize*Math.sin(angle+0.4))
          ctx.closePath(); ctx.fill()
        }
      })

      // ── Nodes ────────────────────────────────────────────────────────
      projected.forEach(({ n, sx, sy, screenScale, depth }) => {
        const r           = nodeRadius(n.nodeType, n.id) * screenScale
        const isSelected  = sel?.id === n.id
        const isHighlight = hi.has(n.id)
        const isHover     = hov?.id === n.id
        const isDimmed    = hasHighlight && !isHighlight && !isSelected
        const color       = TYPE_COLORS[n.nodeType] ?? '#6b7280'
        const depthFade   = Math.max(0.3, 1 - depth / (cam.distance * 2.8))

        ctx.shadowBlur = 0
        if (isSelected) {
          ctx.shadowBlur = 20; ctx.shadowColor = color
        } else if (isHighlight) {
          ctx.shadowBlur = 12; ctx.shadowColor = color
        } else if (isHover) {
          ctx.shadowBlur = 8;  ctx.shadowColor = color
        } else if (['MODULE', 'FILE'].includes(n.nodeType) && !isDimmed) {
          ctx.shadowBlur = 5;  ctx.shadowColor = color
        }

        ctx.beginPath()
        ctx.arc(sx, sy, Math.max(r, 1), 0, Math.PI * 2)
        ctx.fillStyle = isDimmed
          ? `rgba(${hexToRgb(color)},${0.15 * depthFade})`
          : depthFade < 0.95
            ? `rgba(${hexToRgb(color)},${depthFade})`
            : color
        ctx.fill()
        ctx.shadowBlur = 0

        if (isSelected) {
          const pulse = 1 + 0.12 * Math.sin(now / 300)
          ctx.beginPath(); ctx.arc(sx, sy, (r + 4) * pulse, 0, Math.PI * 2)
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke()
        }
        if (isHighlight && !isSelected) {
          const pulse = 0.6 + 0.4 * Math.abs(Math.sin(now / 600))
          ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(${hexToRgb(color)},${pulse})`; ctx.lineWidth = 1.5; ctx.stroke()
        }
        if (isHover && !isSelected) {
          ctx.beginPath(); ctx.arc(sx, sy, r + 3, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke()
        }

        const showLabel = ALWAYS_LABEL.has(n.nodeType) || screenScale > 1.2 || isSelected || isHighlight
        if (showLabel && !isDimmed) {
          const label    = n.name || n.fullName.split('/').pop()?.split('::').pop() || ''
          const isTiny   = ['FUNCTION', 'METHOD', 'EXPORT'].includes(n.nodeType)
          const fontSize = Math.max(isTiny ? 6 : 8, (isTiny ? 6 : 8) * screenScale)
          ctx.font       = `${fontSize}px ui-monospace, monospace`
          ctx.textAlign  = 'center'
          ctx.fillStyle  = isSelected ? '#ffffff' : isHighlight ? color : `rgba(200,210,220,${depthFade * 0.9})`
          ctx.fillText(label, sx, sy + (isTiny ? -(r + 7) : r + 11))
        }
      })

      // ── Hover tooltip (screen space) ─────────────────────────────────
      if (hov && !isDragging.current && hov.x != null) {
        const ph    = project3D(hov.x, hov.y!, hov.z!, cam, W, H)
        const color = TYPE_COLORS[hov.nodeType] ?? '#6b7280'
        const label = hov.name || hov.fullName.split('/').pop()?.split('::').pop() || ''
        const ttW = Math.min(label.length * 7 + 24, 240)
        const ttH = 28
        const ttX = Math.max(4, Math.min(ph.sx - ttW / 2, W - ttW - 4))
        const ttY = ph.sy - nodeRadius(hov.nodeType, hov.id) * ph.screenScale - ttH - 10
        roundRect(ctx, ttX, Math.max(4, ttY), ttW, ttH, 6)
        ctx.fillStyle = 'rgba(15,20,30,0.92)'; ctx.fill()
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke()
        ctx.fillStyle   = '#e5e7eb'
        ctx.font        = '11px ui-monospace, monospace'
        ctx.textAlign   = 'center'
        ctx.fillText(label, ttX + ttW/2, Math.max(4, ttY) + 18, ttW - 12)
      }

      ctx.restore()
      animFrame = requestAnimationFrame(tick)
    }

    tick()
    return () => cancelAnimationFrame(animFrame)
  }, [data, edges, nodes])

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    cameraAnimRef.current.active = false
    zoomVelRef.current += e.deltaY * 0.0004
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    didDrag.current    = false
    lastMouse.current  = { x: e.clientX, y: e.clientY }
    mouseMode.current  = e.button === 2 ? 'rotate' : 'pan'
    setIsRotating(mouseMode.current === 'rotate')
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        didDrag.current = true
        cameraAnimRef.current.active = false
      }
      if (mouseMode.current === 'rotate') {
        cameraRef.current.rotY += dx * 0.005
        cameraRef.current.rotX  = Math.max(-Math.PI/2+0.1, Math.min(Math.PI/2-0.1, cameraRef.current.rotX + dy * 0.005))
      } else {
        cameraRef.current.panX += dx
        cameraRef.current.panY += dy
      }
      lastMouse.current = { x: e.clientX, y: e.clientY }
      setHoverNode(null)
      return
    }

    // Hover hit-test in screen space
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const cam = cameraRef.current
    const W = canvas.offsetWidth, H = canvas.offsetHeight

    let closest: Node | null = null, minDist = 28
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue
      const { sx, sy, screenScale } = project3D(n.x, n.y, n.z ?? 0, cam, W, H)
      const hitR = Math.max(nodeBaseRadius(n.nodeType) * screenScale + 4, 8)
      const d    = Math.sqrt((sx - mx) ** 2 + (sy - my) ** 2)
      if (d < hitR && d < minDist) { minDist = d; closest = n }
    }
    setHoverNode(closest)
  }, [])

  const handleMouseUp   = useCallback(() => { isDragging.current = false; setIsRotating(false) }, [])
  const handleContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), [])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (didDrag.current) { didDrag.current = false; return }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const cam = cameraRef.current
    const W = canvas.offsetWidth, H = canvas.offsetHeight

    let closest: Node | null = null, minDist = 30
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue
      const { sx, sy, screenScale } = project3D(n.x, n.y, n.z ?? 0, cam, W, H)
      const hitR = Math.max(nodeBaseRadius(n.nodeType) * screenScale + 6, 10)
      const d    = Math.sqrt((sx - mx) ** 2 + (sy - my) ** 2)
      if (d < hitR && d < minDist) { minDist = d; closest = n }
    }
    setSelected(closest)
    if (closest) zoomToNode(closest)
  }, [zoomToNode])

  // ── Camera button handlers ────────────────────────────────────────────────
  const camStep = useCallback((fn: (cam: Camera) => void) => {
    const cam = cameraRef.current
    const next = { ...cam }
    fn(next)
    cameraAnimRef.current = {
      active: true,
      startRotX: cam.rotX, startRotY: cam.rotY, startDist: cam.distance,
      startPanX: cam.panX, startPanY: cam.panY,
      endRotX: next.rotX, endRotY: next.rotY, endDist: next.distance,
      endPanX: next.panX, endPanY: next.panY,
      startTime: performance.now(), duration: 320,
    }
  }, [])

  const handleZoomIn   = useCallback(() => camStep((c) => { c.distance = Math.max(5,   c.distance * 0.55) }), [camStep])
  const handleZoomOut  = useCallback(() => camStep((c) => { c.distance = Math.min(maxDistRef.current, c.distance * 1.8) }), [camStep])
  const handleRotUp    = useCallback(() => camStep((c) => { c.rotX = Math.max(-Math.PI/2+0.1, c.rotX - STEP) }), [camStep])
  const handleRotDown  = useCallback(() => camStep((c) => { c.rotX = Math.min(Math.PI/2-0.1,  c.rotX + STEP) }), [camStep])
  const handleRotLeft  = useCallback(() => camStep((c) => { c.rotY -= STEP }), [camStep])
  const handleRotRight = useCallback(() => camStep((c) => { c.rotY += STEP }), [camStep])
  const handleReset    = useCallback(() => {
    const cam = cameraRef.current
    cameraAnimRef.current = {
      active: true,
      startRotX: cam.rotX, startRotY: cam.rotY, startDist: cam.distance,
      startPanX: cam.panX, startPanY: cam.panY,
      endRotX: -0.3, endRotY: 0, endDist: initialDistRef.current, endPanX: 0, endPanY: 0,
      startTime: performance.now(), duration: 600,
    }
  }, [])

  // ── Sidebar data ──────────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return nodes.filter((n) =>
      n.name?.toLowerCase().includes(q) ||
      n.fullName.toLowerCase().includes(q) ||
      n.nodeType.toLowerCase().includes(q)
    ).slice(0, 30)
  }, [query, nodes])

  const selectedConnections = useMemo(() => {
    if (!selected) return { out: [], in: [] }
    const out = edges.filter((e) => e.fromId === selected.id)
      .map((e) => ({ edge: e, node: nodeMap.get(e.toId) })).filter((c) => c.node)
    const inn = edges.filter((e) => e.toId === selected.id)
      .map((e) => ({ edge: e, node: nodeMap.get(e.fromId) })).filter((c) => c.node)
    return { out, in: inn }
  }, [selected, edges, nodeMap])

  const defEdges = useMemo(() => edges.filter((e) => e.label === 'DEFINES').length, [edges])
  const impEdges = useMemo(() => edges.filter((e) => e.label !== 'DEFINES').length, [edges])

  const btnBase = 'flex h-8 w-8 items-center justify-center rounded-lg text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-all duration-150'

  return (
    <div className="flex h-screen bg-gray-950 text-white" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="flex w-72 flex-col border-r border-gray-800/70 bg-gray-900 overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-gray-800/70">
          <button onClick={() => navigate('/')} className="mb-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            ← Back
          </button>
          <h2 className="font-semibold text-sm text-white truncate">{repo?.fullName ?? 'Graph'}</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {nodes.length} nodes · {edges.length} edges
            <span className="ml-2 text-gray-600">{defEdges} defines · {impEdges} imports</span>
          </p>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, type…"
              className="w-full rounded-lg border border-gray-700/80 bg-gray-800 px-3 py-2 pr-8 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-white">✕</button>
            )}
          </div>
          {query.trim() && (
            <p className="mt-1.5 text-xs text-gray-500">{highlighted.size} match{highlighted.size !== 1 ? 'es' : ''}</p>
          )}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mx-4 mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-700/60 bg-gray-800/50 divide-y divide-gray-700/30">
            {searchResults.map((n) => (
              <button key={n.id} onClick={() => { setSelected(n); zoomToNode(n) }}
                className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-gray-700/50 flex items-center gap-2 transition-colors">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[n.nodeType] }} />
                <span className="truncate text-gray-300 font-mono">{n.name || n.fullName.split('/').pop()}</span>
                <span className="ml-auto text-gray-600 shrink-0">{n.nodeType}</span>
              </button>
            ))}
          </div>
        )}

        {/* Selected node info */}
        {selected && (
          <div className="mx-4 mt-3 rounded-lg border border-gray-700/80 bg-gray-800/60 overflow-hidden">
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-700/60">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[selected.nodeType] }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: TYPE_COLORS[selected.nodeType] }}>
                  {selected.nodeType}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-white transition-colors">✕</button>
            </div>
            <div className="px-3 py-2 border-b border-gray-700/60">
              <p className="text-sm font-semibold text-white truncate">
                {selected.name || selected.fullName.split('/').pop()?.split('::').pop()}
              </p>
              <p className="text-xs text-gray-500 font-mono mt-0.5 break-all">{selected.fullName.split('::')[0]}</p>
              {selected.startLine != null && selected.endLine != null && (
                <p className="text-xs text-gray-600 mt-1">Lines {selected.startLine}–{selected.endLine}</p>
              )}
            </div>
            {(selectedConnections.out.length > 0 || selectedConnections.in.length > 0) && (
              <div className="px-3 py-2 max-h-44 overflow-y-auto">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  Connections ({selectedConnections.out.length + selectedConnections.in.length})
                </p>
                {selectedConnections.out.map(({ edge, node }, i) => (
                  <button key={`o${i}`} onClick={() => { setSelected(node!); zoomToNode(node!) }}
                    className="w-full flex items-center gap-1.5 text-xs text-gray-400 hover:text-white py-0.5 text-left">
                    <span className="text-gray-600">→</span>
                    <span className="shrink-0" style={{ fontSize: '9px', color: edge.label === 'DEFINES' ? '#6b7280' : '#fbbf24' }}>{edge.label}</span>
                    <span className="truncate font-mono">{node!.name || node!.fullName.split('/').pop()?.split('::').pop()}</span>
                  </button>
                ))}
                {selectedConnections.in.map(({ edge, node }, i) => (
                  <button key={`i${i}`} onClick={() => { setSelected(node!); zoomToNode(node!) }}
                    className="w-full flex items-center gap-1.5 text-xs text-gray-400 hover:text-white py-0.5 text-left">
                    <span className="text-gray-600">←</span>
                    <span className="shrink-0" style={{ fontSize: '9px', color: edge.label === 'DEFINES' ? '#6b7280' : '#fbbf24' }}>{edge.label}</span>
                    <span className="truncate font-mono">{node!.name || node!.fullName.split('/').pop()?.split('::').pop()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="mt-auto border-t border-gray-800/70">
          <button onClick={() => setLegendOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <span className="uppercase tracking-wider font-semibold">Legend</span>
            <span>{legendOpen ? '▲' : '▼'}</span>
          </button>
          {legendOpen && (
            <div className="px-4 pb-3 space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600">Nodes</p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  {Object.entries(TYPE_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      {type}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600">Edges</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="block h-px w-5 border-t border-dashed" style={{ borderColor: 'rgba(100,130,180,0.6)' }} />DEFINES
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="block h-px w-5" style={{ backgroundColor: 'rgba(251,191,36,0.7)' }} />IMPORTS
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-700">Drag: pan · Right-drag: rotate · Scroll: zoom</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Canvas area ──────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        )}
        {!isLoading && !fitted && nodes.length > 0 && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 text-xs text-gray-500 pointer-events-none select-none">
            Simulating 3D layout…
          </div>
        )}
        {!isLoading && edges.length === 0 && nodes.length > 0 && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-yellow-800 bg-yellow-900/30 px-4 py-2 text-xs text-yellow-400">
            No edges — re-ingest to generate the dependency graph
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`h-full w-full ${isRotating ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleCanvasClick}
          onContextMenu={handleContextMenu}
        />

        {/* ── Floating Controls ──────────────────────────────────────── */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 select-none">
          {/* Zoom */}
          <div className="flex gap-0.5 rounded-xl border border-white/8 bg-gray-950/80 p-1 backdrop-blur-md shadow-2xl">
            <button onClick={handleZoomIn}  className={btnBase} title="Zoom in">+</button>
            <div className="w-px bg-white/10" />
            <button onClick={handleZoomOut} className={btnBase} title="Zoom out">−</button>
          </div>

          {/* Rotation grid */}
          <div className="rounded-xl border border-white/8 bg-gray-950/80 p-1.5 backdrop-blur-md shadow-2xl">
            <div className="grid grid-cols-3 gap-0.5">
              <div />
              <button onClick={handleRotUp}    className={btnBase} title="Tilt up">↑</button>
              <div />
              <button onClick={handleRotLeft}  className={btnBase} title="Rotate left">←</button>
              <button onClick={handleReset}    className={`${btnBase} text-gray-500 hover:text-indigo-400`} title="Reset view">⊡</button>
              <button onClick={handleRotRight} className={btnBase} title="Rotate right">→</button>
              <div />
              <button onClick={handleRotDown}  className={btnBase} title="Tilt down">↓</button>
              <div />
            </div>
          </div>
        </div>

        {/* Request change button */}
        <button onClick={() => navigate(`/repos/${id}/tasks/new`)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/40 transition-colors">
          Request a Change →
        </button>
      </div>
    </div>
  )
}
