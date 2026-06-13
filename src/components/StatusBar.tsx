import React from 'react'

interface StatusBarProps {
  tool: string
  elementCount: number
  zoom: number
  selectedCount: number
}

export default function StatusBar({ tool, elementCount, zoom, selectedCount }: StatusBarProps) {
  return (
    <div className="status-bar">
      <span className="font-mono text-[10px]">{tool.toUpperCase()}</span>
      <div className="divider" />
      <span>{elementCount} elements</span>
      {selectedCount > 0 && (
        <>
          <div className="divider" />
          <span>{selectedCount} selected</span>
        </>
      )}
      <div className="divider" />
      <span>{Math.round(zoom * 100)}%</span>
      <div className="divider hidden md:block" />
      <span className="hidden md:inline text-[10px]">Space = Pan • V = Select • P = Pencil</span>
    </div>
  )
}