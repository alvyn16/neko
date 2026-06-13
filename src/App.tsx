import React, { useEffect, useRef, useCallback, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { AnimatePresence } from 'framer-motion'

import { useNekoStore } from './store/useNekoStore'
import { useCanvasTransform } from './hooks/useCanvasTransform'
import { useTouchGestures } from './hooks/useTouchGestures'
import { useDrawing } from './hooks/useDrawing'

import Navbar from './components/Navbar'
import Toolbar from './components/Toolbar'
import PropertiesPanel from './components/PropertiesPanel'
import LayersPanel from './components/LayersPanel'
import WelcomeModal from './components/WelcomeModal'
import EmptyState from './components/EmptyState'
import StatusBar from './components/StatusBar'

import rough from 'roughjs/bin/rough'

const DEFAULT_STROKE = '#6366f1'
const DEFAULT_STROKE_WIDTH = 2

export default function App() {
  const store = useNekoStore()
  const {
    elements, setElements,
    view, setView,
    tool, setTool,
    selectedIds, setSelectedIds,
    projectName, setProjectName,
    pushToHistory, undo, redo,
    loadFromStorage, saveToStorage,
    showWelcome, setShowWelcome
  } = store

  const [dragState, setDragState] = useState<any>({ type: null, startX: 0, startY: 0 })
  const [showTextInput, setShowTextInput] = useState(false)
  const [textInputPos, setTextInputPos] = useState({ x: 0, y: 0 })
  const [textValue, setTextValue] = useState('')
  const [isDrawing, setIsDrawing] = useState(false)
  const [showLayers, setShowLayers] = useState(false)

  const currentPencilPointsRef = useRef<any[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const roughRef = useRef<any>(null)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { screenToWorld, worldToScreen, getElementBounds, hitTest } = useCanvasTransform(view)

  const getElementAtPoint = useCallback((wx: number, wy: number) => {
    for (let i = elements.length - 1; i >= 0; i--) {
      if (hitTest(elements[i], wx, wy)) return elements[i]
    }
    return null
  }, [elements, hitTest])

  const { startDrawing, finishDrawing } = useDrawing({
    tool,
    elements,
    updateElements: (els) => {
      setElements(els)
      pushToHistory(els)
      saveToStorage()
    },
    setSelectedIds,
    setTool,
    screenToWorld,
    getElementAtPoint,
    getElementBounds,
  })

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useTouchGestures(
    view,
    setView,
    (type, clientX, clientY) => {
      if (type === 'down') handleMouseDown({ clientX, clientY } as any)
      else if (type === 'move') handleMouseMove({ clientX, clientY } as any)
      else handleMouseUp({} as any)
    }
  )

  useEffect(() => {
    loadFromStorage()
    if (localStorage.getItem('neko-visited')) setShowWelcome(false)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })!
    ctx.save()
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 1
    const grid = 50
    const startX = Math.floor((0 - view.x) / view.zoom / grid) * grid
    const endX = Math.ceil((canvas.width - view.x) / view.zoom / grid) * grid
    const startY = Math.floor((0 - view.y) / view.zoom / grid) * grid
    const endY = Math.ceil((canvas.height - view.y) / view.zoom / grid) * grid

    ctx.beginPath()
    for (let x = startX; x <= endX; x += grid) { ctx.moveTo(x * view.zoom + view.x, 0); ctx.lineTo(x * view.zoom + view.x, canvas.height) }
    for (let y = startY; y <= endY; y += grid) { ctx.moveTo(0, y * view.zoom + view.y); ctx.lineTo(canvas.width, y * view.zoom + view.y) }
    ctx.stroke()

    ctx.translate(view.x, view.y)
    ctx.scale(view.zoom, view.zoom)

    const rc = roughRef.current || (roughRef.current = rough.canvas(canvas))

    elements.forEach(el => {
      ctx.save()
      ctx.globalAlpha = el.opacity ?? 1
      const opts = { fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth, roughness: 1.1, bowing: 0.6 }

      if (el.type === 'rect') rc.rectangle(el.x, el.y, el.w || 0, el.h || 0, opts)
      else if (el.type === 'ellipse') rc.ellipse(el.x + (el.w||0)/2, el.y + (el.h||0)/2, el.w||0, el.h||0, opts)
      else if (el.type === 'diamond') {
        const cx = el.x + (el.w||0)/2, cy = el.y + (el.h||0)/2, hw = (el.w||0)/2, hh = (el.h||0)/2
        rc.polygon([[cx, cy-hh], [cx+hw, cy], [cx, cy+hh], [cx-hw, cy]], opts)
      }
      else if ((el.type === 'line' || el.type === 'arrow') && el.points?.length >= 2) {
        const [p1, p2] = el.points
        rc.line(p1.x, p1.y, p2.x, p2.y, opts)
        if (el.type === 'arrow') {
          const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x)
          const hl = 14
          rc.line(p2.x, p2.y, p2.x - hl * Math.cos(ang - 0.5), p2.y - hl * Math.sin(ang - 0.5), { stroke: el.stroke, strokeWidth: el.strokeWidth })
          rc.line(p2.x, p2.y, p2.x - hl * Math.cos(ang + 0.5), p2.y - hl * Math.sin(ang + 0.5), { stroke: el.stroke, strokeWidth: el.strokeWidth })
        }
      }
      else if (el.type === 'pencil' && el.points) rc.linearPath(el.points.map(p => [p.x, p.y]), opts)
      else if (el.type === 'image' && el.src) {
        let img = imageCacheRef.current.get(el.id)
        if (!img) { img = new Image(); img.src = el.src; imageCacheRef.current.set(el.id, img); img.onload = draw }
        if (img.complete) ctx.drawImage(img, el.x, el.y, el.w || 300, el.h || 200)
      }
      else if (el.type === 'text' && el.text) {
        ctx.fillStyle = el.stroke
        ctx.font = `${el.fontSize || 18}px system-ui`
        ctx.fillText(el.text, el.x, el.y)
      }
      ctx.restore()
    })

    if (currentPencilPointsRef.current.length > 1 && tool === 'pencil') {
      rc.linearPath(currentPencilPointsRef.current.map(p => [p.x, p.y]), { stroke: DEFAULT_STROKE, strokeWidth: DEFAULT_STROKE_WIDTH, roughness: 1.1 })
    }
    ctx.restore()
  }, [elements, view, tool])

  useEffect(() => { draw() }, [draw])

  const resizeCanvas = useCallback(() => {
    const c = canvasRef.current, cont = containerRef.current
    if (!c || !cont) return
    const dpr = window.devicePixelRatio || 1
    c.width = cont.clientWidth * dpr
    c.height = cont.clientHeight * dpr
    c.style.width = `${cont.clientWidth}px`
    c.style.height = `${cont.clientHeight}px`
    c.getContext('2d')!.scale(dpr, dpr)
    draw()
  }, [draw])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = screenToWorld(sx, sy)
    lastMouseRef.current = { x: sx, y: sy }

    if (tool === 'hand') { setDragState({ type: 'pan', startX: sx, startY: sy }); return }
    if (tool === 'select') {
      const hit = getElementAtPoint(world.x, world.y)
      if (hit) {
        if (!selectedIds.includes(hit.id)) setSelectedIds([hit.id])
        setDragState({ type: 'move', startX: world.x, startY: world.y, elementId: hit.id })
      } else {
        setSelectedIds([])
        setDragState({ type: 'marquee', startX: sx, startY: sy, marqueeStart: world })
      }
      return
    }
    if (tool === 'text') {
      setTextInputPos({ x: e.clientX, y: e.clientY })
      setTextValue('')
      setShowTextInput(true)
      return
    }
    startDrawing(world, currentPencilPointsRef, setDragState, setIsDrawing)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    lastMouseRef.current = { x: sx, y: sy }
    const world = screenToWorld(sx, sy)

    if (dragState.type === 'pan') {
      setView(v => ({ ...v, x: v.x + (sx - dragState.startX), y: v.y + (sy - dragState.startY) }))
      setDragState({ ...dragState, startX: sx, startY: sy })
      return
    }
    if (dragState.type === 'move' && dragState.elementId) {
      const dx = world.x - dragState.startX
      const dy = world.y - dragState.startY
      const newEls = elements.map(el => {
        if (!selectedIds.includes(el.id)) return el
        if (el.points) return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
        return { ...el, x: el.x + dx, y: el.y + dy }
      })
      setElements(newEls)
      return
    }
    if (dragState.type === 'draw' && tool === 'pencil') {
      currentPencilPointsRef.current.push(world)
      draw()
      return
    }
    draw()
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    const world = screenToWorld(lastMouseRef.current.x, lastMouseRef.current.y)
    if (dragState.type === 'pan') { setDragState({ type: null, startX: 0, startY: 0 }); return }
    if (dragState.type === 'move') { 
      // In real app connect to store update
      setDragState({ type: null, startX: 0, startY: 0 })
      return 
    }
    if (dragState.type === 'draw' || isDrawing) {
      const startWorld = screenToWorld(dragState.startX || 0, dragState.startY || 0)
      finishDrawing(startWorld, world, currentPencilPointsRef, setDragState, setIsDrawing)
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top
    const before = screenToWorld(sx, sy)
    const delta = e.deltaY > 0 ? 0.88 : 1.13
    const nz = Math.max(0.08, Math.min(12, view.zoom * delta))
    setView({ x: sx - before.x * nz, y: sy - before.y * nz, zoom: nz })
  }

  const commitText = () => {
    if (!textValue.trim()) return setShowTextInput(false)
    const rect = canvasRef.current!.getBoundingClientRect()
    const world = screenToWorld(textInputPos.x - rect.left, textInputPos.y - rect.top)
    const newEl = { id: crypto.randomUUID(), type: 'text' as const, x: world.x, y: world.y, text: textValue.trim(), fontSize: 18, fill: 'transparent', stroke: DEFAULT_STROKE, strokeWidth: 1, opacity: 1 }
    // updateElements
    setShowTextInput(false)
    setTextValue('')
    setTool('select')
  }

  const deleteSelected = () => {
    if (!selectedIds.length) return
    // storeUpdateElements
    setSelectedIds([])
    toast.success('Deleted')
  }

  const selectedElement = selectedIds.length === 1 ? elements.find(e => e.id === selectedIds[0]) : null

  return (
    <div className="neko-app">
      <Toaster position="top-center" richColors />

      <Navbar
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onSave={() => toast('Save coming soon')}
        onLoad={() => fileInputRef.current?.click()}
        onExportPNG={() => toast('PNG export')}
        onExportSVG={() => toast('SVG export improved')}
        onToggleLayers={() => setShowLayers(!showLayers)}
      />

      <div className="main" ref={containerRef}>
        <Toolbar tool={tool} onToolChange={setTool} onUndo={undo} onRedo={redo} onDelete={deleteSelected} hasSelection={selectedIds.length > 0} />

        <div
          className={`canvas-container ${tool === 'hand' ? 'hand' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={(e) => handleTouchStart(e, canvasRef.current!.getBoundingClientRect())}
          onTouchMove={(e) => handleTouchMove(e, canvasRef.current!.getBoundingClientRect())}
          onTouchEnd={handleTouchEnd}
        >
          <canvas ref={canvasRef} />

          <AnimatePresence>
            {elements.length === 0 && <EmptyState onStartDrawing={() => setTool('pencil')} />}
          </AnimatePresence>

          {showTextInput && (
            <div className="text-input-overlay" style={{ left: textInputPos.x, top: textInputPos.y }}>
              <input autoFocus value={textValue} onChange={e => setTextValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setShowTextInput(false) }} onBlur={commitText} placeholder="Type..." />
            </div>
          )}
        </div>

        <AnimatePresence>
          {selectedElement && <PropertiesPanel element={selectedElement} onUpdate={(u) => { /* update logic */ }} />}
        </AnimatePresence>

        <AnimatePresence>
          {showLayers && <LayersPanel elements={elements} selectedIds={selectedIds} onSelect={id => setSelectedIds([id])} onDelete={id => { /* delete */ }} />}
        </AnimatePresence>

        <StatusBar tool={tool} elementCount={elements.length} zoom={view.zoom} selectedCount={selectedIds.length} />

        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={e => e.target.files && toast('Load project')} />
      </div>

      <WelcomeModal open={showWelcome} onClose={() => { setShowWelcome(false); localStorage.setItem('neko-visited', 'true') }} />
    </div>
  )
}