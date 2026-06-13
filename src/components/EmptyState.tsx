import React from 'react'
import { Pencil, MousePointer2, Square } from 'lucide-react'

interface EmptyStateProps {
  onStartDrawing: () => void
}

export default function EmptyState({ onStartDrawing }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900">
          <Pencil className="h-8 w-8 text-zinc-400" />
        </div>
        
        <h2>Your canvas is empty</h2>
        <p>
          Start drawing with the pencil, create shapes, or add text. 
          Everything is saved automatically.
        </p>

        <div className="quick-actions">
          <button 
            onClick={onStartDrawing}
            className="btn btn-primary"
          >
            <Pencil size={16} /> Start drawing
          </button>
          <button className="btn">
            <Square size={16} /> Add rectangle
          </button>
          <button className="btn">
            <MousePointer2 size={16} /> Select tool
          </button>
        </div>

        <div className="mt-8 text-xs text-zinc-500">
          Tip: Press <kbd className="rounded bg-zinc-800 px-1.5 py-0.5">V</kbd> for select • 
          <kbd className="ml-1.5 rounded bg-zinc-800 px-1.5 py-0.5">P</kbd> for pencil
        </div>
      </div>
    </div>
  )
}