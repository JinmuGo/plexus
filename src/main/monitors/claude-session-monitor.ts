/**
 * Claude Session Monitor
 *
 * Integrated monitor that coordinates all session detection mechanisms:
 * - Hook socket server for real-time Claude Code events
 * - Interrupt watcher for JSONL file monitoring
 * - Agent watcher for subagent tracking
 * - Tmux integration for pane detection
 */

import type { HookEvent } from 'shared/hook-types'
import { sessionStore } from '../store/sessions'
import { historyCaptureManager } from '../history/capture-manager'
import * as hookSocketServer from '../hooks/hook-socket-server'
import {
  installIfNeeded as installClaudeHooks,
  isInstalled as isClaudeHooksInstalled,
  isClaudeCodeInstalled,
} from '../hooks/hook-installer'
import {
  installIfNeeded as installGeminiHooks,
  isInstalled as isGeminiHooksInstalled,
  isGeminiCliInstalled,
} from '../hooks/gemini-hook-installer'
import {
  installIfNeeded as installCursorHooks,
  isInstalled as isCursorHooksInstalled,
  isCursorInstalled,
} from '../hooks/cursor-hook-installer'
import { interruptWatcher } from '../watchers'
import { agentWatcher } from '../watchers'
import { findTargetByPid, isTmuxAvailable } from '../tmux'

/**
 * Monitor state
 */
interface MonitorState {
  isStarted: boolean
  hookServerRunning: boolean
  tmuxAvailable: boolean
  claudeHooksInstalled: boolean
  geminiHooksInstalled: boolean
  cursorHooksInstalled: boolean
}

const state: MonitorState = {
  isStarted: false,
  hookServerRunning: false,
  tmuxAvailable: false,
  claudeHooksInstalled: false,
  geminiHooksInstalled: false,
  cursorHooksInstalled: false,
}

/**
 * Handle incoming hook events
 */
function handleHookEvent(event: HookEvent): void {
  console.log(
    `[Monitor] Hook event: ${event.event} for ${event.sessionId.slice(0, 8)} status:${event.status}`
  )

  // Process the event through session store
  sessionStore.processHookEvent(event)

  // Persist detailed event data to history
  historyCaptureManager.processHookEvent(event)

  // Update session title for Claude sessions after model response (Stop event)
  // This is when summary may be available in JSONL
  if (event.agent === 'claude' && event.event === 'Stop') {
    sessionStore.updateSessionTitle(event.sessionId)
  }

  // Start interrupt watcher for new sessions
  if (event.event === 'SessionStart' || event.event === 'UserPromptSubmit') {
    if (!interruptWatcher.isWatching(event.sessionId)) {
      interruptWatcher.start(event.sessionId, event.cwd)
    }
  }

  // Stop interrupt watcher on session end
  if (event.event === 'SessionEnd') {
    interruptWatcher.stop(event.sessionId)
    agentWatcher.stopSession(event.sessionId)
  }

  // Start agent watcher for Task tool
  if (
    event.event === 'PreToolUse' &&
    event.tool === 'Task' &&
    event.toolUseId
  ) {
    const agentId = (event.toolInput as Record<string, string> | undefined)
      ?.agentId
    if (agentId && !agentWatcher.isWatching(event.sessionId, event.toolUseId)) {
      agentWatcher.start(event.sessionId, event.toolUseId, agentId, event.cwd)
    }
  }

  // Detect tmux pane for new sessions
  if (
    state.tmuxAvailable &&
    event.pid &&
    (event.event === 'SessionStart' || event.event === 'UserPromptSubmit')
  ) {
    detectTmuxPane(event.sessionId, event.pid)
  }
}

/**
 * Detect tmux pane for a session
 */
async function detectTmuxPane(
  sessionId: string,
  claudePid: number
): Promise<void> {
  try {
    const target = await findTargetByPid(claudePid)
    if (target) {
      sessionStore.setTmuxTarget(sessionId, target)
      console.log(
        `[Monitor] Tmux target for ${sessionId.slice(0, 8)}: ${target.session}:${target.window}.${target.pane}`
      )
    }
  } catch (error) {
    console.error(
      `[Monitor] Failed to detect tmux pane for ${sessionId.slice(0, 8)}:`,
      error
    )
  }
}

/**
 * Handle permission failures (socket closed before response)
 */
function handlePermissionFailure(sessionId: string, toolUseId: string): void {
  console.warn(
    `[Monitor] Permission failed for ${sessionId.slice(0, 8)} tool:${toolUseId.slice(0, 12)}`
  )
  sessionStore.clearPermission(sessionId, toolUseId)
}

/**
 * Handle interrupt detection
 */
function handleInterrupt(sessionId: string): void {
  console.log(`[Monitor] Interrupt detected for ${sessionId.slice(0, 8)}`)
  sessionStore.updatePhase(sessionId, 'waitingForInput')
}

/**
 * Handle agent tool updates
 */
function handleAgentToolsUpdate(
  sessionId: string,
  _taskToolId: string,
  _tools: Array<{
    id: string
    name: string
    input: Record<string, string>
    isCompleted: boolean
  }>
): void {
  console.log(`[Monitor] Agent tools updated for ${sessionId.slice(0, 8)}`)
  // TODO: Update session store with subagent tool info
}

/**
 * Start the monitor
 */
export async function startMonitoring(): Promise<void> {
  if (state.isStarted) {
    console.log('[Monitor] Already started')
    return
  }

  console.log('[Monitor] Starting session monitor...')

  // Install Claude Code hooks if Claude Code is available
  if (isClaudeCodeInstalled()) {
    try {
      await installClaudeHooks()
      state.claudeHooksInstalled = isClaudeHooksInstalled()
      console.log(
        `[Monitor] Claude hooks ${state.claudeHooksInstalled ? 'installed' : 'not installed'}`
      )
    } catch (error) {
      console.error('[Monitor] Failed to install Claude hooks:', error)
    }
  } else {
    console.log('[Monitor] Claude Code not found, skipping Claude hooks')
  }

  // Install Gemini CLI hooks if Gemini is available
  if (isGeminiCliInstalled()) {
    try {
      await installGeminiHooks()
      state.geminiHooksInstalled = isGeminiHooksInstalled()
      console.log(
        `[Monitor] Gemini hooks ${state.geminiHooksInstalled ? 'installed' : 'not installed'}`
      )
    } catch (error) {
      console.error('[Monitor] Failed to install Gemini hooks:', error)
    }
  } else {
    console.log('[Monitor] Gemini CLI not found, skipping Gemini hooks')
  }

  // Install Cursor IDE hooks if Cursor is available
  if (isCursorInstalled()) {
    try {
      await installCursorHooks()
      state.cursorHooksInstalled = isCursorHooksInstalled()
      console.log(
        `[Monitor] Cursor hooks ${state.cursorHooksInstalled ? 'installed' : 'not installed'}`
      )
    } catch (error) {
      console.error('[Monitor] Failed to install Cursor hooks:', error)
    }
  } else {
    console.log('[Monitor] Cursor IDE not found, skipping Cursor hooks')
  }

  // Check tmux availability
  state.tmuxAvailable = isTmuxAvailable()
  if (state.tmuxAvailable) {
    console.log('[Monitor] Tmux available')
  }

  // Set up interrupt watcher handler
  interruptWatcher.setHandler(handleInterrupt)

  // Set up agent watcher handler
  agentWatcher.setHandler(handleAgentToolsUpdate)

  // Start hook socket server
  hookSocketServer.start(handleHookEvent, handlePermissionFailure)
  state.hookServerRunning = true

  state.isStarted = true
  console.log('[Monitor] Session monitor started')
}

/**
 * Stop the monitor
 */
export function stopMonitoring(): void {
  if (!state.isStarted) {
    return
  }

  console.log('[Monitor] Stopping session monitor...')

  // Stop hook socket server
  hookSocketServer.stop()
  state.hookServerRunning = false

  // Stop all file watchers
  interruptWatcher.stopAll()
  agentWatcher.stopAll()

  // Archive ended sessions
  sessionStore.archiveEndedSessions(0)

  state.isStarted = false
  console.log('[Monitor] Session monitor stopped')
}

/**
 * Approve a permission request
 */
export function approvePermission(sessionId: string): void {
  hookSocketServer.respondToPermissionBySession(sessionId, 'allow')
  console.log(`[Monitor] Approved permission for ${sessionId.slice(0, 8)}`)
}

/**
 * Deny a permission request
 */
export function denyPermission(sessionId: string, reason?: string): void {
  hookSocketServer.respondToPermissionBySession(sessionId, 'deny', { reason })
  console.log(`[Monitor] Denied permission for ${sessionId.slice(0, 8)}`)
}

/**
 * Get monitor status
 */
export function getStatus(): MonitorState {
  return { ...state }
}

// Export singleton-like interface
export const claudeSessionMonitor = {
  startMonitoring,
  stopMonitoring,
  approvePermission,
  denyPermission,
  getStatus,
}
