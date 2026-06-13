import React from 'react'
import { 
  MousePointer2, Hand, Pencil, Square, Circle, Diamond, Minus, ArrowRight, 
  Type, Eraser, Trash2, Undo, Redo 
} from 'lucide-react'

interface ToolbarProps {
  tool: string
  onToolChange: (tool: string) => void
  onUndo: () => void
  onRedo: () => void
  onDelete: () => void
  hasSelection: boolean
}

const tools = [
  { id: 'select', icon: MousePointer2, group: 'edit' },
  { id: 'hand', icon: Hand, group: 'edit' },
  { id: 'pencil', icon: Pencil, group: 'draw' },
  { id: 'rect', icon: Square, group: 'shapes' },
  { id: 'ellipse', icon: Circle, group: 'shapes' },
  { id: 'diamond', icon: Diamond, group: 'shapes' },
  { id: 'line', icon: Minus, group: 'shapes' },
  { id: 'arrow', icon: ArrowRight, group: 'shapes' },
  { id: 'text', icon: Type, group: 'draw' },
  { id: 'eraser', icon: Eraser, group: 'edit' },
]

export default function Toolbar({ 
  tool, onToolChange, onUndo, onRedo, onDelete, hasSelection 
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="tool-group">
        {tools.filter(t => t.group === 'edit').map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => onToolChange(t.id)}
              className={`tool-btn ${tool === t.id ? 'active' : ''}`}
              title={t.id.charAt(0).toUpperCase() + t.id.slice(1)}
            >
              <Icon size={20} />
            </button>
          )
        })}
      </div>

      <div className="tool-group">
        {tools.filter(t => t.group === 'draw').map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => onToolChange(t.id)}
              className={`tool-btn ${tool === t.id ? 'active' : ''}`}
              title={t.id.charAt(0).toUpperCase() + t.id.slice(1)}
            >
              <Icon size={20} />
            </button>
          )
        })}
      </div>

      <div className="tool-group">
        {tools.filter(t => t.group === 'shapes').map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => onToolChange(t.id)}
              className={`tool-btn ${tool === t.id ? 'active' : ''}`}
              title={t.id.charAt(0).toUpperCase() + t.id.slice(1)}
            >
              <Icon size={20} />
            </button>
          )
        })}
      </div>

      <div className="tool-group">
        <button onClick={onUndo} className="tool-btn" title="Undo (Ctrl+Z)">
          <Undo size={18} />
        </button>
        <button onClick={onRedo} className="tool-btn" title="Redo">
          <Redo size={18} />
        </button>
        <button 
          onClick={onDelete} 
          className="tool-btn" 
          disabled={!hasSelection}
          title="Delete"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  )
}