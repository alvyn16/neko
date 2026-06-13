import React, { useEffect, useRef, useCallback, useState } from 'react'
import rough from 'roughjs/bin/rough'

import { useNekoStore, type Element, type Point, type View } from './store/useNekoStore'
import { useCanvasTransform } from './hooks/useCanvasTransform'
import { useTouchGestures } from './hooks/useTouchGestures'

import Navbar from './components/Navbar'
import Toolbar from './components/Toolbar'
import PropertiesPanel from './components/PropertiesPanel'
import LayersPanel from './components/LayersPanel'
import WelcomeModal from './components/WelcomeModal'
import EmptyState from './components/EmptyState'
import StatusBar from './components/StatusBar'

const DEFAULT_FILL = '#1f2937'
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
  const [toastMsg, setToastMsg] = useState('')

  const currentPencilPointsRef = useRef<Point[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const roughRef = useRef<any>(null)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { screenToWorld, getElementBounds, hitTest } = useCanvasTransform(view)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2000)
  }

  const updateElements = useCallback((newElements: Element[]) => {
    setElements(newElements)
    pushToHistory(newElements)
    const timeout = setTimeout(() => {
      localStorage.setItem('neko-project-v2', JSON.stringify({
        elements: newElements, view, projectName, savedAt: Date.now()
      }))
    }, 500)
    return () => clearTimeout(timeout)
  }, [setElements, pushToHistory, view, projectName])

  const getElementAtPoint = useCallback((wx: number, wy: number): Element | null => {
    for (let i = elements.length - 1; i >= 0; i--) {
      if (hitTest(elements[i], wx, wy)) return elements[i]
    }
    return null
  }, [elements, hitTest])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })!
    ctx.save()
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = '#1f2937'
    ctx.lineWidth = 1
    const gridSize = 50
    const startX = Math.floor((0 - view.x) / view.zoom / gridSize) * gridSize
    const endX = Math.ceil((canvas.width - view.x) / view.zoom / gridSize) * gridSize
    const startY = Math.floor((0 - view.y) / view.zoom / gridSize) * gridSize
    const endY = Math.ceil((canvas.height - view.y) / view.zoom / gridSize) * gridSize

    ctx.beginPath()
    for (let x = startX; x <= endX; x += gridSize) { ctx.moveTo(x * view.zoom + view.x, 0); ctx.lineTo(x * view.zoom + view.x, canvas.height) }
    for (let y = startY; y <= endY; y += gridSize) { ctx.moveTo(0, y * view.zoom + view.y); ctx.lineTo(canvas.width, y * view.zoom + view.y) }
    ctx.stroke()

    ctx.translate(view.x, view.y)
    ctx.scale(view.zoom, view.zoom)

    const rc = roughRef.current || (roughRef.current = rough.canvas(canvas))

    elements.forEach(el => {
      ctx.save()
      ctx.globalAlpha = el.opacity ?? 1
      const opts: any = { fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth, roughness: 1.1, bowing: 0.6 }

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

    setIsDrawing(true)
    setDragState({ type: 'draw', startX: sx, startY: sy })
    if (tool === 'pencil') currentPencilPointsRef.current = [world]
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
        if (el.points) return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
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
    if (dragState.type === 'draw' || dragState.type === 'marquee') draw()
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    const world = screenToWorld(lastMouseRef.current.x, lastMouseRef.current.y)

    if (dragState.type === 'pan') { setDragState({ type: null, startX: 0, startY: 0 }); return }

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
      const selected = elements.filter(el => {
        const b = getElementBounds(el)
        return b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1
      }).map(el => el.id)
      setSelectedIds(selected)
      setDragState({ type: null, startX: 0, startY: 0 })
      return
    }

    if (dragState.type === 'draw' || isDrawing) {
      const startWorld = screenToWorld(dragState.startX || 0, dragState.startY || 0)

      if (tool === 'pencil' && currentPencilPointsRef.current.length > 1) {
        const pts = currentPencilPointsRef.current
        const newEl: Element = { id: crypto.randomUUID(), type: 'pencil', x: pts[0].x, y: pts[0].y, points: pts, fill: 'transparent', stroke: DEFAULT_STROKE, strokeWidth: DEFAULT_STROKE_WIDTH, opacity: 1 }
        updateElements([...elements, newEl])
        currentPencilPointsRef.current = []
      } 
      else if (['rect', 'ellipse', 'diamond'].includes(tool)) {
        const w = Math.abs(world.x - startWorld.x)
        const h = Math.abs(world.y - startWorld.y)
        if (w > 6 && h > 6) {
          const newEl: Element = { id: crypto.randomUUID(), type: tool as any, x: Math.min(startWorld.x, world.x), y: Math.min(startWorld.y, world.y), w, h, fill: DEFAULT_FILL, stroke: DEFAULT_STROKE, strokeWidth: DEFAULT_STROKE_WIDTH, opacity: 1 }
          updateElements([...elements, newEl])
        }
      } 
      else if (tool === 'line' || tool === 'arrow') {
        const newEl: Element = { id: crypto.randomUUID(), type: tool as any, x: startWorld.x, y: startWorld.y, points: [startWorld, world], fill: 'transparent', stroke: DEFAULT_STROKE, strokeWidth: DEFAULT_STROKE_WIDTH, opacity: 1 }
        updateElements([...elements, newEl])
      }

      setDragState({ type: null, startX: 0, startY: 0 })
      setIsDrawing(false)
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

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useTouchGestures(view, setView, (type, clientX, clientY) => {
    const fake = { clientX, clientY } as any
    if (type === 'down') handleMouseDown(fake)
    else if (type === 'move') handleMouseMove(fake)
    else handleMouseUp(fake)
  })

  const commitText = () => {
    if (!textValue.trim()) return setShowTextInput(false)
    const rect = canvasRef.current!.getBoundingClientRect()
    const world = screenToWorld(textInputPos.x - rect.left, textInputPos.y - rect.top)
    const newEl: Element = { id: crypto.randomUUID(), type: 'text', x: world.x, y: world.y, text: textValue.trim(), fontSize: 18, fill: 'transparent', stroke: DEFAULT_STROKE, strokeWidth: 1, opacity: 1 }
    updateElements([...elements, newEl])
    setShowTextInput(false)
    setTextValue('')
    setTool('select')
  }

  const deleteSelected = () => {
    if (!selectedIds.length) return
    updateElements(elements.filter(el => !selectedIds.includes(el.id)))
    setSelectedIds([])
    showToast('Deleted')
  }

  const exportPNG = () => showToast(elements.length ? 'PNG exported (demo)' : 'Nothing to export')
  const exportSVG = () => {
    if (!elements.length) return showToast('Nothing to export')
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">`
    elements.forEach(el => {
      if (el.type === 'rect') svg += `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"/>`
      else if (el.type === 'text' && el.text) svg += `<text x="${el.x}" y="${el.y + 18}" fill="${el.stroke}" font-size="18">${el.text}</text>`
    })
    svg += `</svg>`
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${projectName}.svg`; a.click(); URL.revokeObjectURL(url)
    showToast('SVG exported')
  }

  const saveProject = () => {
    const data = { elements, view, projectName }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${projectName}.neko.json`; a.click(); URL.revokeObjectURL(url)
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
          setSelectedIds([])
          showToast('Project loaded')
        }
      } catch { showToast('Invalid file') }
    }
    reader.readAsText(file)
  }

  const selectedElement = selectedIds.length === 1 ? elements.find(el => el.id === selectedIds[0]) : null

  return (
    <div className="neko-app">
      <Navbar
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onSave={saveProject}
        onLoad={() => fileInputRef.current?.click()}
        onExportPNG={exportPNG}
        onExportSVG={exportSVG}
        onToggleLayers={() => setShowLayers(!showLayers)}
      />

      <div className="main" ref={containerRef}>
        <Toolbar tool={tool} onToolChange={setTool} onUndo={undo} onRedo={redo} onDelete={deleteSelected} hasSelection={selectedIds.length > 0} />

        <div className={`canvas-container ${tool === 'hand' ? 'hand' : ''}`}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={(e) => handleTouchStart(e, canvasRef.current!.getBoundingClientRect())}
          onTouchMove={(e) => handleTouchMove(e, canvasRef.current!.getBoundingClientRect())}
          onTouchEnd={handleTouchEnd}
        >
          <canvas ref={canvasRef} />

          {elements.length === 0 && !dragState.type && <EmptyState onStartDrawing={() => setTool('pencil')} />}

          {showTextInput && (
            <div className="text-input-overlay" style={{ left: textInputPos.x, top: textInputPos.y }}>
              <input autoFocus value={textValue} onChange={e => setTextValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setShowTextInput(false) }} onBlur={commitText} placeholder="Type text..." />
            </div>
          )}
        </div>

        {selectedElement && (
          <PropertiesPanel element={selectedElement} onUpdate={(updates) => updateElements(elements.map(el => el.id === selectedElement.id ? { ...el, ...updates } : el))} />
        )}

        {showLayers && (
          <LayersPanel
            elements={elements}
            selectedIds={selectedIds}
            onSelect={(id) => setSelectedIds([id])}
            onDelete={(id) => {
              updateElements(elements.filter(el => el.id !== id))
              if (selectedIds.includes(id)) setSelectedIds([])
            }}
          />
        )}

        <StatusBar tool={tool} elementCount={elements.length} zoom={view.zoom} selectedCount={selectedIds.length} />

        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={e => e.target.files && loadProject(e.target.files[0])} />
      </div>

      <WelcomeModal open={showWelcome} onClose={() => { setShowWelcome(false); localStorage.setItem('neko-visited', 'true') }} />

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  )
}