import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Point {
  x: number
  y: number
}

export interface Element {
  id: string
  type: 'rect' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'pencil' | 'text' | 'image'
  x: number
  y: number
  w?: number
  h?: number
  points?: Point[]
  text?: string
  fontSize?: number
  src?: string
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}

export interface View {
  x: number
  y: number
  zoom: number
}

interface NekoState {
  elements: Element[]
  view: View
  tool: string
  selectedIds: string[]
  projectName: string
  showWelcome: boolean

  setElements: (elements: Element[] | ((prev: Element[]) => Element[])) => void
  setView: (view: View | ((prev: View) => View)) => void
  setTool: (tool: string) => void
  setSelectedIds: (ids: string[] | ((prev: string[]) => string[])) => void
  setProjectName: (name: string) => void
  setShowWelcome: (show: boolean) => void

  history: Element[][]
  historyIndex: number
  pushToHistory: (elements: Element[]) => void
  undo: () => void
  redo: () => void

  loadFromStorage: () => void
  saveToStorage: () => void
}

export const useNekoStore = create<NekoState>()(
  persist(
    (set, get) => ({
      elements: [],
      view: { x: 200, y: 150, zoom: 1 },
      tool: 'select',
      selectedIds: [],
      projectName: 'Untitled Drawing',
      showWelcome: true,

      setElements: (elements) =>
        set((state) => ({
          elements: typeof elements === 'function' ? elements(state.elements) : elements,
        })),

      setView: (view) =>
        set((state) => ({
          view: typeof view === 'function' ? view(state.view) : view,
        })),

      setTool: (tool) => set({ tool }),
      setSelectedIds: (ids) =>
        set((state) => ({
          selectedIds: typeof ids === 'function' ? ids(state.selectedIds) : ids,
        })),
      setProjectName: (projectName) => set({ projectName }),
      setShowWelcome: (showWelcome) => set({ showWelcome }),

      history: [[]],
      historyIndex: 0,

      pushToHistory: (newElements) => {
        const { history, historyIndex } = get()
        const newHistory = history.slice(0, historyIndex + 1)
        newHistory.push(JSON.parse(JSON.stringify(newElements)))
        if (newHistory.length > 50) newHistory.shift()
        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        })
      },

      undo: () => {
        const { historyIndex, history } = get()
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1
          set({
            elements: JSON.parse(JSON.stringify(history[newIndex])),
            historyIndex: newIndex,
            selectedIds: [],
          })
        }
      },

      redo: () => {
        const { historyIndex, history } = get()
        if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1
          set({
            elements: JSON.parse(JSON.stringify(history[newIndex])),
            historyIndex: newIndex,
            selectedIds: [],
          })
        }
      },

      loadFromStorage: () => {
        const saved = localStorage.getItem('neko-project-v2')
        if (saved) {
          try {
            const data = JSON.parse(saved)
            if (data.elements) set({ elements: data.elements })
            if (data.view) set({ view: data.view })
            if (data.projectName) set({ projectName: data.projectName })
            if (data.showWelcome !== undefined) set({ showWelcome: data.showWelcome })
          } catch (e) {}
        }
      },

      saveToStorage: () => {
        const { elements, view, projectName, showWelcome } = get()
        localStorage.setItem(
          'neko-project-v2',
          JSON.stringify({ elements, view, projectName, showWelcome, savedAt: Date.now() })
        )
      },
    }),
    {
      name: 'neko-storage',
      partialize: (state) => ({
        elements: state.elements,
        view: state.view,
        projectName: state.projectName,
        showWelcome: state.showWelcome,
      }),
    }
  )
)