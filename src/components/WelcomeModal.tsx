import React from 'react'
import { X, Pencil, MousePointer2, Download } from 'lucide-react'

interface WelcomeModalProps {
  open: boolean
  onClose: () => void
}

export default function WelcomeModal({ open, onClose }: WelcomeModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 p-8">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-indigo-500 flex items-center justify-center">
                <span className="text-white text-xl font-bold">N</span>
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Welcome to Neko</h2>
                <p className="text-sm text-zinc-400">A calm, beautiful infinite canvas</p>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="my-8 space-y-5 text-sm">
          <div className="flex gap-4">
            <div className="mt-1 text-indigo-400"><Pencil size={18} /></div>
            <div>
              <div className="font-medium">Draw naturally</div>
              <div className="text-zinc-400">Use pencil, shapes, text and images. Everything feels hand-crafted.</div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="mt-1 text-indigo-400"><MousePointer2 size={18} /></div>
            <div>
              <div className="font-medium">Organize freely</div>
              <div className="text-zinc-400">Select, move, resize and layer elements. Export to PNG or SVG anytime.</div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="mt-1 text-indigo-400"><Download size={18} /></div>
            <div>
              <div className="font-medium">Your work is safe</div>
              <div className="text-zinc-400">Auto-saved locally. Load and save JSON projects whenever you want.</div>
            </div>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="w-full btn btn-primary py-3 text-base"
        >
          Start creating
        </button>
        
        <p className="mt-4 text-center text-xs text-zinc-500">
          Press <span className="font-mono">?</span> anytime for shortcuts
        </p>
      </div>
    </div>
  )
}