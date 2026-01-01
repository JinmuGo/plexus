/**
 * Session Store
 *
 * Zustand store for Claude session state management.
 * Integrates with Electron IPC for real-time updates.
 */

import { create } from 'zustand'
import type { ClaudeSession, PermissionDecision } from 'shared/hook-types'
import { PHASE_PRIORITY } from 'renderer/lib/constants'

const { App } = window

interface SessionState {
  // Core state
  sessions: ClaudeSession[]
  isLoading: boolean
  error: string | null

  // Cleanup function reference (stored externally to avoid serialization issues)
  _cleanup: (() => void) | null
}

interface SessionActions {
  // Lifecycle
  initialize: () => Promise<void>
  cleanup: () => void

  // Session queries (computed)
  getActiveSessions: () => ClaudeSession[]
  getStagedSessions: () => ClaudeSession[]
  getApprovalCount: () => number
  getSessionById: (id: string) => ClaudeSession | undefined

  // Session actions
  terminateSession: (
    sessionId: string,
    signal?: 'SIGTERM' | 'SIGKILL'
  ) => Promise<boolean>
  removeSession: (sessionId: string) => Promise<boolean>

  // Permission actions
  approvePermission: (sessionId: string) => Promise<boolean>
  denyPermission: (sessionId: string, reason?: string) => Promise<boolean>
  respondToPermission: (
    sessionId: string,
    decision: PermissionDecision,
    options?: { reason?: string; updatedInput?: Record<string, unknown> }
  ) => Promise<boolean>
}

export type SessionStore = SessionState & SessionActions

export const useSessionStore = create<SessionStore>((set, get) => ({
  // Initial state
  sessions: [],
  isLoading: true,
  error: null,
  _cleanup: null,

  // Initialize store and subscribe to IPC events
  initialize: async () => {
    set({ isLoading: true, error: null })

    try {
      // Load initial sessions
      const sessions = await App.claudeSessions.getAll()
      set({ sessions, isLoading: false })

      // Subscribe to session events
      const unsubscribe = App.claudeSessions.onEvent(event => {
        set(state => {
          switch (event.type) {
            case 'add': {
              // Check if session already exists (update instead of add)
              const exists = state.sessions.some(s => s.id === event.session.id)
              if (exists) {
                return {
                  sessions: state.sessions.map(s =>
                    s.id === event.session.id ? event.session : s
                  ),
                }
              }
              return { sessions: [...state.sessions, event.session] }
            }

            case 'update':
            case 'phaseChange':
            case 'permissionRequest':
            case 'permissionResolved':
              return {
                sessions: state.sessions.map(s =>
                  s.id === event.session.id ? event.session : s
                ),
              }

            case 'remove':
              return {
                sessions: state.sessions.filter(s => s.id !== event.session.id),
              }

            default:
              return state
          }
        })
      })

      // Store cleanup function
      set({ _cleanup: unsubscribe })
    } catch (error) {
      console.error('[SessionStore] Failed to initialize:', error)
      set({
        error:
          error instanceof Error ? error.message : 'Failed to load sessions',
        isLoading: false,
      })
    }
  },

  // Cleanup subscriptions
  cleanup: () => {
    const { _cleanup } = get()
    if (_cleanup) {
      _cleanup()
      set({ _cleanup: null })
    }
  },

  // Get active (non-ended) sessions
  getActiveSessions: () => {
    return get().sessions.filter(s => s.phase !== 'ended')
  },

  // Get staged sessions (need attention) sorted by priority
  getStagedSessions: () => {
    return get()
      .sessions.filter(
        s =>
          s.phase === 'waitingForApproval' ||
          s.phase === 'waitingForInput' ||
          s.phase === 'idle'
      )
      .sort((a, b) => {
        // Sort by phase priority first
        const priorityA = PHASE_PRIORITY[a.phase] ?? 99
        const priorityB = PHASE_PRIORITY[b.phase] ?? 99
        if (priorityA !== priorityB) return priorityA - priorityB
        // Then by last activity (most recent first)
        return b.lastActivity - a.lastActivity
      })
  },

  // Get count of sessions waiting for approval
  getApprovalCount: () => {
    return get().sessions.filter(s => s.phase === 'waitingForApproval').length
  },

  // Get session by ID
  getSessionById: (id: string) => {
    return get().sessions.find(s => s.id === id)
  },

  // Terminate a session
  terminateSession: async (sessionId, signal = 'SIGTERM') => {
    try {
      return await App.claudeSessions.terminate(sessionId, signal)
    } catch (error) {
      console.error('[SessionStore] Failed to terminate session:', error)
      return false
    }
  },

  // Remove a session from tracking
  removeSession: async sessionId => {
    try {
      return await App.claudeSessions.remove(sessionId)
    } catch (error) {
      console.error('[SessionStore] Failed to remove session:', error)
      return false
    }
  },

  // Approve permission request
  approvePermission: async sessionId => {
    try {
      return await App.permissions.respond(sessionId, 'allow')
    } catch (error) {
      console.error('[SessionStore] Failed to approve permission:', error)
      return false
    }
  },

  // Deny permission request
  denyPermission: async (sessionId, reason) => {
    try {
      return await App.permissions.respond(sessionId, 'deny', { reason })
    } catch (error) {
      console.error('[SessionStore] Failed to deny permission:', error)
      return false
    }
  },

  // Respond to permission with full options
  respondToPermission: async (sessionId, decision, options) => {
    try {
      return await App.permissions.respond(sessionId, decision, options)
    } catch (error) {
      console.error('[SessionStore] Failed to respond to permission:', error)
      return false
    }
  },
}))

// Selector hooks for optimized re-renders
// These select the raw sessions array, derived state should use useMemo in components

export const useSessions = () => useSessionStore(state => state.sessions)

export const useApprovalCount = () =>
  useSessionStore(
    state => state.sessions.filter(s => s.phase === 'waitingForApproval').length
  )

export const useSessionById = (id: string) =>
  useSessionStore(state => state.sessions.find(s => s.id === id))
