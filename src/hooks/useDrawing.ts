import { useCallback } from 'react'
import type { Element, Point } from '../store/useNekoStore'

interface UseDrawingProps {
  tool: string
  elements: Element[]
  updateElements: (newElements: Element[]) => void
  setSelectedIds: (ids: string[]) => void
  setTool: (tool: string) => void
  screenToWorld: (sx: number, sy: number) => Point
  getElementAtPoint: (wx: number, wy: number) => Element | null
  getElementBounds: (el: Element) => { x: number; y: number; w: number; h: number }
}

export function useDrawing({
  tool,
  elements,
  updateElements,
  setSelectedIds,
  setTool,
  screenToWorld,
  getElementAtPoint,
  getElementBounds,
}: UseDrawingProps) {

  const startDrawing = useCallback((
    world: Point,
    currentPencilPointsRef: React.MutableRefObject<Point[]>,
    setDragState: any,
    setIsDrawing: (v: boolean) => void
  ) => {
    setIsDrawing(true)
    setDragState({ type: 'draw', startX: 0, startY: 0 })

    if (tool === 'pencil') {
      currentPencilPointsRef.current = [world]
    }
  }, [tool])

  const finishDrawing = useCallback((
    startWorld: Point,
    world: Point,
    currentPencilPointsRef: React.MutableRefObject<Point[]>,
    setDragState: any,
    setIsDrawing: (v: boolean) => void
  ) => {
    if (tool === 'pencil' && currentPencilPointsRef.current.length > 1) {
      const pts = currentPencilPointsRef.current
      const newEl: Element = {
        id: crypto.randomUUID(),
        type: 'pencil',
        x: pts[0].x,
        y: pts[0].y,
        points: pts,
        fill: 'transparent',
        stroke: '#6366f1',
        strokeWidth: 2,
        opacity: 1,
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
          fill: '#1f2937',
          stroke: '#6366f1',
          strokeWidth: 2,
          opacity: 1,
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
        stroke: '#6366f1',
        strokeWidth: 2,
        opacity: 1,
      }
      updateElements([...elements, newEl])
    }

    setDragState({ type: null, startX: 0, startY: 0 })
    setIsDrawing(false)
  }, [tool, elements, updateElements])

  return {
    startDrawing,
    finishDrawing,
  }
}