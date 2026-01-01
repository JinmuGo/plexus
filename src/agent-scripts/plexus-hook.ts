#!/usr/bin/env node
/**
 * Plexus Hook Script
 *
 * This script is installed to ~/.claude/hooks/plexus-hook.js
 * and is invoked by Claude Code on various hook events.
 *
 * It sends session state to the Plexus app via Unix socket
 * and handles permission requests by waiting for user decisions.
 */

import * as net from 'node:net'
import {
  SOCKET_PATH,
  isQuestionTool,
  getTty,
  readStdin,
} from 'shared/hook-utils'

// Constants
const PERMISSION_TIMEOUT_MS = 300000 // 5 minutes

// Types (duplicated here to avoid import issues in standalone script)
interface HookInput {
  session_id: string
  hook_event_name: string
  cwd: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_use_id?: string
  notification_type?: string
  message?: string
}

interface HookEvent {
  sessionId: string
  cwd: string
  event: string
  status: string
  agent: 'claude' | 'gemini' | 'cursor'
  pid?: number
  tty?: string
  tool?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  notificationType?: string
  message?: string
}

interface HookResponse {
  decision: 'allow' | 'deny' | 'ask'
  reason?: string
  // Claude-specific extended options
  updatedInput?: Record<string, unknown>
  interrupt?: boolean
}

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest'
    decision: {
      behavior: 'allow' | 'deny'
      message?: string
      // Claude-specific: modify input before execution
      updatedInput?: Record<string, unknown>
      // Claude-specific: stop agent on deny
      interrupt?: boolean
    }
  }
}

/**
 * Send event to the Plexus app via Unix socket
 * Returns the response for permission requests, or undefined for fire-and-forget events
 */
async function sendEvent(event: HookEvent): Promise<HookResponse | undefined> {
  return new Promise(resolve => {
    const socket = new net.Socket()
    let resolved = false

    const cleanup = () => {
      if (!resolved) {
        resolved = true
        socket.destroy()
        resolve(undefined)
      }
    }

    // Set timeout
    socket.setTimeout(PERMISSION_TIMEOUT_MS)

    socket.on('timeout', cleanup)
    socket.on('error', cleanup)

    socket.connect(SOCKET_PATH, () => {
      // Send the event
      socket.write(JSON.stringify(event))

      // For permission requests, wait for response
      if (event.status === 'waiting_for_approval') {
        socket.once('data', data => {
          try {
            const response = JSON.parse(data.toString()) as HookResponse
            resolved = true
            socket.end()
            resolve(response)
          } catch {
            cleanup()
          }
        })
      } else {
        // Fire and forget
        resolved = true
        socket.end()
        resolve(undefined)
      }
    })
  })
}

/**
 * Map hook event to status
 */
function mapEventToStatus(
  event: string,
  notificationType?: string,
  toolName?: string
): string {
  switch (event) {
    case 'UserPromptSubmit':
      return 'processing'
    case 'PreToolUse':
      return 'running_tool'
    case 'PostToolUse':
      return 'processing'
    case 'PermissionRequest':
      // Question tools should be treated as waiting for input, not approval
      if (isQuestionTool(toolName)) {
        return 'waiting_for_input'
      }
      return 'waiting_for_approval'
    case 'Notification':
      // Skip permission_prompt - PermissionRequest hook handles this with better info
      if (notificationType === 'permission_prompt') {
        return 'skip'
      }
      if (notificationType === 'idle_prompt') {
        return 'waiting_for_input'
      }
      return 'notification'
    case 'Stop':
    case 'SubagentStop':
    case 'SessionStart':
      return 'waiting_for_input'
    case 'SessionEnd':
      return 'ended'
    case 'PreCompact':
      return 'compacting'
    default:
      return 'unknown'
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  let input: HookInput

  try {
    // No timeout for Claude Code hooks (permission requests can wait indefinitely)
    input = await readStdin<HookInput>(0)
  } catch {
    process.exit(1)
  }

  const {
    session_id: sessionId,
    hook_event_name: event,
    cwd,
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: toolUseId,
    notification_type: notificationType,
    message,
  } = input

  // Get process info
  const claudePid = process.ppid
  const tty = getTty()

  // Map event to status (pass toolName for question tool detection)
  const status = mapEventToStatus(event, notificationType, toolName)

  // Skip certain events
  if (status === 'skip') {
    process.exit(0)
  }

  // Check if this is a question tool (should be fire-and-forget, not permission request)
  const isQuestion = event === 'PermissionRequest' && isQuestionTool(toolName)

  // Build event object
  const hookEvent: HookEvent = {
    sessionId,
    cwd,
    event,
    status,
    agent: 'claude',
    pid: claudePid,
    tty,
  }

  // Add tool info if present
  if (toolName) {
    hookEvent.tool = toolName
  }
  if (toolInput) {
    hookEvent.toolInput = toolInput
  }
  if (toolUseId) {
    hookEvent.toolUseId = toolUseId
  }
  if (notificationType) {
    hookEvent.notificationType = notificationType
  }
  if (message) {
    hookEvent.message = message
  }

  // Handle permission requests specially (but not question tools)
  if (event === 'PermissionRequest' && !isQuestion) {
    const response = await sendEvent(hookEvent)

    if (response) {
      const { decision, reason, updatedInput, interrupt } = response

      if (decision === 'allow') {
        const output: HookOutput = {
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: {
              behavior: 'allow',
              // Include updatedInput if provided (modify input before execution)
              ...(updatedInput && { updatedInput }),
            },
          },
        }
        console.log(JSON.stringify(output))
        process.exit(0)
      } else if (decision === 'deny') {
        const output: HookOutput = {
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: {
              behavior: 'deny',
              message: reason || 'Denied by user via Plexus',
              // Include interrupt if true (stop agent entirely)
              ...(interrupt && { interrupt: true }),
            },
          },
        }
        console.log(JSON.stringify(output))
        process.exit(0)
      }
    }

    // No response or "ask" - let Claude Code show its normal UI
    process.exit(0)
  }

  // Question tools: send event but DON'T output a decision
  // By not outputting anything, Claude Code will show its native question UI
  // and wait for the user's actual response
  if (isQuestion) {
    await sendEvent(hookEvent)
    // Exit without outputting anything - let Claude Code handle user interaction
    process.exit(0)
  }

  // Fire and forget for non-permission events
  await sendEvent(hookEvent)
}

main().catch(() => {
  process.exit(1)
})
