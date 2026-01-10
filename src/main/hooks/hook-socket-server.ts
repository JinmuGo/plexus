/**
 * Hook Socket Server
 *
 * Unix domain socket server that receives events from Claude Code hooks.
 * Handles request/response for permission decisions.
 */

import * as net from 'node:net'
import * as fs from 'node:fs'
import type {
  HookEvent,
  HookResponse,
  PendingPermission,
} from 'shared/hook-types'
import { SOCKET_PATH } from 'shared/hook-types'
import type { HITLRequest } from 'shared/hitl-types'
import {
  createHITLRequestId,
  createHITLTitle,
  createHITLMessage,
} from 'shared/hitl-types'
import { autoAllowStore } from '../store/auto-allow-store'

// Re-export socket path
export { SOCKET_PATH }

// Callback types
export type HookEventHandler = (event: HookEvent) => void
export type PermissionFailureHandler = (
  sessionId: string,
  toolUseId: string
) => void

/**
 * Performance constants
 */
const MAX_CACHE_SIZE = 1000 // Maximum tool_use_id cache entries
const PERMISSION_TIMEOUT_MS = 30_000 // 30 seconds timeout for pending permissions
const CLEANUP_INTERVAL_MS = 10_000 // Check for stale permissions every 10 seconds
const EVENT_DEBOUNCE_MS = 50 // Debounce window for non-critical events

/**
 * Debounced event entry for coalescing rapid-fire events
 */
interface DebouncedEventEntry {
  event: HookEvent
  timer: NodeJS.Timeout
}

/**
 * Socket server state
 */
interface ServerState {
  server: net.Server | null
  eventHandler: HookEventHandler | null
  permissionFailureHandler: PermissionFailureHandler | null
  pendingPermissions: Map<string, PendingPermission>
  toolUseIdCache: Map<string, string[]>
  clientCounter: number
  cleanupTimer: NodeJS.Timeout | null
  // Debouncing state for fire-and-forget events
  debouncedEvents: Map<string, DebouncedEventEntry>
}

const state: ServerState = {
  server: null,
  eventHandler: null,
  permissionFailureHandler: null,
  pendingPermissions: new Map(),
  toolUseIdCache: new Map(),
  clientCounter: 0,
  cleanupTimer: null,
  debouncedEvents: new Map(),
}

/**
 * Generate a cache key for tool_use_id lookup
 */
function generateCacheKey(
  sessionId: string,
  toolName: string | undefined,
  toolInput: Record<string, unknown> | undefined
): string {
  const inputStr = toolInput
    ? JSON.stringify(toolInput, Object.keys(toolInput).sort())
    : '{}'
  return `${sessionId}:${toolName || 'unknown'}:${inputStr}`
}

/**
 * Cache tool_use_id from PreToolUse event (with size limit)
 */
function cacheToolUseId(event: HookEvent): void {
  if (!event.toolUseId) return

  // Enforce cache size limit (FIFO eviction)
  if (state.toolUseIdCache.size >= MAX_CACHE_SIZE) {
    const firstKey = state.toolUseIdCache.keys().next().value
    if (firstKey) {
      state.toolUseIdCache.delete(firstKey)
      console.log(`[HookSocket] Cache full, evicted oldest entry`)
    }
  }

  const key = generateCacheKey(event.sessionId, event.tool, event.toolInput)
  const queue = state.toolUseIdCache.get(key) || []
  queue.push(event.toolUseId)
  state.toolUseIdCache.set(key, queue)

  console.log(
    `[HookSocket] Cached tool_use_id for ${event.sessionId.slice(0, 8)} tool:${event.tool} id:${event.toolUseId.slice(0, 12)}`
  )
}

/**
 * Cleanup stale pending permissions (timeout enforcement)
 */
function cleanupStalePermissions(): void {
  const now = Date.now()
  const staleIds: string[] = []

  for (const [toolUseId, pending] of state.pendingPermissions.entries()) {
    if (now - pending.receivedAt > PERMISSION_TIMEOUT_MS) {
      staleIds.push(toolUseId)
    }
  }

  for (const toolUseId of staleIds) {
    const pending = state.pendingPermissions.get(toolUseId) as
      | (PendingPermission & { socket?: net.Socket })
      | undefined

    // Fix #2: Check failureReported to prevent duplicate notifications
    if (pending && !pending.failureReported) {
      pending.failureReported = true

      console.log(
        `[HookSocket] Permission timeout for ${pending.sessionId.slice(0, 8)} tool:${toolUseId.slice(0, 12)}`
      )

      // Close the socket
      if (pending.socket && !pending.socket.destroyed) {
        pending.socket.destroy()
      }

      state.pendingPermissions.delete(toolUseId)
      state.permissionFailureHandler?.(pending.sessionId, toolUseId)
    } else if (pending?.failureReported) {
      // Already reported, just clean up
      state.pendingPermissions.delete(toolUseId)
    }
  }

  if (staleIds.length > 0) {
    console.log(
      `[HookSocket] Cleaned up ${staleIds.length} stale permission(s)`
    )
  }
}

/**
 * Pop cached tool_use_id for PermissionRequest (FIFO)
 */
function popCachedToolUseId(event: HookEvent): string | undefined {
  const key = generateCacheKey(event.sessionId, event.tool, event.toolInput)
  const queue = state.toolUseIdCache.get(key)

  if (!queue || queue.length === 0) {
    return undefined
  }

  const toolUseId = queue.shift()

  if (queue.length === 0) {
    state.toolUseIdCache.delete(key)
  }

  console.log(
    `[HookSocket] Retrieved cached tool_use_id for ${event.sessionId.slice(0, 8)} tool:${event.tool} id:${toolUseId?.slice(0, 12)}`
  )

  return toolUseId
}

/**
 * Clean up cache entries for a session
 */
function cleanupCache(sessionId: string): void {
  const keysToRemove: string[] = []

  for (const key of state.toolUseIdCache.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      keysToRemove.push(key)
    }
  }

  for (const key of keysToRemove) {
    state.toolUseIdCache.delete(key)
  }

  if (keysToRemove.length > 0) {
    console.log(
      `[HookSocket] Cleaned up ${keysToRemove.length} cache entries for session ${sessionId.slice(0, 8)}`
    )
  }
}

/**
 * Handle an incoming client connection
 */
function handleClient(socket: net.Socket): void {
  const clientId = ++state.clientCounter
  let buffer = ''

  console.log(`[HookSocket] Client ${clientId} connected`)

  socket.on('data', data => {
    buffer += data.toString()

    // Try to parse as JSON (single message per connection)
    try {
      const event = JSON.parse(buffer) as HookEvent
      buffer = ''
      handleEvent(event, socket, clientId)
    } catch {
      // Wait for more data if JSON is incomplete
    }
  })

  socket.on('error', error => {
    console.error(`[HookSocket] Client ${clientId} error:`, error.message)
  })

  socket.on('close', () => {
    console.log(`[HookSocket] Client ${clientId} disconnected`)

    // Check if this socket had a pending permission request
    for (const [toolUseId, pending] of state.pendingPermissions.entries()) {
      if (pending.clientSocketId === clientId) {
        // Fix #2: Check failureReported to prevent duplicate notifications
        if (!pending.failureReported) {
          pending.failureReported = true
          console.log(
            `[HookSocket] Socket closed for pending permission ${pending.sessionId.slice(0, 8)} tool:${toolUseId.slice(0, 12)}`
          )
          state.pendingPermissions.delete(toolUseId)
          state.permissionFailureHandler?.(pending.sessionId, toolUseId)
        } else {
          // Already reported, just clean up
          state.pendingPermissions.delete(toolUseId)
        }
        break
      }
    }
  })
}

/**
 * Handle a parsed hook event
 */
function handleEvent(
  event: HookEvent,
  socket: net.Socket,
  clientId: number
): void {
  console.log(
    `[HookSocket] Received: ${event.event} for ${event.sessionId.slice(0, 8)}`
  )

  // Cache tool_use_id from PreToolUse
  if (event.event === 'PreToolUse') {
    cacheToolUseId(event)
  }

  // Clean up cache and auto-allows on session end
  if (event.event === 'SessionEnd') {
    cleanupCache(event.sessionId)
    autoAllowStore.clearSession(event.sessionId)
  }

  // Handle permission requests specially
  if (event.status === 'waiting_for_approval') {
    const toolName = event.tool || 'unknown'

    // Check if this tool is auto-allowed for the session
    if (autoAllowStore.isAutoAllowed(event.sessionId, toolName)) {
      console.log(
        `[HookSocket] Auto-allowing '${toolName}' for ${event.sessionId.slice(0, 8)}`
      )

      // Send immediate allow response
      const response: HookResponse = { decision: 'allow' }
      try {
        socket.write(JSON.stringify(response))
        socket.end()
      } catch (error) {
        console.error('[HookSocket] Failed to send auto-allow response:', error)
      }

      // Still notify handler for UI update (but with no pending permission)
      state.eventHandler?.(event)
      return
    }

    // Resolve tool_use_id from cache if not present
    let toolUseId = event.toolUseId
    if (!toolUseId) {
      toolUseId = popCachedToolUseId(event)
    }

    // Fix #4: Generate synthetic ID if cache miss instead of closing socket
    if (!toolUseId) {
      // For Gemini, try to generate a deterministic ID that matches the hook script
      if (event.agent === 'gemini' && event.tool) {
        const timeBucket = Math.floor(Date.now() / 1000)
        toolUseId = `gemini_${event.sessionId.slice(0, 8)}_${event.tool}_${timeBucket}`
        console.log(
          `[HookSocket] Generated Gemini-compatible toolUseId: ${toolUseId.slice(0, 20)}`
        )
      } else {
        // Fallback to synthetic ID for other agents
        toolUseId = `synthetic_${event.sessionId.slice(0, 8)}_${Date.now()}`
        console.warn(
          `[HookSocket] Generated synthetic toolUseId for ${event.sessionId.slice(0, 8)}: ${toolUseId.slice(0, 20)}`
        )
      }
    }

    console.log(
      `[HookSocket] Permission request - keeping socket open for ${event.sessionId.slice(0, 8)} tool:${toolUseId.slice(0, 12)}`
    )

    // Update event with resolved toolUseId
    const updatedEvent: HookEvent = { ...event, toolUseId }

    // Check for existing pending permission with same toolUseId
    // This handles duplicate requests from BeforeTool + ToolPermission notification
    const existingPending = state.pendingPermissions.get(toolUseId) as
      | (PendingPermission & { socket?: net.Socket })
      | undefined

    if (existingPending) {
      console.log(
        `[HookSocket] Duplicate permission request for ${event.sessionId.slice(0, 8)} tool:${toolUseId.slice(0, 12)} - closing old socket, using new one`
      )
      // Close the old socket (will return 'ask' to let Gemini CLI handle it)
      if (existingPending.socket && !existingPending.socket.destroyed) {
        try {
          const askResponse: HookResponse = { decision: 'ask' }
          existingPending.socket.write(JSON.stringify(askResponse))
          existingPending.socket.end()
        } catch {
          existingPending.socket.destroy()
        }
      }
    }

    // Store pending permission
    const pending: PendingPermission = {
      sessionId: event.sessionId,
      toolUseId,
      clientSocketId: clientId,
      event: updatedEvent,
      receivedAt: Date.now(),
    }
    state.pendingPermissions.set(toolUseId, pending)

    // Store socket reference on the pending object for later response
    ;(pending as PendingPermission & { socket: net.Socket }).socket = socket

    // Notify handler (only if this is the first request for this toolUseId)
    if (!existingPending) {
      state.eventHandler?.(updatedEvent)
    }
    return
  }

  // Fire and forget for non-permission events
  socket.end()

  // Debounce non-critical events to coalesce rapid-fire updates
  // Critical events: SessionStart, SessionEnd, PreToolUse are processed immediately
  const criticalEvents = new Set([
    'SessionStart',
    'SessionEnd',
    'PreToolUse',
    'PermissionRequest',
  ])

  if (criticalEvents.has(event.event)) {
    // Critical events bypass debouncing
    state.eventHandler?.(event)
    return
  }

  // Debounce key: session + status combination
  const debounceKey = `${event.sessionId}:${event.status}`

  // Cancel existing debounce timer if present
  const existing = state.debouncedEvents.get(debounceKey)
  if (existing) {
    clearTimeout(existing.timer)
  }

  // Set new debounce timer - only the latest event will fire
  const timer = setTimeout(() => {
    state.debouncedEvents.delete(debounceKey)
    state.eventHandler?.(event)
  }, EVENT_DEBOUNCE_MS)

  state.debouncedEvents.set(debounceKey, { event, timer })
}

/**
 * Start the socket server
 */
export function start(
  onEvent: HookEventHandler,
  onPermissionFailure?: PermissionFailureHandler
): void {
  if (state.server) {
    console.log('[HookSocket] Server already running')
    return
  }

  state.eventHandler = onEvent
  state.permissionFailureHandler = onPermissionFailure || null

  // Remove existing socket file
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH)
  }

  state.server = net.createServer(handleClient)

  state.server.on('error', error => {
    console.error('[HookSocket] Server error:', error)
  })

  state.server.listen(SOCKET_PATH, () => {
    // Set socket permissions (world-readable/writable)
    fs.chmodSync(SOCKET_PATH, 0o777)
    console.log(`[HookSocket] Listening on ${SOCKET_PATH}`)
  })

  // Start periodic cleanup of stale permissions
  state.cleanupTimer = setInterval(cleanupStalePermissions, CLEANUP_INTERVAL_MS)
}

/**
 * Stop the socket server
 */
export function stop(): void {
  if (!state.server) {
    return
  }

  // Stop cleanup timer
  if (state.cleanupTimer) {
    clearInterval(state.cleanupTimer)
    state.cleanupTimer = null
  }

  // Close all pending permission sockets
  for (const pending of state.pendingPermissions.values()) {
    const socket = (pending as PendingPermission & { socket?: net.Socket })
      .socket
    if (socket) {
      socket.destroy()
    }
  }
  state.pendingPermissions.clear()

  // Clear debounced events
  for (const entry of state.debouncedEvents.values()) {
    clearTimeout(entry.timer)
  }
  state.debouncedEvents.clear()

  // Clear cache
  state.toolUseIdCache.clear()

  state.server.close(() => {
    console.log('[HookSocket] Server stopped')
  })

  // Remove socket file
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH)
  }

  state.server = null
  state.eventHandler = null
  state.permissionFailureHandler = null
}

/**
 * Extended options for permission response
 */
export interface PermissionResponseOptions {
  reason?: string
  // Claude-only: modify tool input before execution
  updatedInput?: Record<string, unknown>
  // Claude-only: stop agent entirely on deny
  interrupt?: boolean
}

/**
 * Respond to a pending permission request
 */
export function respondToPermission(
  toolUseId: string,
  decision: 'allow' | 'deny' | 'ask' | 'block',
  options?: PermissionResponseOptions
): void {
  const pending = state.pendingPermissions.get(toolUseId) as
    | (PendingPermission & { socket?: net.Socket })
    | undefined

  if (!pending) {
    console.log(
      `[HookSocket] No pending permission for toolUseId: ${toolUseId.slice(0, 12)}`
    )
    return
  }

  state.pendingPermissions.delete(toolUseId)

  const response: HookResponse = {
    decision,
    reason: options?.reason,
    updatedInput: options?.updatedInput,
    interrupt: options?.interrupt,
  }
  const socket = pending.socket

  if (!socket || socket.destroyed) {
    console.warn(
      `[HookSocket] Socket already closed for ${pending.sessionId.slice(0, 8)}`
    )
    state.permissionFailureHandler?.(pending.sessionId, toolUseId)
    return
  }

  const age = (Date.now() - pending.receivedAt) / 1000
  console.log(
    `[HookSocket] Sending response: ${decision} for ${pending.sessionId.slice(0, 8)} tool:${toolUseId.slice(0, 12)} (age: ${age.toFixed(1)}s)`
  )

  try {
    socket.write(JSON.stringify(response))
    socket.end()
  } catch (error) {
    console.error('[HookSocket] Failed to send response:', error)
    state.permissionFailureHandler?.(pending.sessionId, toolUseId)
  }
}

/**
 * Respond to permission by session ID (finds the most recent pending for that session)
 */
export function respondToPermissionBySession(
  sessionId: string,
  decision: 'allow' | 'deny' | 'ask' | 'block',
  options?: PermissionResponseOptions
): void {
  // Find the most recent pending permission for this session
  let mostRecent: (PendingPermission & { socket?: net.Socket }) | undefined

  for (const pending of state.pendingPermissions.values()) {
    if (pending.sessionId === sessionId) {
      if (!mostRecent || pending.receivedAt > mostRecent.receivedAt) {
        mostRecent = pending as PendingPermission & { socket?: net.Socket }
      }
    }
  }

  if (!mostRecent) {
    console.log(
      `[HookSocket] No pending permission for session: ${sessionId.slice(0, 8)}`
    )
    return
  }

  respondToPermission(mostRecent.toolUseId, decision, options)
}

/**
 * Cancel all pending permissions for a session
 */
export function cancelPendingPermissions(sessionId: string): void {
  const toRemove: string[] = []

  for (const [toolUseId, pending] of state.pendingPermissions.entries()) {
    if (pending.sessionId === sessionId) {
      console.log(
        `[HookSocket] Cleaning up stale permission for ${sessionId.slice(0, 8)} tool:${toolUseId.slice(0, 12)}`
      )

      const socket = (pending as PendingPermission & { socket?: net.Socket })
        .socket
      if (socket) {
        socket.destroy()
      }

      toRemove.push(toolUseId)
    }
  }

  for (const toolUseId of toRemove) {
    state.pendingPermissions.delete(toolUseId)
  }
}

/**
 * Cancel a specific pending permission
 */
export function cancelPendingPermission(toolUseId: string): void {
  const pending = state.pendingPermissions.get(toolUseId) as
    | (PendingPermission & { socket?: net.Socket })
    | undefined

  if (!pending) {
    return
  }

  console.log(
    `[HookSocket] Tool completed externally, closing socket for ${pending.sessionId.slice(0, 8)} tool:${toolUseId.slice(0, 12)}`
  )

  const socket = pending.socket
  if (socket) {
    socket.destroy()
  }

  state.pendingPermissions.delete(toolUseId)
}

/**
 * Check if there's a pending permission for a session
 */
export function hasPendingPermission(sessionId: string): boolean {
  for (const pending of state.pendingPermissions.values()) {
    if (pending.sessionId === sessionId) {
      return true
    }
  }
  return false
}

/**
 * Create an HITLRequest from a HookEvent
 */
export function createHITLRequestFromEvent(event: HookEvent): HITLRequest {
  const toolName = event.tool || 'unknown'
  const agent = event.agent

  return {
    id: createHITLRequestId(event.sessionId, event.toolUseId),
    sessionId: event.sessionId,
    agent,
    kind: 'permission',
    toolName,
    toolInput: event.toolInput,
    toolUseId: event.toolUseId,
    title: createHITLTitle(toolName, agent),
    message: createHITLMessage(toolName, event.toolInput),
    timestamp: Date.now(),
    originalEvent: event.event,
  }
}

/**
 * Get pending permission details for a session
 */
export function getPendingPermission(sessionId: string): {
  toolName: string
  toolId: string
  toolInput?: Record<string, unknown>
} | null {
  for (const pending of state.pendingPermissions.values()) {
    if (pending.sessionId === sessionId) {
      return {
        toolName: pending.event.tool || 'unknown',
        toolId: pending.toolUseId,
        toolInput: pending.event.toolInput,
      }
    }
  }
  return null
}

/**
 * Get HITLRequest for a session's pending permission
 */
export function getHITLRequest(sessionId: string): HITLRequest | null {
  for (const pending of state.pendingPermissions.values()) {
    if (pending.sessionId === sessionId) {
      return createHITLRequestFromEvent(pending.event)
    }
  }
  return null
}

// Export singleton-like interface
export const hookSocketServer = {
  start,
  stop,
  respondToPermission,
  respondToPermissionBySession,
  cancelPendingPermissions,
  cancelPendingPermission,
  hasPendingPermission,
  getPendingPermission,
  getHITLRequest,
  createHITLRequestFromEvent,
}
