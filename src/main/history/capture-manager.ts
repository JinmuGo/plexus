/**
 * History Capture Manager
 *
 * Listens to SessionStore events and persists session data to HistoryStore.
 * Bridges the real-time session tracking with persistent history storage.
 * Parses JSONL files to capture full conversation content.
 */

import { devLog } from '../lib/utils'
import { historyStore } from '../store/history'
import { costStore } from '../store/cost-store'
import { sessionStore, type SessionEvent } from '../store/sessions'
import type { ClaudeSession, HookEvent } from 'shared/hook-types'
import type { MessageRole } from 'shared/history-types'
import { parseJsonlFile, getJsonlPath } from './jsonl-parser'
import {
  parseClaudeSession,
  aggregateClaudeUsage,
  calculateCostByAgent,
} from '../cost'

/**
 * Track which sessions have been persisted
 */
const persistedSessions = new Set<string>()

/**
 * Track which sessions have had their JSONL parsed (to avoid duplicate parsing)
 */
const parsedJsonlSessions = new Set<string>()

/**
 * Track pending tool executions (toolUseId -> database id)
 */
const pendingTools = new Map<string, string>()

/**
 * Extract a meaningful message from a hook event
 *
 * NOTE: We intentionally DO NOT create messages for user/assistant roles from hook events.
 * Those messages will come from JSONL parsing with actual content.
 * Hook events only provide tool and system messages.
 */
function extractMessageContent(event: HookEvent): {
  content: string
  role: MessageRole
} | null {
  const { event: eventName, tool, toolInput } = event

  switch (eventName) {
    // Skip UserPromptSubmit and Stop - actual content comes from JSONL parsing
    // This prevents duplicate messages (one placeholder from hook, one real from JSONL)
    case 'UserPromptSubmit':
    case 'Stop':
      return null

    case 'PreToolUse':
      if (tool) {
        const input = formatToolInput(tool, toolInput)
        return {
          content: `[Tool: ${tool}] ${input}`,
          role: 'tool',
        }
      }
      return null

    case 'PostToolUse':
      if (tool) {
        return {
          content: `[Tool: ${tool}] completed`,
          role: 'tool',
        }
      }
      return null

    // Skip session events as messages - they're already tracked as session metadata
    case 'SessionStart':
    case 'SessionEnd':
      return null

    default:
      return null
  }
}

/**
 * Format tool input for display
 */
function formatToolInput(
  toolName: string,
  toolInput?: Record<string, unknown>
): string {
  if (!toolInput || Object.keys(toolInput).length === 0) {
    return ''
  }

  switch (toolName) {
    case 'Bash':
      return String(toolInput.command || '')
    case 'Read':
      return String(toolInput.file_path || '')
    case 'Write':
      return String(toolInput.file_path || '')
    case 'Edit':
      return String(toolInput.file_path || '')
    case 'Grep':
      return String(toolInput.pattern || '')
    case 'Glob':
      return String(toolInput.pattern || '')
    default: {
      const firstKey = Object.keys(toolInput)[0]
      const firstValue = firstKey ? toolInput[firstKey] : null
      if (firstValue && typeof firstValue === 'string') {
        return firstValue.slice(0, 100)
      }
      return JSON.stringify(toolInput).slice(0, 100)
    }
  }
}

class HistoryCaptureManager {
  private unsubscribe: (() => void) | null = null
  private isRunning = false

  /**
   * Start capturing session events
   */
  start(): void {
    if (this.isRunning) {
      devLog.log('[HistoryCaptureManager] Already running')
      return
    }

    devLog.log('[HistoryCaptureManager] Starting capture')

    this.unsubscribe = sessionStore.subscribe((event: SessionEvent) => {
      this.handleSessionEvent(event)
    })

    this.isRunning = true
  }

  /**
   * Stop capturing session events
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    this.isRunning = false
    devLog.log('[HistoryCaptureManager] Stopped capture')
  }

  /**
   * Handle a session event from SessionStore
   */
  private handleSessionEvent(event: SessionEvent): void {
    try {
      switch (event.type) {
        case 'add':
          this.handleSessionAdd(event.session)
          break
        case 'update':
          this.handleSessionUpdate(event.session)
          break
        case 'remove':
          this.handleSessionRemove(event.session)
          break
        case 'phaseChange':
          this.handlePhaseChange(event.session, event.previousPhase)
          break
        case 'permissionRequest':
          // Permission requests are part of tool usage, handled elsewhere
          break
        case 'permissionResolved':
          // Could track permission decisions here
          break
      }
    } catch (error) {
      devLog.error('[HistoryCaptureManager] Error handling event:', error)
    }
  }

  /**
   * Handle new session creation
   */
  private handleSessionAdd(session: ClaudeSession): void {
    // Only persist if not already in database
    if (persistedSessions.has(session.id)) {
      return
    }

    if (historyStore.hasSession(session.id)) {
      persistedSessions.add(session.id)
      return
    }

    historyStore.createSession({
      id: session.id,
      agent: session.agent,
      cwd: session.cwd,
      displayTitle: session.displayTitle || getDisplayTitle(session.cwd),
      sessionSummary: session.sessionSummary || null,
      firstUserPrompt: session.firstUserPrompt || null,
      projectRoot: session.projectRoot || null,
      projectName: session.projectName || null,
      gitBranch: session.gitBranch || null,
      startedAt: session.startedAt,
      endedAt: null,
      durationMs: null,
      isInTmux: session.isInTmux,
      tmuxSession: session.tmuxTarget?.session || null,
      tmuxWindow: session.tmuxTarget?.window || null,
      tmuxPane: session.tmuxTarget?.pane || null,
      metadata: null,
    })

    persistedSessions.add(session.id)

    // Add session start message
    historyStore.addMessage({
      sessionId: session.id,
      role: 'system',
      content: `Session started in ${session.cwd}`,
      contentPreview: `Session started in ${session.cwd}`,
      timestamp: session.startedAt,
      metadata: { agent: session.agent },
      jsonlPath: null,
      jsonlOffset: null,
      jsonlLength: null,
    })

    devLog.log(
      `[HistoryCaptureManager] Session persisted: ${session.id.slice(0, 8)}`
    )
  }

  /**
   * Handle session update
   */
  private handleSessionUpdate(session: ClaudeSession): void {
    // Ensure session exists in history
    if (!persistedSessions.has(session.id)) {
      this.handleSessionAdd(session)
    }

    // Update tmux info if available
    if (session.tmuxTarget) {
      historyStore.updateSession(session.id, {
        tmuxSession: session.tmuxTarget.session,
        tmuxWindow: session.tmuxTarget.window,
        tmuxPane: session.tmuxTarget.pane,
      })
    }
  }

  /**
   * Handle session removal (ended)
   */
  private handleSessionRemove(session: ClaudeSession): void {
    if (!persistedSessions.has(session.id)) {
      return
    }

    // Refresh session title before ending (for Claude Code sessions)
    if (session.agent === 'claude') {
      sessionStore.updateSessionTitle(session.id)
      // Re-fetch session with updated title
      const updatedSession = sessionStore.get(session.id)
      if (updatedSession) {
        historyStore.updateSession(session.id, {
          displayTitle: updatedSession.displayTitle,
          sessionSummary: updatedSession.sessionSummary,
          firstUserPrompt: updatedSession.firstUserPrompt,
        })
      }
    } else {
      // For non-Claude sessions, just update title fields
      historyStore.updateSession(session.id, {
        displayTitle: session.displayTitle,
        sessionSummary: session.sessionSummary || null,
        firstUserPrompt: session.firstUserPrompt || null,
      })
    }

    historyStore.endSession(session.id)

    // Add session end message
    historyStore.addMessage({
      sessionId: session.id,
      role: 'system',
      content: 'Session ended',
      contentPreview: 'Session ended',
      timestamp: Date.now(),
      metadata: null,
      jsonlPath: null,
      jsonlOffset: null,
      jsonlLength: null,
    })

    devLog.log(
      `[HistoryCaptureManager] Session ended: ${session.id.slice(0, 8)}`
    )

    // Parse JSONL file asynchronously to capture full conversation
    this.parseSessionJsonl(session)
  }

  /**
   * Parse JSONL file for a session and store conversation data
   */
  private async parseSessionJsonl(session: ClaudeSession): Promise<void> {
    // Skip if already parsed (prevents duplicate messages when both 'phaseChange' and 'remove' events fire)
    if (parsedJsonlSessions.has(session.id)) {
      devLog.log(
        `[HistoryCaptureManager] JSONL already parsed for session ${session.id.slice(0, 8)}, skipping`
      )
      return
    }

    try {
      const jsonlPath = getJsonlPath(session.cwd, session.id)
      if (!jsonlPath) {
        devLog.log(
          `[HistoryCaptureManager] No JSONL file found for session ${session.id.slice(0, 8)}`
        )
        return
      }

      devLog.log(
        `[HistoryCaptureManager] Parsing JSONL for session ${session.id.slice(0, 8)}`
      )

      const { entries, toolExecutions } = await parseJsonlFile(
        jsonlPath,
        session.id
      )

      if (entries.length === 0) {
        devLog.log(
          `[HistoryCaptureManager] No entries found in JSONL for session ${session.id.slice(0, 8)}`
        )
        return
      }

      // Convert parsed entries to message format and batch insert
      const messages = entries
        .filter(entry => entry.role === 'user' || entry.role === 'assistant')
        .map(entry => ({
          role: entry.role as MessageRole,
          content: entry.content,
          contentPreview: entry.contentPreview,
          timestamp: entry.timestamp,
          jsonlPath: entry.jsonlPath,
          jsonlOffset: entry.jsonlOffset,
          jsonlLength: entry.jsonlLength,
          metadata: entry.toolName
            ? { toolName: entry.toolName, toolUseId: entry.toolUseId }
            : undefined,
        }))

      if (messages.length > 0) {
        historyStore.addMessagesFromJsonl(session.id, messages)
      }

      // Add tool executions from JSONL (optimized: single query instead of N+1)
      const existingToolIds = new Set(
        historyStore.getToolExecutions(session.id).map(t => t.toolUseId)
      )

      for (const tool of toolExecutions) {
        if (tool.toolUseId && !existingToolIds.has(tool.toolUseId)) {
          historyStore.addToolExecution({
            sessionId: session.id,
            toolUseId: tool.toolUseId,
            toolName: tool.toolName,
            toolInput: tool.toolInput,
            toolOutput: tool.toolOutput || null,
            status: 'success',
            startedAt: tool.timestamp,
            completedAt: tool.timestamp,
            durationMs: null,
          })
          // Add to set to prevent duplicate inserts within same batch
          existingToolIds.add(tool.toolUseId)
        }
      }

      // Mark session as parsed to prevent re-parsing
      parsedJsonlSessions.add(session.id)

      devLog.log(
        `[HistoryCaptureManager] JSONL parsed: ${messages.length} messages, ${toolExecutions.length} tools for session ${session.id.slice(0, 8)}`
      )

      // Capture cost data from the same JSONL
      await this.captureSessionCost(session, jsonlPath)
    } catch (error) {
      devLog.error(
        `[HistoryCaptureManager] Error parsing JSONL for session ${session.id.slice(0, 8)}:`,
        error
      )
    }
  }

  /**
   * Capture and store cost data from a session's JSONL file
   */
  private async captureSessionCost(
    session: ClaudeSession,
    jsonlPath: string
  ): Promise<void> {
    try {
      // Check if we already have cost data for this session
      if (costStore.hasUsage(session.id)) {
        devLog.log(
          `[HistoryCaptureManager] Cost already captured for session ${session.id.slice(0, 8)}`
        )
        return
      }

      // Parse usage data from JSONL
      const usages = await parseClaudeSession(jsonlPath)

      if (usages.length === 0) {
        devLog.log(
          `[HistoryCaptureManager] No usage data found for session ${session.id.slice(0, 8)}`
        )
        return
      }

      // Aggregate all usage records
      const aggregated = aggregateClaudeUsage(usages)

      // Calculate total cost
      const totalUsage = {
        inputTokens: aggregated.totalInputTokens,
        outputTokens: aggregated.totalOutputTokens,
        cacheCreationTokens: aggregated.totalCacheCreationTokens,
        cacheReadTokens: aggregated.totalCacheReadTokens,
        model: aggregated.primaryModel,
        timestamp: Date.now(),
      }

      const totalCost = calculateCostByAgent(totalUsage, session.agent)

      // Store the usage record
      costStore.recordUsage(session.id, session.agent, totalUsage, totalCost)

      devLog.log(
        `[HistoryCaptureManager] Cost captured for session ${session.id.slice(0, 8)}: ` +
          `${aggregated.totalInputTokens} in / ${aggregated.totalOutputTokens} out tokens, ` +
          `$${totalCost.toFixed(4)} (${aggregated.primaryModel})`
      )
    } catch (error) {
      devLog.error(
        `[HistoryCaptureManager] Error capturing cost for session ${session.id.slice(0, 8)}:`,
        error
      )
    }
  }

  /**
   * Handle phase changes
   */
  private handlePhaseChange(
    session: ClaudeSession,
    _previousPhase?: string
  ): void {
    // Ensure session exists
    if (!persistedSessions.has(session.id)) {
      this.handleSessionAdd(session)
    }

    // Track phase change as activity
    if (session.phase === 'ended') {
      this.handleSessionRemove(session)
    }
  }

  /**
   * Process a hook event and capture relevant data
   * Called directly from hook socket server for more detailed data
   */
  processHookEvent(event: HookEvent): void {
    try {
      const { sessionId, event: eventName, tool, toolInput, toolUseId } = event

      // Debug logging
      devLog.log(
        `[HistoryCaptureManager] processHookEvent: ${eventName} session:${sessionId.slice(0, 8)} tool:${tool || 'none'} toolUseId:${toolUseId || 'none'}`
      )

      // Ensure session exists in history
      if (!persistedSessions.has(sessionId)) {
        // Try to get session from SessionStore
        const session = sessionStore.get(sessionId)
        if (session) {
          this.handleSessionAdd(session)
        }
      }

      // Skip if session not tracked
      if (!persistedSessions.has(sessionId)) {
        return
      }

      // Extract and save message
      const messageContent = extractMessageContent(event)
      if (messageContent) {
        historyStore.addMessage({
          sessionId,
          role: messageContent.role,
          content: messageContent.content,
          contentPreview:
            messageContent.content.length > 200
              ? `${messageContent.content.slice(0, 200)}...`
              : messageContent.content,
          timestamp: Date.now(),
          metadata: {
            eventName,
            tool,
          },
          jsonlPath: null,
          jsonlOffset: null,
          jsonlLength: null,
        })
      }

      // Handle tool execution tracking
      if (eventName === 'PreToolUse' && tool) {
        devLog.log(
          `[HistoryCaptureManager] PreToolUse detected: tool=${tool} toolUseId=${toolUseId || 'MISSING'}`
        )

        // Save tool execution even without toolUseId (use generated id)
        const execution = historyStore.addToolExecution({
          sessionId,
          toolUseId: toolUseId || null,
          toolName: tool,
          toolInput: toolInput || null,
          toolOutput: null,
          status: 'running',
          startedAt: Date.now(),
          completedAt: null,
          durationMs: null,
        })

        if (toolUseId) {
          pendingTools.set(toolUseId, execution.id)
        }
        devLog.log(
          `[HistoryCaptureManager] Tool execution saved: ${execution.id}`
        )
      }

      if (eventName === 'PostToolUse' && toolUseId) {
        devLog.log(
          `[HistoryCaptureManager] PostToolUse detected: toolUseId=${toolUseId}`
        )
        historyStore.completeToolExecution(toolUseId, 'success')
        pendingTools.delete(toolUseId)
      }

      // Handle session end
      if (eventName === 'SessionEnd') {
        const session = sessionStore.get(sessionId)
        if (session) {
          this.handleSessionRemove(session)
        }
      }
    } catch (error) {
      devLog.error(
        '[HistoryCaptureManager] Error processing hook event:',
        error
      )
    }
  }

  /**
   * Mark a tool execution as denied (permission not granted)
   */
  markToolDenied(toolUseId: string): void {
    historyStore.completeToolExecution(toolUseId, 'denied')
    pendingTools.delete(toolUseId)
  }

  /**
   * Get capture status
   */
  getStatus(): { isRunning: boolean; sessionCount: number } {
    return {
      isRunning: this.isRunning,
      sessionCount: persistedSessions.size,
    }
  }
}

/**
 * Extract display title from cwd
 */
function getDisplayTitle(cwd: string): string {
  const parts = cwd.split('/')
  return parts[parts.length - 1] || cwd
}

// Singleton instance
export const historyCaptureManager = new HistoryCaptureManager()
