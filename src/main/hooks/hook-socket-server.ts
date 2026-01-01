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
 * Socket server state
 */
interface ServerState {
  server: net.Server | null
  eventHandler: HookEventHandler | null
  permissionFailureHandler: PermissionFailureHandler | null
  pendingPermissions: Map<string, PendingPermission>
  toolUseIdCache: Map<string, string[]>
  clientCounter: number
}

const state: ServerState = {
  server: null,
  eventHandler: null,
  permissionFailureHandler: null,
  pendingPermissions: new Map(),
  toolUseIdCache: new Map(),
  clientCounter: 0,
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
 * Cache tool_use_id from PreToolUse event
 */
function cacheToolUseId(event: HookEvent): void {
  if (!event.toolUseId) return

  const key = generateCacheKey(event.sessionId, event.tool, event.toolInput)
  const queue = state.toolUseIdCache.get(key) || []
  queue.push(event.toolUseId)
  state.toolUseIdCache.set(key, queue)

  console.log(
    `[HookSocket] Cached tool_use_id for ${event.sessionId.slice(0, 8)} tool:${event.tool} id:${event.toolUseId.slice(0, 12)}`
  )
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
        console.log(
          `[HookSocket] Socket closed for pending permission ${pending.sessionId.slice(0, 8)} tool:${toolUseId.slice(0, 12)}`
        )
        state.pendingPermissions.delete(toolUseId)
        state.permissionFailureHandler?.(pending.sessionId, toolUseId)
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

    if (!toolUseId) {
      console.warn(
        `[HookSocket] Permission request missing tool_use_id for ${event.sessionId.slice(0, 8)} - no cache hit`
      )
      socket.end()
      state.eventHandler?.(event)
      return
    }

    console.log(
      `[HookSocket] Permission request - keeping socket open for ${event.sessionId.slice(0, 8)} tool:${toolUseId.slice(0, 12)}`
    )

    // Update event with resolved toolUseId
    const updatedEvent: HookEvent = { ...event, toolUseId }

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

    // Notify handler
    state.eventHandler?.(updatedEvent)
    return
  }

  // Fire and forget for non-permission events
  socket.end()
  state.eventHandler?.(event)
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
}

/**
 * Stop the socket server
 */
export function stop(): void {
  if (!state.server) {
    return
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
