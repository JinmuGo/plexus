/**
 * Activity Log Store
 *
 * Stores activity entries for each session for display in the Side Panel.
 * Listens to SessionStore events and creates activity entries.
 */

import { devLog } from '../lib/utils'
import type { SessionActivityEntry } from 'shared/hook-types'
import { sessionStore, type SessionEvent } from './sessions'
import { MAX_ENTRIES_PER_SESSION } from '../constants/sessions'

type ActivityListener = (sessionId: string, entry: SessionActivityEntry) => void

class ActivityLogStore {
  private logs: Map<string, SessionActivityEntry[]> = new Map()
  private listeners: Set<ActivityListener> = new Set()
  private idCounter = 0

  constructor() {
    // Subscribe to session events
    sessionStore.subscribe(event => {
      this.handleSessionEvent(event)
    })
  }

  /**
   * Generate unique ID for activity entries
   */
  private generateId(): string {
    this.idCounter += 1
    return `activity-${Date.now()}-${this.idCounter}`
  }

  /**
   * Handle session events and create activity entries
   */
  private handleSessionEvent(event: SessionEvent): void {
    const { type, session, previousPhase, permissionContext } = event

    switch (type) {
      case 'add':
        this.addEntry(session.id, {
          id: this.generateId(),
          timestamp: Date.now(),
          type: 'session_start',
          message: `Session started (${session.agent})`,
        })
        break

      case 'phaseChange':
        // Only log meaningful phase changes
        if (previousPhase && previousPhase !== session.phase) {
          this.addEntry(session.id, {
            id: this.generateId(),
            timestamp: Date.now(),
            type: 'phase_change',
            phase: session.phase,
            message: `${previousPhase} → ${session.phase}`,
          })
        }
        break

      case 'permissionRequest':
        if (permissionContext) {
          this.addEntry(session.id, {
            id: this.generateId(),
            timestamp: Date.now(),
            type: 'permission_request',
            tool: permissionContext.toolName,
            message: `Permission requested: ${permissionContext.toolName}`,
          })
        }
        break

      case 'permissionResolved':
        this.addEntry(session.id, {
          id: this.generateId(),
          timestamp: Date.now(),
          type: 'permission_resolved',
          message: 'Permission resolved',
        })
        break

      case 'remove':
        if (session.phase === 'ended') {
          this.addEntry(session.id, {
            id: this.generateId(),
            timestamp: Date.now(),
            type: 'session_end',
            message: 'Session ended',
          })
        }
        break

      // 'update' events are too frequent, skip them
    }
  }

  /**
   * Add an activity entry for a session
   */
  addEntry(sessionId: string, entry: SessionActivityEntry): void {
    let entries = this.logs.get(sessionId)
    if (!entries) {
      entries = []
      this.logs.set(sessionId, entries)
    }

    entries.push(entry)

    // Prune if over limit
    if (entries.length > MAX_ENTRIES_PER_SESSION) {
      entries.shift()
    }

    // Notify listeners
    this.emit(sessionId, entry)
  }

  /**
   * Add a tool start entry
   */
  addToolStart(sessionId: string, toolName: string): void {
    this.addEntry(sessionId, {
      id: this.generateId(),
      timestamp: Date.now(),
      type: 'tool_start',
      tool: toolName,
      message: `Tool: ${toolName}`,
    })
  }

  /**
   * Add a tool complete entry
   */
  addToolComplete(sessionId: string, toolName: string): void {
    this.addEntry(sessionId, {
      id: this.generateId(),
      timestamp: Date.now(),
      type: 'tool_complete',
      tool: toolName,
      message: `${toolName} completed`,
    })
  }

  /**
   * Add a permission decision entry
   */
  addPermissionDecision(
    sessionId: string,
    toolName: string,
    decision: 'allow' | 'deny'
  ): void {
    this.addEntry(sessionId, {
      id: this.generateId(),
      timestamp: Date.now(),
      type: 'permission_resolved',
      tool: toolName,
      decision,
      message: `${toolName}: ${decision === 'allow' ? 'Allowed' : 'Denied'}`,
    })
  }

  /**
   * Get activity entries for a session
   */
  getEntries(sessionId: string): SessionActivityEntry[] {
    return this.logs.get(sessionId) || []
  }

  /**
   * Clear activity log for a session
   */
  clearSession(sessionId: string): void {
    this.logs.delete(sessionId)
  }

  /**
   * Subscribe to new activity entries
   */
  subscribe(listener: ActivityListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Emit new entry to listeners
   */
  private emit(sessionId: string, entry: SessionActivityEntry): void {
    for (const listener of this.listeners) {
      try {
        listener(sessionId, entry)
      } catch (error) {
        devLog.error('[ActivityLogStore] Listener error:', error)
      }
    }
  }

  /**
   * Clean up old sessions (called periodically)
   */
  cleanup(activeSessionIds: Set<string>): void {
    const toRemove: string[] = []

    for (const sessionId of this.logs.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        toRemove.push(sessionId)
      }
    }

    for (const sessionId of toRemove) {
      this.logs.delete(sessionId)
    }

    if (toRemove.length > 0) {
      devLog.log(`[ActivityLogStore] Cleaned up ${toRemove.length} sessions`)
    }
  }
}

// Singleton instance
export const activityLogStore = new ActivityLogStore()
