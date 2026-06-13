import { useRef, useCallback } from 'react'
import type { View } from '../store/useNekoStore'

export function useTouchGestures(
  view: View,
  setView: (v: View | ((prev: View) => View)) => void,
  onSingleFinger: (type: 'down' | 'move' | 'up', clientX: number, clientY: number) => void
) {
  const gestureRef = useRef<any>(null)

  const getDistance = (touches: React.TouchList) =>
    touches.length < 2 ? 0 : Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    )

  const getCenter = (touches: React.TouchList, rect: DOMRect) => {
    if (touches.length === 1) {
      return { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top }
    }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
    }
  }

  const handleTouchStart = useCallback((e: React.TouchEvent, rect: DOMRect) => {
    e.preventDefault()
    if (e.touches.length === 1) {
      gestureRef.current = null
      onSingleFinger('down', e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2) {
      gestureRef.current = {
        initialDistance: getDistance(e.touches),
        initialZoom: view.zoom,
        lastCenter: getCenter(e.touches, rect),
      }
    }
  }, [view.zoom, onSingleFinger])

  const handleTouchMove = useCallback((e: React.TouchEvent, rect: DOMRect) => {
    e.preventDefault()
    if (e.touches.length === 1 && !gestureRef.current) {
      onSingleFinger('move', e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2 && gestureRef.current) {
      const currentDistance = getDistance(e.touches)
      const currentCenter = getCenter(e.touches, rect)
      const state = gestureRef.current

      const scale = currentDistance / state.initialDistance
      const newZoom = Math.max(0.1, Math.min(12, state.initialZoom * scale))

      const dx = currentCenter.x - state.lastCenter.x
      const dy = currentCenter.y - state.lastCenter.y

      setView(prev => {
        const wx = (currentCenter.x - prev.x) / prev.zoom
        const wy = (currentCenter.y - prev.y) / prev.zoom
        return {
          x: currentCenter.x - wx * newZoom + dx * 0.6,
          y: currentCenter.y - wy * newZoom + dy * 0.6,
          zoom: newZoom,
        }
      })
      gestureRef.current.lastCenter = currentCenter
    }
  }, [setView, onSingleFinger])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      gestureRef.current = null
      onSingleFinger('up', 0, 0)
    } else if (e.touches.length === 1) {
      gestureRef.current = null
    }
  }, [onSingleFinger])

  return { handleTouchStart, handleTouchMove, handleTouchEnd }
}