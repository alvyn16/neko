import React from 'react'
import { Element } from '../store/useNekoStore'

interface PropertiesPanelProps {
  element: Element
  onUpdate: (updates: Partial<Element>) => void
}

export default function PropertiesPanel({ element, onUpdate }: PropertiesPanelProps) {
  return (
    <div className="properties-panel">
      <h3>Properties — {element.type}</h3>

      <div className="prop-section">
        <div className="prop-row">
          <span className="prop-label">Fill</span>
          <input
            type="color"
            className="color-input"
            value={element.fill}
            onChange={(e) => onUpdate({ fill: e.target.value })}
          />
        </div>

        <div className="prop-row">
          <span className="prop-label">Stroke</span>
          <input
            type="color"
            className="color-input"
            value={element.stroke}
            onChange={(e) => onUpdate({ stroke: e.target.value })}
          />
        </div>
      </div>

      <div className="prop-section">
        <div className="prop-row">
          <span className="prop-label">Stroke width</span>
          <input
            type="range"
            min="0.5"
            max="12"
            step="0.5"
            value={element.strokeWidth}
            onChange={(e) => onUpdate({ strokeWidth: parseFloat(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-xs w-8 text-right">{element.strokeWidth}</span>
        </div>

        <div className="prop-row">
          <span className="prop-label">Opacity</span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={element.opacity ?? 1}
            onChange={(e) => onUpdate({ opacity: parseFloat(e.target.value) })}
            className="slider flex-1"
          />
          <span className="text-xs w-8 text-right">
            {Math.round((element.opacity ?? 1) * 100)}%
          </span>
        </div>
      </div>

      {element.type === 'text' && (
        <div className="prop-section">
          <div className="prop-row">
            <span className="prop-label">Font size</span>
            <input
              type="range"
              min="10"
              max="72"
              value={element.fontSize || 18}
              onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) })}
              className="slider flex-1"
            />
            <span className="text-xs w-8 text-right">{element.fontSize || 18}</span>
          </div>
        </div>
      )}
    </div>
  )
}