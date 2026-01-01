/**
 * Jump to Agent Utility
 *
 * Provides functionality to focus the terminal/IDE window where an agent is running.
 * Supports Claude Code (terminal), Cursor IDE, and Gemini CLI.
 */

import type { ClaudeSession } from 'shared/hook-types'
import { focusPane, focusByTty, focusCursor } from '../tmux/target-finder'
import { activateTerminalApp, activateWindowByProcess } from './platform-focus'

export type JumpMethod =
  | 'tmux'
  | 'tty'
  | 'cursor'
  | 'terminal-fallback'
  | 'failed'

export interface JumpResult {
  success: boolean
  method: JumpMethod
  error?: string
}

/**
 * Jump to the terminal/IDE where the agent session is running
 *
 * Tries multiple methods in order of specificity:
 * 1. Tmux pane focus (if session is in tmux)
 * 2. TTY-based focus (find app owning the TTY)
 * 3. Cursor IDE focus (for cursor agent)
 * 4. Terminal app fallback (activate any terminal)
 */
export async function jumpToAgent(session: ClaudeSession): Promise<JumpResult> {
  // 1. Tmux session - most specific targeting
  if (session.isInTmux && session.tmuxTarget) {
    try {
      const result = await focusPane(session.tmuxTarget)
      if (result) {
        return { success: true, method: 'tmux' }
      }
    } catch (error) {
      console.warn('[JumpToAgent] Tmux focus failed:', error)
    }
  }

  // 2. TTY-based focus (non-tmux terminals)
  if (session.tty) {
    try {
      const result = await focusByTty(session.tty)
      if (result) {
        return { success: true, method: 'tty' }
      }
    } catch (error) {
      console.warn('[JumpToAgent] TTY focus failed:', error)
    }
  }

  // 3. Cursor IDE specific handling
  if (session.agent === 'cursor' && session.cwd) {
    try {
      const result = await focusCursor(session.cwd)
      if (result) {
        return { success: true, method: 'cursor' }
      }
    } catch (error) {
      console.warn('[JumpToAgent] Cursor focus failed:', error)
    }
  }

  // 4. Fallback: Try to activate terminal app (for Claude/Gemini)
  if (session.agent === 'claude' || session.agent === 'gemini') {
    try {
      const result = await activateTerminalApp()
      if (result) {
        return { success: true, method: 'terminal-fallback' }
      }
    } catch (error) {
      console.warn('[JumpToAgent] Terminal fallback failed:', error)
    }
  }

  // 5. Last resort for Cursor: try Windows-specific or generic activation
  if (session.agent === 'cursor') {
    try {
      const result = await activateWindowByProcess('Cursor')
      if (result) {
        return { success: true, method: 'cursor' }
      }
    } catch (error) {
      console.warn('[JumpToAgent] Cursor process activation failed:', error)
    }
  }

  return {
    success: false,
    method: 'failed',
    error: 'No focus method succeeded',
  }
}

/**
 * Select the most urgent active agent session
 *
 * Priority order:
 * 1. waitingForApproval (permission request pending)
 * 2. waitingForInput (question pending)
 * 3. processing (actively working)
 * 4. compacting (context compression)
 * 5. idle (ready for input)
 *
 * Among sessions with same priority, picks the most recently active one.
 */
export function selectActiveAgent(
  sessions: ClaudeSession[]
): ClaudeSession | undefined {
  const activeSessions = sessions.filter(s => s.phase !== 'ended')

  if (activeSessions.length === 0) {
    return undefined
  }

  const priorityOrder: ClaudeSession['phase'][] = [
    'waitingForApproval',
    'waitingForInput',
    'processing',
    'compacting',
    'idle',
  ]

  for (const phase of priorityOrder) {
    const found = activeSessions.find(s => s.phase === phase)
    if (found) {
      return found
    }
  }

  // Fallback: most recently active session
  return activeSessions.sort((a, b) => b.lastActivity - a.lastActivity)[0]
}
