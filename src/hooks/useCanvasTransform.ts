import { useCallback } from 'react'
import { Point, Element, View } from '../store/useNekoStore'

export function useCanvasTransform(view: View) {
  const screenToWorld = useCallback((sx: number, sy: number): Point => ({
    x: (sx - view.x) / view.zoom,
    y: (sy - view.y) / view.zoom,
  }), [view])

  const worldToScreen = useCallback((wx: number, wy: number): Point => ({
    x: wx * view.zoom + view.x,
    y: wy * view.zoom + view.y,
  }), [view])

  const getElementBounds = useCallback((el: Element) => {
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
  }, [])

  const hitTest = useCallback((el: Element, wx: number, wy: number): boolean => {
    const b = getElementBounds(el)
    const pad = (el.strokeWidth || 2) + 8
    return wx >= b.x - pad && wx <= b.x + b.w + pad &&
           wy >= b.y - pad && wy <= b.y + b.h + pad
  }, [getElementBounds])

  return {
    screenToWorld,
    worldToScreen,
    getElementBounds,
    hitTest,
  }
}