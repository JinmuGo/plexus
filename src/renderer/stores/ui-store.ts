/**
 * UI Store
 *
 * Zustand store for UI state management.
 * Handles view mode, session selection, panel state, and keyboard navigation.
 */

import { create } from 'zustand'
import { useShallow } from 'zustand/shallow'
import type { ViewMode } from 'shared/ui-types'

// Re-export for convenience
export type { ViewMode } from 'shared/ui-types'

interface UIState {
  // View state
  viewMode: ViewMode

  // Project filter (null = 'all', 'no-project' = sessions without project)
  selectedProjectId: string | null

  // Session selection
  selectedSessionId: string | null

  // Keyboard navigation index for session list
  selectedSessionIndex: number

  // Side panel
  isPanelOpen: boolean

  // Keyboard navigation index for staged sessions (attention section)
  selectedAttentionIndex: number
}

interface UIActions {
  // View mode
  setViewMode: (mode: ViewMode) => void

  // Project filter
  setSelectedProject: (projectId: string | null) => void

  // Session selection
  selectSession: (sessionId: string | null) => void
  highlightSession: (sessionId: string | null) => void
  toggleSessionPanel: (sessionId: string) => void
  closePanel: () => void

  // Session list keyboard navigation
  setSelectedSessionIndex: (index: number) => void
  selectNextSession: (maxIndex: number) => void
  selectPrevSession: () => void
  selectFirstSession: () => void
  selectLastSession: (maxIndex: number) => void
  clampSessionIndex: (maxIndex: number) => void

  // Attention keyboard navigation
  setSelectedAttentionIndex: (index: number) => void
  selectNextAttention: (maxIndex: number) => void
  selectPrevAttention: () => void
  clampAttentionIndex: (maxIndex: number) => void

  // Project keyboard navigation
  selectNextProject: (projectIds: string[]) => void
  selectPrevProject: (projectIds: string[]) => void
  selectAllProjects: () => void

  // Handle session removal (close panel if selected)
  handleSessionRemoved: (sessionId: string) => void
}

export type UIStore = UIState & UIActions

export const useUIStore = create<UIStore>((set, get) => ({
  // Initial state
  viewMode: 'sessions',
  selectedProjectId: null,
  selectedSessionId: null,
  selectedSessionIndex: 0,
  isPanelOpen: false,
  selectedAttentionIndex: 0,

  // Set view mode
  setViewMode: mode => set({ viewMode: mode }),

  // Set selected project filter
  setSelectedProject: projectId => set({ selectedProjectId: projectId }),

  // Select a session (opens panel)
  selectSession: sessionId => {
    set({
      selectedSessionId: sessionId,
      isPanelOpen: sessionId !== null,
    })
  },

  // Highlight a session without opening panel (for keyboard navigation)
  highlightSession: sessionId => {
    set({ selectedSessionId: sessionId })
  },

  // Toggle session panel (same session = toggle, different = open)
  toggleSessionPanel: sessionId => {
    const { selectedSessionId } = get()
    if (selectedSessionId === sessionId) {
      // Toggle panel for same session
      set(state => ({ isPanelOpen: !state.isPanelOpen }))
    } else {
      // Open panel for new session
      set({ selectedSessionId: sessionId, isPanelOpen: true })
    }
  },

  // Close panel
  closePanel: () => set({ isPanelOpen: false }),

  // Session list keyboard navigation
  setSelectedSessionIndex: index => set({ selectedSessionIndex: index }),

  selectNextSession: maxIndex => {
    if (maxIndex <= 0) return
    set(state => ({
      selectedSessionIndex:
        state.selectedSessionIndex < maxIndex - 1
          ? state.selectedSessionIndex + 1
          : state.selectedSessionIndex,
    }))
  },

  selectPrevSession: () => {
    set(state => ({
      selectedSessionIndex:
        state.selectedSessionIndex > 0
          ? state.selectedSessionIndex - 1
          : state.selectedSessionIndex,
    }))
  },

  selectFirstSession: () => {
    set({ selectedSessionIndex: 0 })
  },

  selectLastSession: maxIndex => {
    if (maxIndex <= 0) return
    set({ selectedSessionIndex: maxIndex - 1 })
  },

  clampSessionIndex: maxIndex => {
    set(state => {
      if (maxIndex === 0) {
        return { selectedSessionIndex: 0 }
      }
      if (state.selectedSessionIndex >= maxIndex) {
        return { selectedSessionIndex: maxIndex - 1 }
      }
      return state
    })
  },

  // Set attention index directly
  setSelectedAttentionIndex: index => set({ selectedAttentionIndex: index }),

  // Move to next attention item
  selectNextAttention: maxIndex => {
    if (maxIndex <= 0) return
    set(state => ({
      selectedAttentionIndex:
        state.selectedAttentionIndex < maxIndex - 1
          ? state.selectedAttentionIndex + 1
          : state.selectedAttentionIndex,
    }))
  },

  // Move to previous attention item
  selectPrevAttention: () => {
    set(state => ({
      selectedAttentionIndex:
        state.selectedAttentionIndex > 0
          ? state.selectedAttentionIndex - 1
          : state.selectedAttentionIndex,
    }))
  },

  // Keep index in bounds when list changes
  clampAttentionIndex: maxIndex => {
    set(state => {
      if (maxIndex === 0) {
        return { selectedAttentionIndex: 0 }
      }
      if (state.selectedAttentionIndex >= maxIndex) {
        return { selectedAttentionIndex: maxIndex - 1 }
      }
      return state
    })
  },

  // Project keyboard navigation (circular)
  // projectIds: [null (all), ...project ids from useProjects]
  selectNextProject: projectIds => {
    if (projectIds.length === 0) return
    const { selectedProjectId } = get()
    const currentIndex =
      selectedProjectId === null ? 0 : projectIds.indexOf(selectedProjectId)
    // Circular: wrap to first when at end
    const nextIndex = (currentIndex + 1) % projectIds.length
    const nextProjectId = projectIds[nextIndex]
    set({
      selectedProjectId: nextProjectId === null ? null : nextProjectId,
      selectedSessionIndex: 0, // Reset session index when changing project
    })
  },

  selectPrevProject: projectIds => {
    if (projectIds.length === 0) return
    const { selectedProjectId } = get()
    const currentIndex =
      selectedProjectId === null ? 0 : projectIds.indexOf(selectedProjectId)
    // Circular: wrap to last when at beginning
    const prevIndex = (currentIndex - 1 + projectIds.length) % projectIds.length
    const prevProjectId = projectIds[prevIndex]
    set({
      selectedProjectId: prevProjectId === null ? null : prevProjectId,
      selectedSessionIndex: 0, // Reset session index when changing project
    })
  },

  selectAllProjects: () => {
    set({
      selectedProjectId: null,
      selectedSessionIndex: 0,
    })
  },

  // Handle session removal
  handleSessionRemoved: sessionId => {
    const { selectedSessionId } = get()
    if (selectedSessionId === sessionId) {
      set({ selectedSessionId: null, isPanelOpen: false })
    }
  },
}))

// Selector hooks for optimized re-renders
export const useViewMode = () => useUIStore(state => state.viewMode)

export const useSelectedProject = () =>
  useUIStore(
    useShallow(state => ({
      selectedProjectId: state.selectedProjectId,
      setSelectedProject: state.setSelectedProject,
    }))
  )

export const useSelectedSession = () =>
  useUIStore(state => ({
    selectedSessionId: state.selectedSessionId,
    isPanelOpen: state.isPanelOpen,
  }))

export const useAttentionNavigation = () =>
  useUIStore(state => ({
    selectedAttentionIndex: state.selectedAttentionIndex,
    selectNextAttention: state.selectNextAttention,
    selectPrevAttention: state.selectPrevAttention,
    setSelectedAttentionIndex: state.setSelectedAttentionIndex,
  }))

export const useSessionNavigation = () =>
  useUIStore(
    useShallow(state => ({
      selectedSessionIndex: state.selectedSessionIndex,
      setSelectedSessionIndex: state.setSelectedSessionIndex,
      selectNextSession: state.selectNextSession,
      selectPrevSession: state.selectPrevSession,
      selectFirstSession: state.selectFirstSession,
      selectLastSession: state.selectLastSession,
      clampSessionIndex: state.clampSessionIndex,
    }))
  )

export const useProjectNavigation = () =>
  useUIStore(
    useShallow(state => ({
      selectedProjectId: state.selectedProjectId,
      selectNextProject: state.selectNextProject,
      selectPrevProject: state.selectPrevProject,
      selectAllProjects: state.selectAllProjects,
    }))
  )
