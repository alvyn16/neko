import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  MousePointer2, Hand, Pencil, Square, Circle, Diamond, Minus, ArrowRight, 
  Type, Eraser, Trash2, Download, Save, Upload, Undo, Redo, Plus, Image 
} from 'lucide-react'
import rough from 'roughjs/bin/rough'

// Types
interface Point { x: number; y: number }

interface Element {
  id: string
  type: 'rect' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'pencil' | 'text' | 'image'
  x: number
  y: number
  w?: number
  h?: number
  points?: Point[]
  text?: string
  fontSize?: number
  src?: string
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}

interface View { x: number; y: number; zoom: number }

interface DragState {
  type: 'move' | 'resize' | 'pan' | 'draw' | 'marquee' | null
  startX: number
  startY: number
  elementId?: string
  handle?: 'tl' | 'tr' | 'bl' | 'br' | 'rotate'
  initialElements?: Element[]
  marqueeStart?: Point
}

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'hand', icon: Hand, label: 'Hand (Pan)' },
  { id: 'pencil', icon: Pencil, label: 'Pencil' },
  { id: 'rect', icon: Square, label: 'Rectangle' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse' },
  { id: 'diamond', icon: Diamond, label: 'Diamond' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'arrow', icon: ArrowRight, label: 'Arrow' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
] as const

type Tool = typeof TOOLS[number]['id']

const DEFAULT_FILL = '#1f2937'
const DEFAULT_STROKE = '#c084fc'
const DEFAULT_STROKE_WIDTH = 2

function App() {
  const [elements, setElements] = useState<Element[]>([])
  const [view, setView] = useState<View>({ x: 200, y: 150, zoom: 1 })
  const [tool, setTool] = useState<Tool>('select')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [projectName, setProjectName] = useState('Untitled Drawing')
  const [dragState, setDragState] = useState<DragState>({ type: null, startX: 0, startY: 0 })
  const [showTextInput, setShowTextInput] = useState(false)
  const [textInputPos, setTextInputPos] = useState({ x: 0, y: 0 })
  const [textValue, setTextValue] = useState('')
  const [copiedElements, setCopiedElements] = useState<Element[]>([])
  const [toast, setToast] = useState('')
  const [isDrawing, setIsDrawing] = useState(false)
  const currentPencilPointsRef = useRef<Point[]>([])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const roughRef = useRef<any>(null)
  const historyRef = useRef<Element[][]>([[]])
  const historyIndexRef = useRef(0)
  const autoSaveTimeout = useRef<number | null>(null)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('neko-project')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.elements) setElements(data.elements)
        if (data.view) setView(data.view)
        if (data.projectName) setProjectName(data.projectName)
        historyRef.current = [data.elements || []]
      } catch (e) {}
    }
  }, [])

  // Auto save
  const autoSave = useCallback((els: Element[], v: View, name: string) => {
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current)
    autoSaveTimeout.current = window.setTimeout(() => {
      localStorage.setItem('neko-project', JSON.stringify({ elements: els, view: v, projectName: name }))
    }, 800)
  }, [])

  // Push to history
  const pushToHistory = (newElements: Element[]) => {
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1)
    newHistory.push(JSON.parse(JSON.stringify(newElements)))
    if (newHistory.length > 50) newHistory.shift()
    historyRef.current = newHistory
    historyIndexRef.current = newHistory.length - 1
  }

  const undo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--
      const prev = historyRef.current[historyIndexRef.current]
      setElements(JSON.parse(JSON.stringify(prev)))
      setSelectedIds([])
    }
  }

  const redo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++
      const next = historyRef.current[historyIndexRef.current]
      setElements(JSON.parse(JSON.stringify(next)))
      setSelectedIds([])
    }
  }

  // World <-> Screen coords
  const screenToWorld = (sx: number, sy: number): Point => ({
    x: (sx - view.x) / view.zoom,
    y: (sy - view.y) / view.zoom,
  })

  const worldToScreen = (wx: number, wy: number): Point => ({
    x: wx * view.zoom + view.x,
    y: wy * view.zoom + view.y,
  })

  // Get element bounding box
  const getElementBounds = (el: Element): { x: number; y: number; w: number; h: number } => {
    if (el.type === 'pencil' && el.points && el.points.length > 0) {
      const xs = el.points.map(p => p.x)
      const ys = el.points.map(p => p.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      return { x: minX - 4, y: minY - 4, w: maxX - minX + 8, h: maxY - minY + 8 }
    }
    if ((el.type === 'line' || el.type === 'arrow') && el.points && el.points.length >= 2) {
      const [p1, p2] = el.points
      const minX = Math.min(p1.x, p2.x) - 8
      const maxX = Math.max(p1.x, p2.x) + 8
      const minY = Math.min(p1.y, p2.y) - 8
      const maxY = Math.max(p1.y, p2.y) + 8
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }
    return { x: el.x, y: el.y, w: el.w || 0, h: el.h || 0 }
  }

  // Simple hit test
  const hitTest = (el: Element, wx: number, wy: number): boolean => {
    const b = getElementBounds(el)
    const pad = (el.strokeWidth || 2) + 6
    return wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad
  }

  const getElementAtPoint = (wx: number, wy: number): Element | null => {
    for (let i = elements.length - 1; i >= 0; i--) {
      if (hitTest(elements[i], wx, wy)) return elements[i]
    }
    return null
  }

  // Visible elements for culling
  const getVisibleElements = useCallback((): Element[] => {
    if (!canvasRef.current) return elements
    const rect = canvasRef.current.getBoundingClientRect()
    const worldLeft = (0 - view.x) / view.zoom
    const worldRight = (rect.width - view.x) / view.zoom
    const worldTop = (0 - view.y) / view.zoom
    const worldBottom = (rect.height - view.y) / view.zoom

    return elements.filter(el => {
      const b = getElementBounds(el)
      return !(b.x + b.w < worldLeft || b.x > worldRight || b.y + b.h < worldTop || b.y > worldBottom)
    })
  }, [elements, view])

  // Draw everything
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })!
    ctx.save()
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Background grid
    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 1
    const gridSize = 50
    const startX = Math.floor((0 - view.x) / view.zoom / gridSize) * gridSize
    const endX = Math.ceil((canvas.width - view.x) / view.zoom / gridSize) * gridSize
    const startY = Math.floor((0 - view.y) / view.zoom / gridSize) * gridSize
    const endY = Math.ceil((canvas.height - view.y) / view.zoom / gridSize) * gridSize

    ctx.beginPath()
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x * view.zoom + view.x, 0)
      ctx.lineTo(x * view.zoom + view.x, canvas.height)
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(0, y * view.zoom + view.y)
      ctx.lineTo(canvas.width, y * view.zoom + view.y)
    }
    ctx.stroke()

    // Transform for world
    ctx.translate(view.x, view.y)
    ctx.scale(view.zoom, view.zoom)

    const rc = roughRef.current || (roughRef.current = rough.canvas(canvas))
    const visible = getVisibleElements()

    visible.forEach(el => {
      ctx.save()
      ctx.globalAlpha = el.opacity ?? 1

      const opts = {
        fill: el.fill,
        stroke: el.stroke,
        strokeWidth: el.strokeWidth,
        roughness: 1.2,
        bowing: 0.8,
      }

      if (el.type === 'rect') {
        rc.rectangle(el.x, el.y, el.w || 0, el.h || 0, opts)
      } else if (el.type === 'ellipse') {
        rc.ellipse(el.x + (el.w || 0) / 2, el.y + (el.h || 0) / 2, el.w || 0, el.h || 0, opts)
      } else if (el.type === 'diamond') {
        const cx = el.x + (el.w || 0) / 2
        const cy = el.y + (el.h || 0) / 2
        const hw = (el.w || 0) / 2
        const hh = (el.h || 0) / 2
        rc.polygon([[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]], opts)
      } else if ((el.type === 'line' || el.type === 'arrow') && el.points && el.points.length >= 2) {
        const [p1, p2] = el.points
        rc.line(p1.x, p1.y, p2.x, p2.y, opts)
        if (el.type === 'arrow') {
          // Arrow head
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
          const headLen = 12
          const headAngle = Math.PI / 6
          rc.line(p2.x, p2.y, p2.x - headLen * Math.cos(angle - headAngle), p2.y - headLen * Math.sin(angle - headAngle), { stroke: el.stroke, strokeWidth: el.strokeWidth })
          rc.line(p2.x, p2.y, p2.x - headLen * Math.cos(angle + headAngle), p2.y - headLen * Math.sin(angle + headAngle), { stroke: el.stroke, strokeWidth: el.strokeWidth })
        }
      } else if (el.type === 'pencil' && el.points && el.points.length > 1) {
        rc.linearPath(el.points.map(p => [p.x, p.y]), opts)
      } else if (el.type === 'image' && el.src) {
        const cachedImg = imageCacheRef.current.get(el.id)
        if (!cachedImg) {
          const newImg = new Image()
          newImg.src = el.src
          imageCacheRef.current.set(el.id, newImg)
          newImg.onload = () => draw()
        } else if (cachedImg.complete && cachedImg.naturalWidth > 0) {
          ctx.drawImage(cachedImg, el.x, el.y, el.w || 300, el.h || 200)
        }
      } else if (el.type === 'text' && el.text) {
        ctx.fillStyle = el.stroke
        ctx.font = `${el.fontSize || 20}px system-ui, sans-serif`
        ctx.textBaseline = 'top'
        ctx.fillText(el.text, el.x, el.y)
      }
      ctx.restore()
    })

    // Live pencil preview
    if (currentPencilPointsRef.current.length > 1 && tool === 'pencil') {
      const rc = roughRef.current || (roughRef.current = rough.canvas(canvas))
      rc.linearPath(currentPencilPointsRef.current.map(p => [p.x, p.y]), {
        stroke: DEFAULT_STROKE,
        strokeWidth: DEFAULT_STROKE_WIDTH,
        roughness: 1.2,
        bowing: 0.8
      })
    }

    // Marquee preview
    if (dragState.type === 'marquee' && dragState.marqueeStart) {
      const current = screenToWorld(lastMouseRef.current.x, lastMouseRef.current.y)
      const x = Math.min(dragState.marqueeStart.x, current.x)
      const y = Math.min(dragState.marqueeStart.y, current.y)
      const w = Math.abs(current.x - dragState.marqueeStart.x)
      const h = Math.abs(current.y - dragState.marqueeStart.y)
      ctx.strokeStyle = '#c084fc'
      ctx.lineWidth = 1 / view.zoom
      ctx.setLineDash([4 / view.zoom, 4 / view.zoom])
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
    }

    ctx.restore()
  }, [elements, view, dragState, getVisibleElements])

  // Redraw on changes
  useEffect(() => {
    draw()
  }, [draw])

  // Resize canvas to container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = container.clientWidth * dpr
    canvas.height = container.clientHeight * dpr
    canvas.style.width = `${container.clientWidth}px`
    canvas.style.height = `${container.clientHeight}px`
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    draw()
  }, [draw])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  // Update element
  const updateElement = (id: string, updates: Partial<Element>) => {
    const newElements = elements.map(el => el.id === id ? { ...el, ...updates } : el)
    setElements(newElements)
    pushToHistory(newElements)
    autoSave(newElements, view, projectName)
  }

  // Delete selected
  const deleteSelected = () => {
    if (selectedIds.length === 0) return
    const newElements = elements.filter(el => !selectedIds.includes(el.id))
    setElements(newElements)
    setSelectedIds([])
    pushToHistory(newElements)
    autoSave(newElements, view, projectName)
    showToast('Deleted')
  }

  // Duplicate
  const duplicateSelected = () => {
    if (selectedIds.length === 0) return
    const newEls: Element[] = []
    selectedIds.forEach(id => {
      const el = elements.find(e => e.id === id)
      if (el) {
        const copy: Element = { 
          ...JSON.parse(JSON.stringify(el)), 
          id: crypto.randomUUID(),
          x: el.x + 20,
          y: el.y + 20 
        }
        newEls.push(copy)
      }
    })
    const newElements = [...elements, ...newEls]
    setElements(newElements)
    setSelectedIds(newEls.map(e => e.id))
    pushToHistory(newElements)
    autoSave(newElements, view, projectName)
  }

  // Copy / Paste
  const copySelected = () => {
    const toCopy = elements.filter(el => selectedIds.includes(el.id))
    setCopiedElements(JSON.parse(JSON.stringify(toCopy)))
    showToast('Copied')
  }

  const paste = () => {
    if (copiedElements.length === 0) return
    const newEls = copiedElements.map(el => ({
      ...JSON.parse(JSON.stringify(el)),
      id: crypto.randomUUID(),
      x: el.x + 30,
      y: el.y + 30
    }))
    const newElements = [...elements, ...newEls]
    setElements(newElements)
    setSelectedIds(newEls.map(e => e.id))
    pushToHistory(newElements)
    autoSave(newElements, view, projectName)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const mod = isMac ? e.metaKey : e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) { redo(); } else { undo(); }
      }
      if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected() }
      if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste() }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected() }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject() }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected() }
      if (e.key === 'Escape') {
        setSelectedIds([])
        setShowTextInput(false)
        if (tool === 'text') setTool('select')
      }
      if (e.key === ' ' && tool !== 'hand') {
        e.preventDefault()
        setTool('hand')
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        if (tool === 'hand') setTool('select')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [selectedIds, elements, tool, copiedElements])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 1600)
  }

  // Save / Load project (JSON)
  const saveProject = () => {
    const data = { elements, view, projectName, version: '1.0' }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName.replace(/\s+/g, '_')}.neko.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Project saved')
  }

  const loadProject = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (data.elements) {
          setElements(data.elements)
          if (data.view) setView(data.view)
          if (data.projectName) setProjectName(data.projectName)
          historyRef.current = [data.elements]
          historyIndexRef.current = 0
          setSelectedIds([])
          showToast('Project loaded')
        }
      } catch {
        showToast('Invalid file')
      }
    }
    reader.readAsText(file)
  }

  // Export PNG
  const exportPNG = (transparent = false) => {
    if (elements.length === 0) {
      showToast('Nothing to export')
      return
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    elements.forEach(el => {
      const b = getElementBounds(el)
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.w)
      maxY = Math.max(maxY, b.y + b.h)
    })

    const pad = 40
    const scale = 2
    const w = Math.ceil((maxX - minX + pad * 2) * scale)
    const h = Math.ceil((maxY - minY + pad * 2) * scale)

    const expCanvas = document.createElement('canvas')
    expCanvas.width = w
    expCanvas.height = h
    const ectx = expCanvas.getContext('2d', { alpha: true })!

    if (!transparent) {
      ectx.fillStyle = '#0a0a0c'
      ectx.fillRect(0, 0, w, h)
    }

    ectx.translate((-minX + pad) * scale, (-minY + pad) * scale)
    ectx.scale(scale, scale)

    const rc = rough.canvas(expCanvas)

    elements.forEach(el => {
      ectx.save()
      ectx.globalAlpha = el.opacity ?? 1
      const opts: any = {
        fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth,
        roughness: 1.1, bowing: 0.7
      }

      if (el.type === 'rect') rc.rectangle(el.x, el.y, el.w || 0, el.h || 0, opts)
      else if (el.type === 'ellipse') rc.ellipse(el.x + (el.w||0)/2, el.y + (el.h||0)/2, el.w||0, el.h||0, opts)
      else if (el.type === 'diamond') {
        const cx = el.x + (el.w||0)/2, cy = el.y + (el.h||0)/2
        rc.polygon([[cx, cy-(el.h||0)/2], [cx+(el.w||0)/2, cy], [cx, cy+(el.h||0)/2], [cx-(el.w||0)/2, cy]], opts)
      }
      else if ((el.type === 'line' || el.type === 'arrow') && el.points?.length === 2) {
        const [p1, p2] = el.points
        rc.line(p1.x, p1.y, p2.x, p2.y, opts)
        if (el.type === 'arrow') {
          const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x)
          const hl = 14
          rc.line(p2.x, p2.y, p2.x - hl * Math.cos(ang - 0.5), p2.y - hl * Math.sin(ang - 0.5), {stroke: el.stroke, strokeWidth: el.strokeWidth})
          rc.line(p2.x, p2.y, p2.x - hl * Math.cos(ang + 0.5), p2.y - hl * Math.sin(ang + 0.5), {stroke: el.stroke, strokeWidth: el.strokeWidth})
        }
      }
      else if (el.type === 'pencil' && el.points) {
        rc.linearPath(el.points.map(p => [p.x, p.y]), opts)
      }
      else if (el.type === 'text' && el.text) {
        ectx.fillStyle = el.stroke
        ectx.font = `${(el.fontSize || 20) * scale}px system-ui`
        ectx.fillText(el.text, el.x, el.y)
      }
      ectx.restore()
    })

    const link = document.createElement('a')
    link.download = `${projectName}.png`
    link.href = expCanvas.toDataURL('image/png')
    link.click()
    showToast('Exported PNG')
  }

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = screenToWorld(sx, sy)
    lastMouseRef.current = { x: sx, y: sy }

    if (tool === 'hand') {
      setDragState({ type: 'pan', startX: sx, startY: sy })
      return
    }

    if (tool === 'select') {
      // Check handles first (for resize)
      const selected = elements.find(el => selectedIds.includes(el.id))
      if (selected && selectedIds.length === 1) {
        const b = getElementBounds(selected)
        const s = worldToScreen
        // Simple check for corners (tl, tr, bl, br)
        const handles = [
          { name: 'tl', pos: s(b.x, b.y) },
          { name: 'tr', pos: s(b.x + b.w, b.y) },
          { name: 'bl', pos: s(b.x, b.y + b.h) },
          { name: 'br', pos: s(b.x + b.w, b.y + b.h) },
        ]
        for (const h of handles) {
          if (Math.hypot(sx - h.pos.x, sy - h.pos.y) < 14) {
            setDragState({ 
              type: 'resize', 
              startX: sx, startY: sy, 
              elementId: selected.id, 
              handle: h.name as any,
              initialElements: JSON.parse(JSON.stringify(elements))
            })
            return
          }
        }
      }

      const hit = getElementAtPoint(world.x, world.y)
      if (hit) {
        if (e.shiftKey) {
          const newSel = selectedIds.includes(hit.id) 
            ? selectedIds.filter(id => id !== hit.id) 
            : [...selectedIds, hit.id]
          setSelectedIds(newSel)
        } else {
          if (!selectedIds.includes(hit.id)) setSelectedIds([hit.id])
        }
        setDragState({ 
          type: 'move', 
          startX: world.x, startY: world.y, 
          elementId: hit.id,
          initialElements: JSON.parse(JSON.stringify(elements))
        })
      } else {
        // Start marquee
        setSelectedIds([])
        setDragState({ 
          type: 'marquee', 
          startX: sx, startY: sy,
          marqueeStart: { x: world.x, y: world.y }
        })
      }
      return
    }

    if (tool === 'text') {
      const screenX = e.clientX
      const screenY = e.clientY
      setTextInputPos({ x: screenX, y: screenY })
      setTextValue('')
      setShowTextInput(true)
      setDragState({ type: null, startX: 0, startY: 0 })
      return
    }

    if (tool === 'eraser') {
      const hit = getElementAtPoint(world.x, world.y)
      if (hit) {
        const newElements = elements.filter(el => el.id !== hit.id)
        setElements(newElements)
        pushToHistory(newElements)
        autoSave(newElements, view, projectName)
      }
      setDragState({ type: 'draw', startX: sx, startY: sy })
      return
    }

    // Drawing tools
    setIsDrawing(true)
    setDragState({ type: 'draw', startX: sx, startY: sy })

    if (tool === 'pencil') {
      currentPencilPointsRef.current = [world]
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    lastMouseRef.current = { x: sx, y: sy }
    const world = screenToWorld(sx, sy)

    if (dragState.type === 'pan') {
      const dx = sx - dragState.startX
      const dy = sy - dragState.startY
      setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }))
      setDragState({ ...dragState, startX: sx, startY: sy })
      return
    }

    if (dragState.type === 'move' && dragState.elementId && dragState.initialElements) {
      const dx = world.x - dragState.startX
      const dy = world.y - dragState.startY
      const newElements = elements.map(el => {
        if (!selectedIds.includes(el.id)) return el
        if (el.type === 'pencil' && el.points) {
          return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
        }
        if ((el.type === 'line' || el.type === 'arrow') && el.points) {
          return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
        }
        return { ...el, x: el.x + dx, y: el.y + dy }
      })
      setElements(newElements)
      return
    }

    if (dragState.type === 'resize' && dragState.elementId && dragState.handle && dragState.initialElements) {
      const el = elements.find(e => e.id === dragState.elementId)!
      const initEl = dragState.initialElements.find(e => e.id === dragState.elementId)!
      const dx = world.x - dragState.startX
      const dy = world.y - dragState.startY

      let newX = initEl.x, newY = initEl.y, newW = initEl.w || 0, newH = initEl.h || 0

      if (dragState.handle === 'br') {
        newW = Math.max(10, (initEl.w || 0) + dx)
        newH = Math.max(10, (initEl.h || 0) + dy)
      } else if (dragState.handle === 'tr') {
        newY = initEl.y + dy
        newW = Math.max(10, (initEl.w || 0) + dx)
        newH = Math.max(10, (initEl.h || 0) - dy)
      } else if (dragState.handle === 'bl') {
        newX = initEl.x + dx
        newW = Math.max(10, (initEl.w || 0) - dx)
        newH = Math.max(10, (initEl.h || 0) + dy)
      } else if (dragState.handle === 'tl') {
        newX = initEl.x + dx
        newY = initEl.y + dy
        newW = Math.max(10, (initEl.w || 0) - dx)
        newH = Math.max(10, (initEl.h || 0) - dy)
      }

      const newElements = elements.map(e => 
        e.id === dragState.elementId ? { ...e, x: newX, y: newY, w: newW, h: newH } : e
      )
      setElements(newElements)
      return
    }

    if (dragState.type === 'marquee') {
      // just redraw for preview
      draw()
      return
    }

    if (dragState.type === 'draw' && tool === 'pencil') {
      currentPencilPointsRef.current = [...currentPencilPointsRef.current, world]
      draw()
      return
    }

    if (dragState.type === 'draw' || isDrawing) {
      // live preview for shapes
      draw()
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = screenToWorld(sx, sy)

    if (dragState.type === 'pan') {
      setDragState({ type: null, startX: 0, startY: 0 })
      autoSave(elements, view, projectName)
      return
    }

    if (dragState.type === 'move') {
      pushToHistory(elements)
      autoSave(elements, view, projectName)
      setDragState({ type: null, startX: 0, startY: 0 })
      return
    }

    if (dragState.type === 'resize') {
      pushToHistory(elements)
      autoSave(elements, view, projectName)
      setDragState({ type: null, startX: 0, startY: 0 })
      return
    }

    if (dragState.type === 'marquee' && dragState.marqueeStart) {
      const end = world
      const x1 = Math.min(dragState.marqueeStart.x, end.x)
      const y1 = Math.min(dragState.marqueeStart.y, end.y)
      const x2 = Math.max(dragState.marqueeStart.x, end.x)
      const y2 = Math.max(dragState.marqueeStart.y, end.y)

      const selected = elements.filter(el => {
        const b = getElementBounds(el)
        return b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1
      }).map(el => el.id)
      setSelectedIds(selected)
      setDragState({ type: null, startX: 0, startY: 0 })
      return
    }

    if (dragState.type === 'draw' || tool === 'eraser') {
      const startWorld = screenToWorld(dragState.startX, dragState.startY)

      if (tool === 'pencil' && currentPencilPointsRef.current.length > 1) {
        const pts = currentPencilPointsRef.current
        const newEl: Element = {
          id: crypto.randomUUID(),
          type: 'pencil',
          x: pts[0].x,
          y: pts[0].y,
          points: pts,
          fill: 'transparent',
          stroke: DEFAULT_STROKE,
          strokeWidth: DEFAULT_STROKE_WIDTH,
          opacity: 1
        }
        const newElements = [...elements, newEl]
        setElements(newElements)
        pushToHistory(newElements)
        autoSave(newElements, view, projectName)
        currentPencilPointsRef.current = []
      } 
      else if (tool === 'rect' || tool === 'ellipse' || tool === 'diamond') {
        const w = Math.abs(world.x - startWorld.x)
        const h = Math.abs(world.y - startWorld.y)
        if (w > 4 && h > 4) {
          const newEl: Element = {
            id: crypto.randomUUID(),
            type: tool,
            x: Math.min(startWorld.x, world.x),
            y: Math.min(startWorld.y, world.y),
            w,
            h,
            fill: tool === 'line' || tool === 'arrow' ? 'transparent' : DEFAULT_FILL,
            stroke: DEFAULT_STROKE,
            strokeWidth: DEFAULT_STROKE_WIDTH,
            opacity: 1
          }
          const newElements = [...elements, newEl]
          setElements(newElements)
          pushToHistory(newElements)
          autoSave(newElements, view, projectName)
        }
      } 
      else if (tool === 'line' || tool === 'arrow') {
        const newEl: Element = {
          id: crypto.randomUUID(),
          type: tool,
          x: startWorld.x,
          y: startWorld.y,
          points: [startWorld, world],
          fill: 'transparent',
          stroke: DEFAULT_STROKE,
          strokeWidth: DEFAULT_STROKE_WIDTH,
          opacity: 1
        }
        const newElements = [...elements, newEl]
        setElements(newElements)
        pushToHistory(newElements)
        autoSave(newElements, view, projectName)
      }
      else if (tool === 'eraser') {
        // already handled on move for single, here finalize
      }

      setDragState({ type: null, startX: 0, startY: 0 })
      setIsDrawing(false)
    }
  }

  // Wheel zoom + pan with ctrl
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const worldBefore = screenToWorld(sx, sy)

    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(8, view.zoom * delta))

    const newViewX = sx - worldBefore.x * newZoom
    const newViewY = sy - worldBefore.y * newZoom

    const newView = { x: newViewX, y: newViewY, zoom: newZoom }
    setView(newView)
    autoSave(elements, newView, projectName)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = screenToWorld(sx, sy)

    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target?.result as string
        const newEl: Element = {
          id: crypto.randomUUID(),
          type: 'image',
          x: world.x,
          y: world.y,
          w: 300,
          h: 200,
          src,
          fill: 'transparent',
          stroke: '#000000',
          strokeWidth: 0,
          opacity: 1
        }
        const newElements = [...elements, newEl]
        setElements(newElements)
        pushToHistory(newElements)
        autoSave(newElements, view, projectName)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const rect = canvasRef.current!.getBoundingClientRect()
    // place in center of current view
    const centerX = (rect.width / 2 - view.x) / view.zoom
    const centerY = (rect.height / 2 - view.y) / view.zoom
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target?.result as string
      const newEl: Element = {
        id: crypto.randomUUID(),
        type: 'image',
        x: centerX - 150,
        y: centerY - 100,
        w: 300,
        h: 200,
        src,
        fill: 'transparent',
        stroke: '#000000',
        strokeWidth: 0,
        opacity: 1
      }
      const newElements = [...elements, newEl]
      setElements(newElements)
      pushToHistory(newElements)
      autoSave(newElements, view, projectName)
    }
    reader.readAsDataURL(file)
    e.target.value = '' // reset
  }

  // Touch support (basic)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const rect = canvasRef.current!.getBoundingClientRect()
      const sx = touch.clientX - rect.left
      const sy = touch.clientY - rect.top
      // treat as mouse down with current tool
      // For simplicity call mouse logic
      const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY } as any
      handleMouseDown(fakeEvent)
    } else if (e.touches.length === 2) {
      // pinch zoom stub - can expand
      setTool('hand')
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY } as any
      handleMouseMove(fakeEvent)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const fakeEvent = { clientX: lastMouseRef.current.x, clientY: lastMouseRef.current.y } as any
    handleMouseUp(fakeEvent)
  }

  // Text commit
  const commitText = () => {
    if (!textValue.trim()) {
      setShowTextInput(false)
      return
    }
    const rect = canvasRef.current!.getBoundingClientRect()
    const world = screenToWorld(textInputPos.x - rect.left, textInputPos.y - rect.top)
    const newEl: Element = {
      id: crypto.randomUUID(),
      type: 'text',
      x: world.x,
      y: world.y,
      text: textValue.trim(),
      fontSize: 20,
      fill: 'transparent',
      stroke: DEFAULT_STROKE,
      strokeWidth: 1,
      opacity: 1
    }
    const newElements = [...elements, newEl]
    setElements(newElements)
    pushToHistory(newElements)
    autoSave(newElements, view, projectName)
    setShowTextInput(false)
    setTextValue('')
    setTool('select')
  }

  // Properties panel for selected
  const selectedElement = selectedIds.length === 1 ? elements.find(el => el.id === selectedIds[0]) : null

  const updateSelectedProp = (key: keyof Element, value: any) => {
    if (!selectedElement) return
    updateElement(selectedElement.id, { [key]: value })
  }

  // Toolbar component
  const Toolbar = () => (
    <div className="toolbar">
      {TOOLS.map(t => {
        const Icon = t.icon
        return (
          <button
            key={t.id}
            onClick={() => {
              setTool(t.id as Tool)
              setSelectedIds([])
              if (t.id !== 'text') setShowTextInput(false)
            }}
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            title={t.label}
          >
            <Icon size={20} />
          </button>
        )
      })}
      <div className="h-px bg-zinc-700 my-1" />
      <button 
        onClick={() => fileInputRef.current?.click()} 
        className="tool-btn" 
        title="Upload Image (or drag & drop)"
      >
        <Image size={18} />
      </button>
      <button onClick={undo} className="tool-btn" title="Undo (Ctrl+Z)"><Undo size={18} /></button>
      <button onClick={redo} className="tool-btn" title="Redo"><Redo size={18} /></button>
      <button onClick={deleteSelected} className="tool-btn" title="Delete"><Trash2 size={18} /></button>
    </div>
  )

  // Properties Panel
  const PropertiesPanel = () => {
    if (!selectedElement) return null
    return (
      <div className="properties">
        <h3>Properties — {selectedElement.type}</h3>

        <div className="prop-row">
          <span className="prop-label">Fill</span>
          <input 
            type="color" 
            className="color-input" 
            value={selectedElement.fill} 
            onChange={e => updateSelectedProp('fill', e.target.value)} 
          />
        </div>

        <div className="prop-row">
          <span className="prop-label">Stroke</span>
          <input 
            type="color" 
            className="color-input" 
            value={selectedElement.stroke} 
            onChange={e => updateSelectedProp('stroke', e.target.value)} 
          />
        </div>

        <div className="prop-row">
          <span className="prop-label">Stroke width</span>
          <input 
            type="range" min="1" max="12" step="0.5" 
            value={selectedElement.strokeWidth} 
            onChange={e => updateSelectedProp('strokeWidth', parseFloat(e.target.value))} 
            className="flex-1 ml-3" 
          />
          <span className="w-8 text-right text-xs">{selectedElement.strokeWidth}</span>
        </div>

        <div className="prop-row">
          <span className="prop-label">Opacity</span>
          <input 
            type="range" min="0.1" max="1" step="0.05" 
            value={selectedElement.opacity} 
            onChange={e => updateSelectedProp('opacity', parseFloat(e.target.value))} 
            className="flex-1 ml-3" 
          />
          <span className="w-8 text-right text-xs">{Math.round(selectedElement.opacity * 100)}%</span>
        </div>

        {selectedElement.type === 'text' && (
          <>
            <div className="prop-row mt-2">
              <span className="prop-label">Text</span>
            </div>
            <input 
              type="text" 
              value={selectedElement.text || ''} 
              onChange={e => updateSelectedProp('text', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
            />
            <div className="prop-row mt-2">
              <span className="prop-label">Font size</span>
              <input 
                type="range" min="12" max="72" 
                value={selectedElement.fontSize || 20} 
                onChange={e => updateSelectedProp('fontSize', parseInt(e.target.value))} 
                className="flex-1 ml-3" 
              />
              <span className="w-8 text-right text-xs">{selectedElement.fontSize || 20}</span>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="neko-app">
      {/* Navbar */}
      <div className="navbar">
        <div className="navbar-left">
          <div className="logo">
            <div className="logo-dot" /> Neko
          </div>
          <input 
            className="project-name" 
            value={projectName} 
            onChange={e => {
              setProjectName(e.target.value)
              autoSave(elements, view, e.target.value)
            }} 
          />
        </div>

        <div className="flex items-center gap-2">
          <button onClick={saveProject} className="btn"><Save size={16} /> Save JSON</button>
          <label className="btn cursor-pointer">
            <Upload size={16} /> Load
            <input type="file" accept=".json" className="hidden" onChange={e => e.target.files && loadProject(e.target.files[0])} />
          </label>
          <button onClick={() => exportPNG(false)} className="btn btn-primary"><Download size={16} /> Export PNG</button>
          <button onClick={() => exportPNG(true)} className="btn">Transparent</button>
        </div>
      </div>

      <div className="main" ref={containerRef}>
        <Toolbar />

        {/* Canvas */}
        <div 
          className={`canvas-container ${tool === 'hand' ? 'hand' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onDrop={handleDrop}
        >
          <canvas ref={canvasRef} />
        </div>

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleImageUpload} 
        />

        <PropertiesPanel />

        {/* Status */}
        <div className="status-bar">
          <span>{tool.toUpperCase()}</span>
          <span>{elements.length} elements</span>
          <span>Zoom {Math.round(view.zoom * 100)}%</span>
          <span>Space = Pan • Ctrl+Z = Undo</span>
        </div>

        {/* Text input overlay */}
        {showTextInput && (
          <div 
            className="text-input-overlay" 
            style={{ left: textInputPos.x, top: textInputPos.y }}
          >
            <input 
              autoFocus 
              value={textValue} 
              onChange={e => setTextValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setShowTextInput(false) }}
              onBlur={commitText}
              placeholder="Type text..."
            />
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  )
}

export default App
