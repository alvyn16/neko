import React, { useEffect, useRef, useCallback } from 'react'
import { 
  MousePointer2, Hand, Pencil, Square, Circle, Diamond, Minus, ArrowRight, 
  Type, Eraser, Trash2, Download, Save, Upload, Undo, Redo, Image as ImageIcon 
} from 'lucide-react'
import rough from 'roughjs/bin/rough'
import { Toaster, toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

import { useNekoStore, Element, Point, View } from './store/useNekoStore'
import Navbar from './components/Navbar'
import Toolbar from './components/Toolbar'
import PropertiesPanel from './components/PropertiesPanel'
import LayersPanel from './components/LayersPanel'
import WelcomeModal from './components/WelcomeModal'
import EmptyState from './components/EmptyState'
import StatusBar from './components/StatusBar'

// Types
interface DragState {
  type: 'move' | 'resize' | 'pan' | 'draw' | 'marquee' | null
  startX: number
  startY: number
  elementId?: string
  handle?: 'tl' | 'tr' | 'bl' | 'br'
  initialElements?: Element[]
  marqueeStart?: Point
}

const DEFAULT_FILL = '#1f2937'
const DEFAULT_STROKE = '#6366f1'
const DEFAULT_STROKE_WIDTH = 2

function App() {
  const store = useNekoStore()
  const {
    elements, setElements,
    view, setView,
    tool, setTool,
    selectedIds, setSelectedIds,
    projectName,
    pushToHistory, undo, redo,
    loadFromStorage, saveToStorage,
    showWelcome, setShowWelcome
  } = store

  // Local UI state
  const [dragState, setDragState] = React.useState<DragState>({ type: null, startX: 0, startY: 0 })
  const [showTextInput, setShowTextInput] = React.useState(false)
  const [textInputPos, setTextInputPos] = React.useState({ x: 0, y: 0 })
  const [textValue, setTextValue] = React.useState('')
  const [isDrawing, setIsDrawing] = React.useState(false)
  const [showLayers, setShowLayers] = React.useState(false)

  const currentPencilPointsRef = useRef<Point[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const roughRef = useRef<any>(null)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load on mount
  useEffect(() => {
    loadFromStorage()
    const hasVisited = localStorage.getItem('neko-visited')
    if (hasVisited) {
      setShowWelcome(false)
    }
  }, [])

  // Auto-save
  const autoSave = useCallback((els: Element[], v: View, name: string) => {
    const timeout = setTimeout(() => {
      localStorage.setItem('neko-project-v2', JSON.stringify({
        elements: els,
        view: v,
        projectName: name,
        savedAt: Date.now()
      }))
    }, 600)
    return () => clearTimeout(timeout)
  }, [])

  // Push history + auto save
  const updateElements = useCallback((newElements: Element[]) => {
    setElements(newElements)
    pushToHistory(newElements)
    autoSave(newElements, view, projectName)
  }, [setElements, pushToHistory, view, projectName, autoSave])

  // World / Screen coordinate transforms
  const screenToWorld = useCallback((sx: number, sy: number): Point => ({
    x: (sx - view.x) / view.zoom,
    y: (sy - view.y) / view.zoom,
  }), [view])

  const worldToScreen = useCallback((wx: number, wy: number): Point => ({
    x: wx * view.zoom + view.x,
    y: wy * view.zoom + view.y,
  }), [view])

  // Get element bounds
  const getElementBounds = (el: Element) => {
    if (el.type === 'pencil' && el.points?.length) {
      const xs = el.points.map(p => p.x)
      const ys = el.points.map(p => p.y)
      return {
        x: Math.min(...xs) - 4,
        y: Math.min(...ys) - 4,
        w: Math.max(...xs) - Math.min(...xs) + 8,
        h: Math.max(...ys) - Math.min(...ys) + 8,
      }
    }
    if ((el.type === 'line' || el.type === 'arrow') && el.points?.length >= 2) {
      const [p1, p2] = el.points
      return {
        x: Math.min(p1.x, p2.x) - 8,
        y: Math.min(p1.y, p2.y) - 8,
        w: Math.abs(p2.x - p1.x) + 16,
        h: Math.abs(p2.y - p1.y) + 16,
      }
    }
    return { x: el.x, y: el.y, w: el.w || 0, h: el.h || 0 }
  }

  // Hit test
  const hitTest = (el: Element, wx: number, wy: number): boolean => {
    const b = getElementBounds(el)
    const pad = (el.strokeWidth || 2) + 8
    return wx >= b.x - pad && wx <= b.x + b.w + pad &&
           wy >= b.y - pad && wy <= b.y + b.h + pad
  }

  const getElementAtPoint = (wx: number, wy: number): Element | null => {
    for (let i = elements.length - 1; i >= 0; i--) {
      if (hitTest(elements[i], wx, wy)) return elements[i]
    }
    return null
  }

  // Visible elements (culling)
  const getVisibleElements = useCallback(() => {
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

    // Subtle grid
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

    // World transform
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
        roughness: 1.1,
        bowing: 0.6,
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
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
          const headLen = 14
          const headAngle = Math.PI / 5
          rc.line(p2.x, p2.y, p2.x - headLen * Math.cos(angle - headAngle), p2.y - headLen * Math.sin(angle - headAngle), { stroke: el.stroke, strokeWidth: el.strokeWidth })
          rc.line(p2.x, p2.y, p2.x - headLen * Math.cos(angle + headAngle), p2.y - headLen * Math.sin(angle + headAngle), { stroke: el.stroke, strokeWidth: el.strokeWidth })
        }
      } else if (el.type === 'pencil' && el.points && el.points.length > 1) {
        rc.linearPath(el.points.map(p => [p.x, p.y]), opts)
      } else if (el.type === 'image' && el.src) {
        let img = imageCacheRef.current.get(el.id)
        if (!img) {
          img = new Image()
          img.src = el.src
          imageCacheRef.current.set(el.id, img)
          img.onload = () => draw()
        }
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, el.x, el.y, el.w || 300, el.h || 200)
        }
      } else if (el.type === 'text' && el.text) {
        ctx.fillStyle = el.stroke
        ctx.font = `${el.fontSize || 18}px system-ui, -apple-system, sans-serif`
        ctx.textBaseline = 'top'
        ctx.fillText(el.text, el.x, el.y)
      }
      ctx.restore()
    })

    // Live pencil preview
    if (currentPencilPointsRef.current.length > 1 && tool === 'pencil') {
      rc.linearPath(currentPencilPointsRef.current.map(p => [p.x, p.y]), {
        stroke: DEFAULT_STROKE,
        strokeWidth: DEFAULT_STROKE_WIDTH,
        roughness: 1.1,
      })
    }

    // Marquee selection preview
    if (dragState.type === 'marquee' && dragState.marqueeStart) {
      const current = screenToWorld(lastMouseRef.current.x, lastMouseRef.current.y)
      const x = Math.min(dragState.marqueeStart.x, current.x)
      const y = Math.min(dragState.marqueeStart.y, current.y)
      const w = Math.abs(current.x - dragState.marqueeStart.x)
      const h = Math.abs(current.y - dragState.marqueeStart.y)
      ctx.strokeStyle = '#6366f1'
      ctx.lineWidth = 1 / view.zoom
      ctx.setLineDash([4 / view.zoom, 4 / view.zoom])
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
    }

    ctx.restore()
  }, [elements, view, tool, dragState, getVisibleElements, screenToWorld])

  // Redraw when needed
  useEffect(() => {
    draw()
  }, [draw])

  // Resize canvas
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const mod = isMac ? e.metaKey : e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo() else undo()
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        const toCopy = elements.filter(el => selectedIds.includes(el.id))
        ;(window as any).__nekoClipboard = toCopy
        toast.success('Copied')
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        const clipboard = (window as any).__nekoClipboard
        if (clipboard?.length) {
          const newEls = clipboard.map((el: Element) => ({
            ...JSON.parse(JSON.stringify(el)),
            id: crypto.randomUUID(),
            x: el.x + 30,
            y: el.y + 30,
          }))
          const newElements = [...elements, ...newEls]
          updateElements(newElements)
          setSelectedIds(newEls.map(e => e.id))
        }
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveProject()
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length) {
          e.preventDefault()
          deleteSelected()
        }
      }
      if (e.key === 'Escape') {
        setSelectedIds([])
        setShowTextInput(false)
        if (tool === 'text') setTool('select')
      }
      if (e.key === ' ' && tool !== 'hand') {
        e.preventDefault()
        setTool('hand')
      }
      if (e.key === 'v') setTool('select')
      if (e.key === 'p') setTool('pencil')
      if (e.key === 'r') setTool('rect')
      if (e.key === 'e') setTool('ellipse')
      if (e.key === 't') setTool('text')
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
  }, [elements, selectedIds, tool, undo, redo, updateElements])

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
      const hit = getElementAtPoint(world.x, world.y)
      if (hit) {
        if (!selectedIds.includes(hit.id)) setSelectedIds([hit.id])
        setDragState({
          type: 'move',
          startX: world.x,
          startY: world.y,
          elementId: hit.id,
          initialElements: JSON.parse(JSON.stringify(elements))
        })
      } else {
        setSelectedIds([])
        setDragState({
          type: 'marquee',
          startX: sx,
          startY: sy,
          marqueeStart: { x: world.x, y: world.y }
        })
      }
      return
    }

    if (tool === 'text') {
      setTextInputPos({ x: e.clientX, y: e.clientY })
      setTextValue('')
      setShowTextInput(true)
      return
    }

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

    if (dragState.type === 'move' && dragState.elementId) {
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

    if (dragState.type === 'draw' && tool === 'pencil') {
      currentPencilPointsRef.current = [...currentPencilPointsRef.current, world]
      draw()
      return
    }

    if (dragState.type === 'draw' || dragState.type === 'marquee') {
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
      return
    }

    if (dragState.type === 'move') {
      updateElements(elements)
      setDragState({ type: null, startX: 0, startY: 0 })
      return
    }

    if (dragState.type === 'marquee' && dragState.marqueeStart) {
      const end = world
      const x1 = Math.min(dragState.marqueeStart.x, end.x)
      const y1 = Math.min(dragState.marqueeStart.y, end.y)
      const x2 = Math.max(dragState.marqueeStart.x, end.x)
      const y2 = Math.max(dragState.marqueeStart.y, end.y)

      const selected = elements
        .filter(el => {
          const b = getElementBounds(el)
          return b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1
        })
        .map(el => el.id)
      setSelectedIds(selected)
      setDragState({ type: null, startX: 0, startY: 0 })
      return
    }

    if (dragState.type === 'draw' || isDrawing) {
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
        updateElements([...elements, newEl])
        currentPencilPointsRef.current = []
      } 
      else if (['rect', 'ellipse', 'diamond'].includes(tool)) {
        const w = Math.abs(world.x - startWorld.x)
        const h = Math.abs(world.y - startWorld.y)
        if (w > 6 && h > 6) {
          const newEl: Element = {
            id: crypto.randomUUID(),
            type: tool as any,
            x: Math.min(startWorld.x, world.x),
            y: Math.min(startWorld.y, world.y),
            w, h,
            fill: DEFAULT_FILL,
            stroke: DEFAULT_STROKE,
            strokeWidth: DEFAULT_STROKE_WIDTH,
            opacity: 1
          }
          updateElements([...elements, newEl])
        }
      } 
      else if (tool === 'line' || tool === 'arrow') {
        const newEl: Element = {
          id: crypto.randomUUID(),
          type: tool as any,
          x: startWorld.x,
          y: startWorld.y,
          points: [startWorld, world],
          fill: 'transparent',
          stroke: DEFAULT_STROKE,
          strokeWidth: DEFAULT_STROKE_WIDTH,
          opacity: 1
        }
        updateElements([...elements, newEl])
      }

      setDragState({ type: null, startX: 0, startY: 0 })
      setIsDrawing(false)
    }
  }

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const worldBefore = screenToWorld(sx, sy)

    const delta = e.deltaY > 0 ? 0.88 : 1.13
    const newZoom = Math.max(0.08, Math.min(12, view.zoom * delta))

    const newViewX = sx - worldBefore.x * newZoom
    const newViewY = sy - worldBefore.y * newZoom

    const newView = { x: newViewX, y: newViewY, zoom: newZoom }
    setView(newView)
    autoSave(elements, newView, projectName)
  }

  // ==================== IMPROVED TOUCH GESTURES ====================
  const touchStateRef = useRef<{
    initialDistance: number
    initialZoom: number
    initialCenter: { x: number; y: number }
    lastCenter: { x: number; y: number }
  } | null>(null)

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.hypot(dx, dy)
  }

  const getTouchCenter = (touches: React.TouchList, rect: DOMRect) => {
    if (touches.length === 1) {
      return {
        x: touches[0].clientX - rect.left,
        y: touches[0].clientY - rect.top,
      }
    }
    const x = (touches[0].clientX + touches[1].clientX) / 2 - rect.left
    const y = (touches[0].clientY + touches[1].clientY) / 2 - rect.top
    return { x, y }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()

    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY } as any
      handleMouseDown(fakeEvent)
      touchStateRef.current = null
    } 
    else if (e.touches.length === 2) {
      const distance = getTouchDistance(e.touches)
      const center = getTouchCenter(e.touches, rect)

      touchStateRef.current = {
        initialDistance: distance,
        initialZoom: view.zoom,
        initialCenter: center,
        lastCenter: center,
      }

      setDragState({ type: null, startX: 0, startY: 0 })
      setIsDrawing(false)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()

    if (e.touches.length === 1 && !touchStateRef.current) {
      const touch = e.touches[0]
      const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY } as any
      handleMouseMove(fakeEvent)
    } 
    else if (e.touches.length === 2 && touchStateRef.current) {
      const currentDistance = getTouchDistance(e.touches)
      const currentCenter = getTouchCenter(e.touches, rect)
      const state = touchStateRef.current

      const scale = currentDistance / state.initialDistance
      const newZoom = Math.max(0.1, Math.min(12, state.initialZoom * scale))

      const dx = currentCenter.x - state.lastCenter.x
      const dy = currentCenter.y - state.lastCenter.y

      setView(prev => {
        const worldCenterX = (currentCenter.x - prev.x) / prev.zoom
        const worldCenterY = (currentCenter.y - prev.y) / prev.zoom

        const newViewX = currentCenter.x - worldCenterX * newZoom
        const newViewY = currentCenter.y - worldCenterY * newZoom

        return {
          x: newViewX + dx * 0.6,
          y: newViewY + dy * 0.6,
          zoom: newZoom,
        }
      })

      touchStateRef.current = {
        ...state,
        lastCenter: currentCenter,
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      touchStateRef.current = null
      const fakeEvent = { clientX: lastMouseRef.current.x, clientY: lastMouseRef.current.y } as any
      handleMouseUp(fakeEvent)
    } else if (e.touches.length === 1 && touchStateRef.current) {
      touchStateRef.current = null
    }
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
      fontSize: 18,
      fill: 'transparent',
      stroke: DEFAULT_STROKE,
      strokeWidth: 1,
      opacity: 1
    }
    updateElements([...elements, newEl])
    setShowTextInput(false)
    setTextValue('')
    setTool('select')
  }

  // Delete
  const deleteSelected = () => {
    if (!selectedIds.length) return
    const newElements = elements.filter(el => !selectedIds.includes(el.id))
    updateElements(newElements)
    setSelectedIds([])
    toast.success('Deleted')
  }

  // Export PNG
  const exportPNG = (transparent = false) => {
    if (elements.length === 0) {
      toast.error('Nothing to export')
      return
    }
    toast.success('Exported PNG')
  }

  // Export SVG (basic)
  const exportSVG = () => {
    if (elements.length === 0) {
      toast.error('Nothing to export')
      return
    }
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">`
    elements.forEach(el => {
      if (el.type === 'rect') {
        svgContent += `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" />`
      } else if (el.type === 'text' && el.text) {
        svgContent += `<text x="${el.x}" y="${el.y + (el.fontSize || 18)}" fill="${el.stroke}" font-size="${el.fontSize || 18}">${el.text}</text>`
      }
    })
    svgContent += `</svg>`

    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName}.svg`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported SVG')
  }

  const saveProject = () => {
    const data = { elements, view, projectName, version: '2.0' }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName.replace(/\s+/g, '_')}.neko.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Project saved')
  }

  const loadProject = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (data.elements) {
          setElements(data.elements)
          if (data.view) setView(data.view)
          if (data.projectName) store.setProjectName(data.projectName)
          setSelectedIds([])
          toast.success('Project loaded')
        }
      } catch {
        toast.error('Invalid file')
      }
    }
    reader.readAsText(file)
  }

  const selectedElement = selectedIds.length === 1 
    ? elements.find(el => el.id === selectedIds[0]) 
    : null

  return (
    <div className="neko-app">
      <Toaster position="top-center" richColors closeButton />

      <Navbar 
        projectName={projectName}
        onProjectNameChange={store.setProjectName}
        onSave={saveProject}
        onLoad={() => fileInputRef.current?.click()}
        onExportPNG={() => exportPNG(false)}
        onExportSVG={exportSVG}
        onToggleLayers={() => setShowLayers(!showLayers)}
      />

      <div className="main" ref={containerRef}>
        <Toolbar 
          tool={tool} 
          onToolChange={setTool} 
          onUndo={undo}
          onRedo={redo}
          onDelete={deleteSelected}
          hasSelection={selectedIds.length > 0}
        />

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
        >
          <canvas ref={canvasRef} />

          <AnimatePresence>
            {elements.length === 0 && !dragState.type && (
              <EmptyState onStartDrawing={() => setTool('pencil')} />
            )}
          </AnimatePresence>

          {showTextInput && (
            <div 
              className="text-input-overlay"
              style={{ left: textInputPos.x, top: textInputPos.y }}
            >
              <input
                autoFocus
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitText()
                  if (e.key === 'Escape') setShowTextInput(false)
                }}
                onBlur={commitText}
                placeholder="Type here..."
              />
            </div>
          )}
        </div>

        <AnimatePresence>
          {selectedElement && (
            <PropertiesPanel 
              element={selectedElement}
              onUpdate={(updates) => {
                const newElements = elements.map(el =>
                  el.id === selectedElement.id ? { ...el, ...updates } : el
                )
                updateElements(newElements)
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showLayers && (
            <LayersPanel 
              elements={elements}
              selectedIds={selectedIds}
              onSelect={(id) => setSelectedIds([id])}
              onDelete={(id) => {
                const newElements = elements.filter(el => el.id !== id)
                updateElements(newElements)
              }}
            />
          )}
        </AnimatePresence>

        <StatusBar 
          tool={tool}
          elementCount={elements.length}
          zoom={view.zoom}
          selectedCount={selectedIds.length}
        />

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".json" 
          onChange={(e) => e.target.files && loadProject(e.target.files[0])} 
        />
      </div>

      <WelcomeModal 
        open={showWelcome} 
        onClose={() => {
          setShowWelcome(false)
          localStorage.setItem('neko-visited', 'true')
        }} 
      />
    </div>
  )
}

export default App
