import React from 'react'
import { Trash2 } from 'lucide-react'
import type { Element } from '../store/useNekoStore'

interface Props {
  elements: Element[]
  selectedIds: string[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

export default function LayersPanel({ elements, selectedIds, onSelect, onDelete }: Props) {
  return (
    <div className="properties-panel" style={{ top: '80px', maxHeight: '55vh', overflowY: 'auto' }}>
      <h3>Layers ({elements.length})</h3>
      {elements.length === 0 && <p className="text-xs text-zinc-500 py-2">No elements yet</p>}

      <div className="space-y-1 text-sm">
        {elements.slice().reverse().map((el, index) => {
          const isSelected = selectedIds.includes(el.id)
          return (
            <div
              key={el.id}
              onClick={() => onSelect(el.id)}
              className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}
            >
              <div className="flex items-center gap-3">
                <div className="text-xs text-zinc-500 w-5 text-right font-mono">{elements.length - index}</div>
                <div>
                  <div className="font-medium capitalize">{el.type}</div>
                  <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[140px]">
                    {el.text || `${Math.round(el.x)}, ${Math.round(el.y)}`}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(el.id) }}
                className="p-1 text-zinc-400 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}