/**
 * Auto-Allow Store
 *
 * Manages session-based auto-approval for tools.
 * In-memory only - resets when session ends or app restarts.
 *
 * This is a Plexus-specific feature that works across all agents
 * (Claude, Cursor, Gemini) to reduce permission fatigue.
 */

import type { AutoAllowEntry } from 'shared/hook-types'

interface AutoAllowState {
  // Map: sessionId -> Map<toolName, AutoAllowEntry>
  sessions: Map<string, Map<string, AutoAllowEntry>>
}

/**
 * Check if a tool is auto-allowed for a session
 */
function isAutoAllowed(
  state: AutoAllowState,
  sessionId: string,
  toolName: string
): boolean {
  const sessionTools = state.sessions.get(sessionId)
  if (!sessionTools) return false

  const entry = sessionTools.get(toolName)
  return entry !== undefined
}

/**
 * Add auto-allow for a tool in a session
 */
function addAutoAllow(
  state: AutoAllowState,
  sessionId: string,
  toolName: string
): void {
  if (!state.sessions.has(sessionId)) {
    state.sessions.set(sessionId, new Map())
  }

  const sessionTools = state.sessions.get(sessionId)
  if (sessionTools) {
    sessionTools.set(toolName, {
      toolName,
      allowedAt: Date.now(),
    })
    console.log(
      `[AutoAllowStore] Auto-allowed '${toolName}' for session ${sessionId.slice(0, 8)}`
    )
  }
}

/**
 * Remove auto-allow for a specific tool
 */
function removeAutoAllow(
  state: AutoAllowState,
  sessionId: string,
  toolName: string
): boolean {
  const sessionTools = state.sessions.get(sessionId)
  if (!sessionTools) return false

  const deleted = sessionTools.delete(toolName)
  if (deleted) {
    console.log(
      `[AutoAllowStore] Removed auto-allow for '${toolName}' in session ${sessionId.slice(0, 8)}`
    )
  }
  return deleted
}

/**
 * Get all auto-allowed tools for a session
 */
function getAutoAllowedTools(
  state: AutoAllowState,
  sessionId: string
): AutoAllowEntry[] {
  const sessionTools = state.sessions.get(sessionId)
  if (!sessionTools) return []
  return Array.from(sessionTools.values())
}

/**
 * Clear all auto-allows for a session (called on session end)
 */
function clearSession(state: AutoAllowState, sessionId: string): void {
  const deleted = state.sessions.delete(sessionId)
  if (deleted) {
    console.log(
      `[AutoAllowStore] Cleared auto-allows for session ${sessionId.slice(0, 8)}`
    )
  }
}

/**
 * Clear all state (for testing or app reset)
 */
function clear(state: AutoAllowState): void {
  state.sessions.clear()
  console.log('[AutoAllowStore] Cleared all auto-allows')
}

/**
 * Get count of auto-allowed tools for a session
 */
function getCount(state: AutoAllowState, sessionId: string): number {
  const sessionTools = state.sessions.get(sessionId)
  return sessionTools?.size ?? 0
}

// Create singleton state
const state: AutoAllowState = {
  sessions: new Map(),
}

// Export store with bound methods
export const autoAllowStore = {
  isAutoAllowed: (sessionId: string, toolName: string) =>
    isAutoAllowed(state, sessionId, toolName),
  addAutoAllow: (sessionId: string, toolName: string) =>
    addAutoAllow(state, sessionId, toolName),
  removeAutoAllow: (sessionId: string, toolName: string) =>
    removeAutoAllow(state, sessionId, toolName),
  getAutoAllowedTools: (sessionId: string) =>
    getAutoAllowedTools(state, sessionId),
  clearSession: (sessionId: string) => clearSession(state, sessionId),
  clear: () => clear(state),
  getCount: (sessionId: string) => getCount(state, sessionId),
}
