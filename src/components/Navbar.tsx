import React from 'react'
import { Save, Upload, Download, Layers } from 'lucide-react'

interface NavbarProps {
  projectName: string
  onProjectNameChange: (name: string) => void
  onSave: () => void
  onLoad: () => void
  onExportPNG: () => void
  onExportSVG: () => void
  onToggleLayers: () => void
}

export default function Navbar({
  projectName,
  onProjectNameChange,
  onSave,
  onLoad,
  onExportPNG,
  onExportSVG,
  onToggleLayers
}: NavbarProps) {
  return (
    <div className="navbar">
      <div className="navbar-left">
        <div className="logo">
          <div className="logo-dot" />
          Neko
        </div>
        
        <input
          className="project-name-input"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          placeholder="Project name"
        />
      </div>

      <div className="navbar-actions">
        <button onClick={onToggleLayers} className="btn btn-ghost" title="Toggle Layers">
          <Layers size={16} />
          <span className="hidden md:inline">Layers</span>
        </button>

        <div className="w-px h-6 bg-zinc-800 mx-1" />

        <button onClick={onSave} className="btn">
          <Save size={16} /> Save
        </button>
        
        <button onClick={onLoad} className="btn">
          <Upload size={16} /> Load
        </button>

        <button onClick={onExportPNG} className="btn btn-primary">
          <Download size={16} /> PNG
        </button>

        <button onClick={onExportSVG} className="btn">
          <Download size={16} /> SVG
        </button>
      </div>
    </div>
  )
}