/**
 * Session Helpers
 *
 * Pure functions for computing derived session state.
 * Use with useMemo in components to prevent unnecessary re-renders.
 */

import type { ClaudeSession } from 'shared/hook-types'

import { PHASE_PRIORITY } from 'renderer/lib/constants'

/**
 * Get staged sessions (need attention) sorted by priority
 * Use with useMemo: useMemo(() => getStagedSessions(sessions), [sessions])
 */
export function getStagedSessions(sessions: ClaudeSession[]): ClaudeSession[] {
  return sessions
    .filter(
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
}

/**
 * Get active (non-ended) sessions
 * Use with useMemo: useMemo(() => getActiveSessions(sessions), [sessions])
 */
export function getActiveSessions(sessions: ClaudeSession[]): ClaudeSession[] {
  return sessions.filter(s => s.phase !== 'ended')
}
