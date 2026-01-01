/**
 * HITL (Human-in-the-Loop) Types
 * Unified type system for permission requests across AI agents (Claude, Gemini, Cursor)
 */

import type { AgentType } from './hook-types'

/**
 * HITL Request Kind - Categorizes the type of human input needed
 */
export type HITLRequestKind =
  | 'permission' // Tool execution approval (allow/deny)
  | 'permission_ask' // User confirmation request (ask mode)

/**
 * Unified HITL Request - Can represent permission requests from any agent
 */
export interface HITLRequest {
  // Identity
  id: string
  sessionId: string
  agent: AgentType

  // Request type
  kind: HITLRequestKind

  // Tool context
  toolName: string
  toolInput?: Record<string, unknown>
  toolUseId?: string

  // Display information
  title: string
  message: string
  timestamp: number

  // Original event name (for debugging/logging)
  originalEvent?: string
}

/**
 * Unified HITL Response - Sent back to the agent
 */
export interface HITLResponse {
  // Core decision
  decision: 'allow' | 'deny'
  reason?: string

  // Claude-specific: Modify tool input before execution
  updatedInput?: Record<string, unknown>

  // Cursor-specific: Message sent to the agent
  agentMessage?: string
}

/**
 * Create an HITL request ID
 */
export function createHITLRequestId(
  sessionId: string,
  toolUseId?: string
): string {
  const timestamp = Date.now()
  const suffix = toolUseId
    ? toolUseId.slice(-8)
    : Math.random().toString(36).slice(2, 10)
  return `hitl-${sessionId.slice(0, 8)}-${suffix}-${timestamp}`
}

/**
 * Helper to create HITL request title from tool context
 */
export function createHITLTitle(toolName: string, agent: AgentType): string {
  const agentLabel = agent.charAt(0).toUpperCase() + agent.slice(1)
  return `${agentLabel}: ${toolName}`
}

/**
 * Helper to create HITL request message from tool input
 */
export function createHITLMessage(
  toolName: string,
  toolInput?: Record<string, unknown>
): string {
  if (!toolInput) {
    return `Execute ${toolName}?`
  }

  // Handle common tool types
  switch (toolName.toLowerCase()) {
    case 'bash':
    case 'shell':
      return toolInput.command
        ? `Run command: ${String(toolInput.command).slice(0, 200)}`
        : `Execute shell command?`

    case 'edit':
      return toolInput.file_path
        ? `Edit file: ${String(toolInput.file_path)}`
        : 'Edit file?'

    case 'write':
      return toolInput.file_path
        ? `Write to: ${String(toolInput.file_path)}`
        : 'Write file?'

    case 'read':
      return toolInput.file_path
        ? `Read file: ${String(toolInput.file_path)}`
        : 'Read file?'

    default: {
      // For MCP tools or others, show tool name and first input key
      const firstKey = Object.keys(toolInput)[0]
      if (firstKey) {
        const value = String(toolInput[firstKey]).slice(0, 100)
        return `${toolName}: ${firstKey}=${value}`
      }
      return `Execute ${toolName}?`
    }
  }
}
