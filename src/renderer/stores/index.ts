/**
 * Stores
 *
 * Zustand stores for global state management.
 */

export {
  useSessionStore,
  useSessions,
  useApprovalCount,
  useSessionById,
  type SessionStore,
} from './session-store'

// Re-export helper for computing staged sessions
export { getStagedSessions, getActiveSessions } from './session-helpers'

export {
  useUIStore,
  useViewMode,
  useSelectedSession,
  useAttentionNavigation,
  type ViewMode,
  type UIStore,
} from './ui-store'
