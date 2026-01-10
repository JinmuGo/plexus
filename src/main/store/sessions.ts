/**
 * Session Store
 *
 * Central state management for Claude sessions.
 * Processes hook events and manages session lifecycle.
 */

import type {
  ClaudeSession,
  HookEvent,
  PermissionContext,
  QuestionContext,
  SessionPhase,
  TmuxTarget,
} from 'shared/hook-types'
import { buildProcessTree, isInTmux } from '../tmux/process-tree'
import { findTargetByPid, killPane } from '../tmux/target-finder'
import { detectGitBranch } from '../utils/git-branch-detector'
import { detectProjectRoot } from '../utils/project-root-detector'
import {
  computeDisplayTitle,
  extractClaudeTitle,
} from '../utils/session-title-extractor'
import {
  isQuestionTool,
  STALE_THRESHOLD_MS,
  CLEANUP_INTERVAL_MS,
  ENDED_MAX_AGE_MS,
  CURSOR_INACTIVITY_THRESHOLD_MS,
  COMPACTING_TIMEOUT_MS,
} from '../constants/sessions'

// Session event types
type SessionEventType =
  | 'add'
  | 'update'
  | 'remove'
  | 'phaseChange'
  | 'permissionRequest'
  | 'permissionResolved'

interface SessionEvent {
  type: SessionEventType
  session: ClaudeSession
  previousPhase?: SessionPhase
  permissionContext?: PermissionContext
}

export type { SessionEvent }

type SessionListener = (event: SessionEvent) => void

/**
 * Map hook status to session phase
 */
function mapStatusToPhase(status: string): SessionPhase {
  switch (status) {
    case 'processing':
    case 'running_tool':
      return 'processing'
    case 'waiting_for_approval':
      return 'waitingForApproval'
    case 'waiting_for_input':
      return 'waitingForInput'
    case 'compacting':
      return 'compacting'
    case 'ended':
    case 'error': // Fix #9: Treat error as ended phase
      return 'ended'
    default:
      return 'idle'
  }
}

/**
 * Extract question text from tool input
 * Fix #7: Support more field name variants
 */
function extractQuestionText(
  toolInput?: Record<string, unknown>
): { question: string; options?: string[]; header?: string } | null {
  if (!toolInput) return null

  // Fix #7: Check multiple known field names for question text
  const questionFields = [
    'question',
    'question_text',
    'text',
    'message',
    'prompt',
    'query',
  ]
  let question: string | undefined
  for (const field of questionFields) {
    const value = toolInput[field]
    if (typeof value === 'string' && value.trim()) {
      question = value
      break
    }
  }

  if (!question) return null

  // Fix #7: Check multiple known field names for options
  const optionsValue = toolInput.options || toolInput.choices || toolInput.items
  const options = Array.isArray(optionsValue)
    ? (optionsValue as unknown[]).filter(
        (o): o is string => typeof o === 'string'
      )
    : undefined

  // Fix #7: Check multiple known field names for header
  const headerValue = toolInput.header || toolInput.title || toolInput.label
  const header = typeof headerValue === 'string' ? headerValue : undefined

  return { question, options, header }
}

/**
 * Extract a readable message from a hook event
 */
function extractMessageFromEvent(event: HookEvent): {
  message: string
  role: 'user' | 'assistant' | 'tool'
} | null {
  const { event: eventName, tool, toolInput } = event

  switch (eventName) {
    case 'PreToolUse':
      if (tool) {
        return {
          message: formatToolInput(tool, toolInput),
          role: 'tool',
        }
      }
      return null

    case 'UserPromptSubmit':
      return { message: 'User submitted prompt', role: 'user' }

    case 'Stop':
      return { message: 'Assistant response complete', role: 'assistant' }

    case 'PostToolUse':
      if (tool) {
        return { message: `${tool} completed`, role: 'tool' }
      }
      return null

    case 'SessionStart':
      return { message: 'Session started', role: 'assistant' }

    default:
      return null
  }
}

/**
 * Format tool input into readable string
 */
function formatToolInput(
  toolName: string,
  toolInput?: Record<string, unknown>
): string {
  if (!toolInput || Object.keys(toolInput).length === 0) {
    return `[${toolName}]`
  }

  switch (toolName) {
    case 'Bash':
      return `[Bash] ${toolInput.command || ''}`
    case 'Read':
      return `[Read] ${toolInput.file_path || ''}`
    case 'Write':
      return `[Write] ${toolInput.file_path || ''}`
    case 'Edit':
      return `[Edit] ${toolInput.file_path || ''}`
    case 'Grep':
      return `[Grep] ${toolInput.pattern || ''}`
    case 'Glob':
      return `[Glob] ${toolInput.pattern || ''}`
    default: {
      const firstKey = Object.keys(toolInput)[0]
      const firstValue = firstKey ? toolInput[firstKey] : null
      if (firstValue && typeof firstValue === 'string') {
        return `[${toolName}] ${firstValue.slice(0, 50)}`
      }
      return `[${toolName}]`
    }
  }
}

// Batching constants for performance optimization
const BATCH_INTERVAL_MS = 50 // Batch events within 50ms window
const CRITICAL_EVENTS: Set<SessionEventType> = new Set([
  'permissionRequest',
  'permissionResolved',
])

class SessionStore {
  private sessions: Map<string, ClaudeSession> = new Map()
  private pidToSessionId: Map<number, string> = new Map() // PID index for deduplication
  private listeners: Set<SessionListener> = new Set()
  private cleanupTimer: NodeJS.Timeout | null = null

  // Event batching for performance
  private pendingEvents: SessionEvent[] = []
  private batchTimeout: NodeJS.Timeout | null = null

  // Get all active sessions
  getAll(): ClaudeSession[] {
    return Array.from(this.sessions.values())
  }

  // Get a specific session by ID
  get(sessionId: string): ClaudeSession | undefined {
    return this.sessions.get(sessionId)
  }

  // Get session count
  getCount(): number {
    return this.sessions.size
  }

  // Subscribe to session changes
  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Emit event to all listeners (with batching for non-critical events)
  private emit(event: SessionEvent): void {
    // Critical events (permissions) are emitted immediately
    if (CRITICAL_EVENTS.has(event.type)) {
      this.emitImmediate(event)
      return
    }

    // Non-critical events are batched
    this.pendingEvents.push(event)

    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.flushPendingEvents()
      }, BATCH_INTERVAL_MS)
    }
  }

  // Emit event immediately without batching
  private emitImmediate(event: SessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[SessionStore] Listener error:', error)
      }
    }
  }

  // Flush all pending events to listeners
  private flushPendingEvents(): void {
    this.batchTimeout = null
    const events = this.pendingEvents
    this.pendingEvents = []

    if (events.length === 0) return

    // Deduplicate update events for the same session (keep latest)
    const sessionUpdates = new Map<string, SessionEvent>()
    const otherEvents: SessionEvent[] = []

    for (const event of events) {
      if (event.type === 'update') {
        sessionUpdates.set(event.session.id, event)
      } else {
        otherEvents.push(event)
      }
    }

    // Emit deduplicated events
    const allEvents = [...otherEvents, ...sessionUpdates.values()]
    for (const event of allEvents) {
      this.emitImmediate(event)
    }
  }

  /**
   * Check if a process with given PID is still running
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0) // Signal 0 just checks existence
      return true
    } catch {
      return false
    }
  }

  /**
   * Handle session replacement when a new session arrives with the same PID
   * This happens when /resume is used in Claude Code
   */
  private handleSessionReplacement(
    oldSession: ClaudeSession,
    newSessionId: string
  ): void {
    console.log(
      `[SessionStore] Replacing session ${oldSession.id.slice(0, 8)} → ${newSessionId.slice(0, 8)} (PID: ${oldSession.pid})`
    )

    const previousPhase = oldSession.phase
    oldSession.phase = 'ended'
    oldSession.lastActivity = Date.now()
    oldSession.activePermission = undefined
    oldSession.questionContext = undefined

    // Emit remove event for old session (triggers history capture)
    this.emit({
      type: 'remove',
      session: oldSession,
      previousPhase,
    })

    // Remove old session from Map after delay for history capture
    setTimeout(() => {
      this.sessions.delete(oldSession.id)
      console.log(
        `[SessionStore] Old session ${oldSession.id.slice(0, 8)} removed after replacement`
      )
    }, 3000)
  }

  /**
   * Process a hook event
   * This is the main entry point for hook-based session updates
   */
  processHookEvent(event: HookEvent): void {
    const {
      sessionId,
      cwd,
      status,
      agent,
      pid,
      tty,
      tool,
      toolInput,
      toolUseId,
    } = event

    // Get or create session
    let session = this.sessions.get(sessionId)
    const isNew = !session

    if (!session) {
      // Check for existing session with same PID (handles /resume case)
      if (pid !== undefined) {
        const existingSessionId = this.pidToSessionId.get(pid)
        if (existingSessionId && existingSessionId !== sessionId) {
          const existingSession = this.sessions.get(existingSessionId)
          if (existingSession && existingSession.phase !== 'ended') {
            // Verify the PID is still the same process (not OS PID reuse)
            if (this.isProcessAlive(pid)) {
              // Same process, new session (likely /resume) - end the old session
              this.handleSessionReplacement(existingSession, sessionId)
            }
            // Clean up stale PID mapping
            this.pidToSessionId.delete(pid)
          }
        }
      }

      // Immediately check if this session is running in tmux
      let inTmux = false
      if (pid !== undefined) {
        try {
          const tree = buildProcessTree()
          inTmux = isInTmux(pid, tree)
        } catch (error) {
          console.error('[SessionStore] Failed to check tmux status:', error)
        }
      }

      // Detect project root from cwd
      const { projectRoot, projectName } = detectProjectRoot(cwd)

      // Detect git branch from cwd
      const { branch: gitBranch } = detectGitBranch(cwd)

      session = {
        id: sessionId,
        cwd,
        agent,
        pid,
        tty,
        phase: 'idle',
        startedAt: Date.now(),
        lastActivity: Date.now(),
        displayTitle: computeDisplayTitle(
          undefined,
          undefined,
          projectName,
          cwd
        ),
        isInTmux: inTmux,
        projectRoot,
        projectName,
        gitBranch: gitBranch ?? undefined,
      }
      this.sessions.set(sessionId, session)

      // Update PID index
      if (pid !== undefined) {
        this.pidToSessionId.set(pid, sessionId)
      }

      console.log(
        `[SessionStore] Session created: ${sessionId.slice(0, 8)} (${session.displayTitle}) [${agent}] [tmux: ${inTmux}] [project: ${projectName}] [branch: ${gitBranch ?? 'none'}]`
      )

      // Asynchronously find the tmux target for grouping
      if (inTmux && pid !== undefined) {
        this.resolveTmuxTarget(sessionId, pid)
      }
    }

    // Update session properties
    if (pid !== undefined) {
      // Handle PID change for existing session (update index)
      if (!isNew && session.pid !== pid) {
        // Remove old PID mapping if it exists
        if (session.pid !== undefined) {
          const mappedId = this.pidToSessionId.get(session.pid)
          if (mappedId === sessionId) {
            this.pidToSessionId.delete(session.pid)
          }
        }
        // Set new PID mapping
        this.pidToSessionId.set(pid, sessionId)
      }
      session.pid = pid
    }
    if (tty !== undefined) session.tty = tty
    session.lastActivity = Date.now()

    // Extract and update last message
    const messageInfo = extractMessageFromEvent(event)
    if (messageInfo) {
      session.lastMessage = messageInfo.message
      session.lastMessageRole = messageInfo.role
      console.log(
        `[SessionStore] Updated message for ${sessionId.slice(0, 8)}: "${messageInfo.message}" (${messageInfo.role})`
      )
    }

    // Capture first user prompt for session title (all agents)
    if (
      event.event === 'UserPromptSubmit' &&
      event.message &&
      !session.firstUserPrompt
    ) {
      session.firstUserPrompt = event.message
      // Recompute display title with first user prompt
      session.displayTitle = computeDisplayTitle(
        session.sessionSummary,
        session.firstUserPrompt,
        session.projectName,
        session.cwd
      )
      console.log(
        `[SessionStore] Session ${sessionId.slice(0, 8)} title updated: "${session.displayTitle}"`
      )
    }

    // Update lastToolName when tool is present
    if (tool) {
      session.lastToolName = tool
    }

    // Map status to phase
    const newPhase = mapStatusToPhase(status)
    const previousPhase = session.phase

    // Handle phase transition
    if (newPhase !== previousPhase) {
      session.phase = newPhase

      // Fix #6: Track when compacting phase started
      if (newPhase === 'compacting') {
        session.compactingStartedAt = Date.now()
      } else if (previousPhase === 'compacting') {
        session.compactingStartedAt = undefined
      }

      console.log(
        `[SessionStore] Session ${sessionId.slice(0, 8)} phase: ${previousPhase} → ${newPhase}`
      )

      // Handle permission request
      if (newPhase === 'waitingForApproval' && tool && toolUseId) {
        const permissionContext: PermissionContext = {
          toolUseId,
          toolName: tool,
          toolInput,
          receivedAt: Date.now(),
        }
        session.activePermission = permissionContext

        this.emit({
          type: 'permissionRequest',
          session,
          permissionContext,
        })
      }

      // Clear permission when transitioning away from waitingForApproval
      if (
        previousPhase === 'waitingForApproval' &&
        newPhase !== 'waitingForApproval'
      ) {
        session.activePermission = undefined
        this.emit({
          type: 'permissionResolved',
          session,
          previousPhase,
        })
      }

      // Handle question tools
      if (
        newPhase === 'waitingForInput' &&
        tool &&
        toolUseId &&
        isQuestionTool(tool)
      ) {
        const questionInfo = extractQuestionText(toolInput)
        if (questionInfo) {
          const questionContext: QuestionContext = {
            toolUseId,
            toolName: tool,
            question: questionInfo.question,
            options: questionInfo.options,
            header: questionInfo.header,
            receivedAt: Date.now(),
          }
          session.questionContext = questionContext
          console.log(
            `[SessionStore] Question context set for ${sessionId.slice(0, 8)}: "${questionInfo.question.slice(0, 50)}..."`
          )
        }
      }

      // Clear question context when transitioning away from waitingForInput
      if (
        previousPhase === 'waitingForInput' &&
        newPhase !== 'waitingForInput'
      ) {
        session.questionContext = undefined
      }

      // Handle session end
      if (newPhase === 'ended') {
        this.emit({
          type: 'remove',
          session,
          previousPhase,
        })
        // Remove session after a short delay to allow history capture to complete
        // Use delete directly to avoid emitting 'remove' event twice
        setTimeout(() => {
          this.sessions.delete(sessionId)
          console.log(
            `[SessionStore] Session ${sessionId.slice(0, 8)} removed after ending`
          )
        }, 3000)
        return
      }

      this.emit({
        type: isNew ? 'add' : 'phaseChange',
        session,
        previousPhase,
      })
    } else if (isNew) {
      this.emit({
        type: 'add',
        session,
      })
    } else {
      // Update without phase change
      this.emit({
        type: 'update',
        session,
      })
    }
  }

  /**
   * Set permission context for a session
   */
  setPermission(sessionId: string, context: PermissionContext): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.activePermission = context
      session.phase = 'waitingForApproval'
      this.emit({
        type: 'permissionRequest',
        session,
        permissionContext: context,
      })
    }
  }

  /**
   * Clear permission for a session
   */
  clearPermission(sessionId: string, _toolUseId: string): void {
    const session = this.sessions.get(sessionId)
    console.log(
      `[SessionStore] clearPermission called for ${sessionId.slice(0, 8)}, session exists: ${!!session}, hasPermission: ${!!session?.activePermission}`
    )
    if (session?.activePermission) {
      const previousPhase = session.phase
      session.activePermission = undefined
      session.phase = 'processing' // Move to processing after permission resolved
      console.log(
        `[SessionStore] Session ${sessionId.slice(0, 8)} phase: ${previousPhase} → processing (permission cleared)`
      )

      this.emit({
        type: 'permissionResolved',
        session,
        previousPhase,
      })
    }
  }

  /**
   * Update session phase directly
   */
  updatePhase(sessionId: string, phase: SessionPhase): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      const previousPhase = session.phase

      // Skip if already in the target phase
      if (previousPhase === phase) {
        return
      }

      session.phase = phase
      session.lastActivity = Date.now()

      // When transitioning to 'ended', emit 'remove' event for notifications
      if (phase === 'ended') {
        this.emit({
          type: 'remove',
          session,
          previousPhase,
        })
      } else {
        this.emit({
          type: 'phaseChange',
          session,
          previousPhase,
        })
      }
    }
  }

  /**
   * Set Tmux target for a session
   */
  setTmuxTarget(sessionId: string, target: TmuxTarget): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.tmuxTarget = target
      this.emit({
        type: 'update',
        session,
      })
    }
  }

  /**
   * Asynchronously resolve the tmux target for a session
   * Called when a session is created and isInTmux is true
   */
  private async resolveTmuxTarget(
    sessionId: string,
    pid: number
  ): Promise<void> {
    try {
      const target = await findTargetByPid(pid)
      if (target) {
        const session = this.sessions.get(sessionId)
        if (session) {
          session.tmuxTarget = target
          console.log(
            `[SessionStore] Session ${sessionId.slice(0, 8)} tmux target: ${target.session}:${target.window}.${target.pane}`
          )
          this.emit({
            type: 'update',
            session,
          })
        }
      }
    } catch (error) {
      console.error(
        `[SessionStore] Failed to resolve tmux target for ${sessionId.slice(0, 8)}:`,
        error
      )
    }
  }

  /**
   * Update last message info for a session
   */
  updateLastMessage(
    sessionId: string,
    message: string,
    role: 'user' | 'assistant' | 'tool',
    toolName?: string
  ): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastMessage = message
      session.lastMessageRole = role
      if (toolName) {
        session.lastToolName = toolName
      }
      this.emit({
        type: 'update',
        session,
      })
    }
  }

  /**
   * Update session title from JSONL parsing (Claude Code only)
   * Called periodically to refresh session title with summary from JSONL
   */
  updateSessionTitle(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.agent !== 'claude') return

    const titleResult = extractClaudeTitle(
      sessionId,
      session.cwd,
      session.projectName
    )

    // Update if summary or first prompt changed
    const hasNewSummary =
      titleResult.sessionSummary &&
      titleResult.sessionSummary !== session.sessionSummary
    const hasNewPrompt =
      !session.firstUserPrompt &&
      titleResult.firstUserPrompt &&
      titleResult.firstUserPrompt !== session.firstUserPrompt

    if (hasNewSummary || hasNewPrompt) {
      if (titleResult.sessionSummary) {
        session.sessionSummary = titleResult.sessionSummary
      }
      if (titleResult.firstUserPrompt && !session.firstUserPrompt) {
        session.firstUserPrompt = titleResult.firstUserPrompt
      }
      session.displayTitle = titleResult.displayTitle

      console.log(
        `[SessionStore] Session ${sessionId.slice(0, 8)} title refreshed: "${session.displayTitle}"`
      )
      this.emit({
        type: 'update',
        session,
      })
    }
  }

  /**
   * Remove a session
   * Note: Only emits 'remove' event if session wasn't already ended
   * (to avoid duplicate notifications when session was already marked as ended)
   */
  remove(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      // Clean up PID index
      if (session.pid !== undefined) {
        const mappedId = this.pidToSessionId.get(session.pid)
        if (mappedId === sessionId) {
          this.pidToSessionId.delete(session.pid)
        }
      }

      const wasEnded = session.phase === 'ended'
      this.sessions.delete(sessionId)

      // Only emit remove event if session wasn't already ended
      // (ended sessions already triggered notification via processHookEvent or updatePhase)
      if (!wasEnded) {
        this.emit({
          type: 'remove',
          session,
        })
      }
      console.log(`[SessionStore] Session removed: ${sessionId.slice(0, 8)}`)
    }
  }

  /**
   * Terminate a session by sending kill signal to its process
   */
  async terminate(
    sessionId: string,
    signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'
  ): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      console.log(
        `[SessionStore] Cannot terminate: session ${sessionId.slice(0, 8)} not found`
      )
      return false
    }

    // Method 1: Kill by PID if available
    if (session.pid) {
      try {
        process.kill(session.pid, signal)
        console.log(
          `[SessionStore] Sent ${signal} to PID ${session.pid} (session ${sessionId.slice(0, 8)})`
        )
        this.updatePhase(sessionId, 'ended')
        return true
      } catch (error) {
        // Process might already be dead, continue to other methods
        console.warn(`[SessionStore] Failed to kill PID ${session.pid}:`, error)
      }
    }

    // Method 2: Kill tmux pane if in tmux
    if (session.isInTmux && session.tmuxTarget) {
      const killed = await killPane(session.tmuxTarget)
      if (killed) {
        console.log(
          `[SessionStore] Killed tmux pane for session ${sessionId.slice(0, 8)}`
        )
        this.updatePhase(sessionId, 'ended')
        return true
      }
    }

    // Fallback: Just mark as ended
    console.log(
      `[SessionStore] No kill method available, marking session ${sessionId.slice(0, 8)} as ended`
    )
    this.updatePhase(sessionId, 'ended')
    return true
  }

  /**
   * Archive old ended sessions
   */
  archiveEndedSessions(maxAgeMs: number = 3600000): void {
    const now = Date.now()
    const toRemove: string[] = []

    for (const [sessionId, session] of this.sessions) {
      if (session.phase === 'ended' && now - session.lastActivity > maxAgeMs) {
        toRemove.push(sessionId)
      }
    }

    for (const sessionId of toRemove) {
      this.remove(sessionId)
    }

    if (toRemove.length > 0) {
      console.log(`[SessionStore] Archived ${toRemove.length} ended sessions`)
    }
  }

  /**
   * Get sessions sorted by priority
   * Priority: waitingForApproval/processing > waitingForInput > idle/ended
   */
  getSortedSessions(): ClaudeSession[] {
    return this.getAll().sort((a, b) => {
      const priorityA = this.getPhasePriority(a.phase)
      const priorityB = this.getPhasePriority(b.phase)

      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      // Sort by last activity (more recent first)
      return b.lastActivity - a.lastActivity
    })
  }

  private getPhasePriority(phase: SessionPhase): number {
    switch (phase) {
      case 'waitingForApproval':
      case 'processing':
      case 'compacting':
        return 0
      case 'waitingForInput':
        return 1
      case 'idle':
      case 'ended':
        return 2
    }
  }

  /**
   * Start automatic cleanup timer
   */
  startAutoCleanup(): void {
    if (this.cleanupTimer) return

    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleSessions()
    }, CLEANUP_INTERVAL_MS)

    console.log('[SessionStore] Auto cleanup started')
  }

  /**
   * Stop automatic cleanup timer and flush pending events
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
      console.log('[SessionStore] Auto cleanup stopped')
    }

    // Flush any pending batched events
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
      this.flushPendingEvents()
    }
  }

  /**
   * Clean up stale and old ended sessions
   */
  private cleanupStaleSessions(): void {
    const now = Date.now()

    for (const [sessionId, session] of this.sessions) {
      // Remove old ended sessions first (after 1 hour)
      if (
        session.phase === 'ended' &&
        now - session.lastActivity > ENDED_MAX_AGE_MS
      ) {
        this.remove(sessionId)
        continue
      }

      // Skip if already ended
      if (session.phase === 'ended') {
        continue
      }

      const inactivityTime = now - session.lastActivity

      // Cursor sessions: use activity-based detection (may not have PID)
      // Fix #8: Improved Cursor inactivity detection with process check
      if (session.agent === 'cursor') {
        // If PID is available, check if process is alive
        // Note: Cursor hook's PID (process.ppid) is the spawner process which terminates
        // shortly after hook execution, NOT the Cursor IDE process itself.
        // So we must also check inactivity time before marking as ended.
        if (session.pid && !this.isProcessAlive(session.pid)) {
          // Only mark as ended if also inactive for the stale threshold
          // This prevents killing active sessions just because the spawner exited
          if (inactivityTime > STALE_THRESHOLD_MS) {
            console.log(
              `[SessionStore] Marking dead Cursor session ${sessionId.slice(0, 8)} as ended (PID ${session.pid} not alive, ${Math.round(inactivityTime / 1000)}s inactive)`
            )
            this.updatePhase(sessionId, 'ended')
          }
          continue
        }

        // Activity-based stale detection for Cursor (5 minute threshold)
        if (inactivityTime > CURSOR_INACTIVITY_THRESHOLD_MS) {
          // Double-check by verifying Cursor is still running
          const cursorStillActive =
            session.pid && this.isProcessAlive(session.pid)

          if (!cursorStillActive) {
            console.log(
              `[SessionStore] Marking inactive Cursor session ${sessionId.slice(0, 8)} as ended (${Math.round(inactivityTime / 1000)}s inactive, process dead)`
            )
            this.updatePhase(sessionId, 'ended')
          } else {
            // Process alive but very inactive - mark as idle instead of ended
            if (
              session.phase !== 'idle' &&
              session.phase !== 'waitingForInput'
            ) {
              console.log(
                `[SessionStore] Cursor session ${sessionId.slice(0, 8)} inactive for ${Math.round(inactivityTime / 1000)}s, marking as idle`
              )
              this.updatePhase(sessionId, 'idle')
            }
          }
        }
        continue
      }

      // Claude/Gemini: PID-based detection with shorter threshold
      if (inactivityTime > STALE_THRESHOLD_MS) {
        if (session.pid) {
          if (this.isProcessAlive(session.pid)) {
            // Process is alive - check for stuck compacting state
            // Fix #6: Use dedicated compacting timeout (90 seconds)
            if (session.phase === 'compacting') {
              const compactingStartedAt =
                session.compactingStartedAt || session.lastActivity
              const compactingDuration = now - compactingStartedAt

              if (compactingDuration > COMPACTING_TIMEOUT_MS) {
                console.log(
                  `[SessionStore] Compacting timed out for ${sessionId.slice(0, 8)} after ${Math.round(compactingDuration / 1000)}s, resetting to waitingForInput`
                )
                this.updatePhase(sessionId, 'waitingForInput')
              }
            }
            continue // Process is alive, skip
          }
          // Process is dead
        }

        console.log(
          `[SessionStore] Marking stale session ${sessionId.slice(0, 8)} as ended`
        )
        this.updatePhase(sessionId, 'ended')
      }
    }
  }
}

// Singleton instance
export const sessionStore = new SessionStore()
