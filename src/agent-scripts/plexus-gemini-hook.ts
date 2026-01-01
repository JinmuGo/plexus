/**
 * Plexus Hook for Gemini CLI
 *
 * This script is executed by Gemini CLI for various hook events.
 * It sends events to the Plexus app via Unix socket for tracking.
 *
 * Gemini CLI hooks documentation: https://geminicli.com/docs/hooks/
 */

import * as net from 'node:net'
import type { HookEvent, HookResponse, SessionStatus } from 'shared/hook-types'
import {
  SOCKET_PATH,
  isQuestionTool,
  getTty,
  readStdin,
  generateToolUseId,
} from 'shared/hook-utils'

// Gemini CLI hook event names
type GeminiHookEventName =
  | 'SessionStart'
  | 'SessionEnd'
  | 'BeforeAgent'
  | 'AfterAgent'
  | 'BeforeModel'
  | 'AfterModel'
  | 'BeforeToolSelection'
  | 'BeforeTool'
  | 'AfterTool'
  | 'PreCompress'
  | 'Notification'

// Gemini CLI hook input (from stdin)
interface GeminiHookInput {
  session_id: string
  transcript_path?: string
  cwd: string
  hook_event_name: GeminiHookEventName
  timestamp: string
  // BeforeTool/AfterTool
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_response?: string
  // BeforeAgent
  prompt?: string
  // Notification
  notification_type?: string
  message?: string
  details?: Record<string, unknown>
  // SessionStart
  source?: 'startup' | 'resume' | 'clear'
  // SessionEnd
  reason?: string
  // PreCompress
  trigger?: 'manual' | 'auto'
}

// Gemini CLI hook output
interface GeminiHookOutput {
  decision?: 'allow' | 'deny' | 'ask' | 'block'
  reason?: string
  systemMessage?: string
  hookSpecificOutput?: {
    hookEventName: string
    additionalContext?: string
  }
}

/**
 * Map Gemini hook event to internal status
 */
function mapEventToStatus(
  event: GeminiHookEventName,
  notificationType?: string
): SessionStatus | 'skip' {
  switch (event) {
    case 'SessionStart':
      return 'waiting_for_input'

    case 'SessionEnd':
      return 'ended'

    case 'BeforeAgent':
      // User submitted a prompt, agent is about to process
      return 'processing'

    case 'AfterAgent':
      // Agent finished processing, waiting for input
      return 'waiting_for_input'

    case 'BeforeModel':
    case 'BeforeToolSelection':
      // These are intermediate events, treat as processing
      return 'processing'

    case 'AfterModel':
      // Model finished responding - if no tool follows, this means ready
      // (BeforeTool will override this if tool execution follows)
      return 'waiting_for_input'

    case 'BeforeTool':
      return 'running_tool'

    case 'AfterTool':
      return 'processing'

    case 'PreCompress':
      return 'compacting'

    case 'Notification':
      // Check notification type for permission requests
      if (notificationType === 'ToolPermission') {
        return 'waiting_for_approval'
      }
      return 'waiting_for_input'

    default:
      return 'skip'
  }
}

/**
 * Map Gemini event name to Claude-compatible event name for internal processing
 */
function mapEventName(event: GeminiHookEventName): string {
  switch (event) {
    case 'BeforeTool':
      return 'PreToolUse'
    case 'AfterTool':
      return 'PostToolUse'
    case 'BeforeAgent':
      return 'UserPromptSubmit'
    case 'AfterAgent':
      return 'Stop'
    case 'PreCompress':
      return 'PreCompact'
    default:
      return event
  }
}

/**
 * Send event to Plexus app via Unix socket
 */
async function sendEvent(event: HookEvent): Promise<HookResponse | null> {
  return new Promise(resolve => {
    const socket = new net.Socket()

    socket.setTimeout(30000) // 30 second timeout

    socket.on('connect', () => {
      socket.write(JSON.stringify(event))
    })

    socket.on('data', data => {
      try {
        const response = JSON.parse(data.toString()) as HookResponse
        socket.destroy()
        resolve(response)
      } catch {
        socket.destroy()
        resolve(null)
      }
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve(null)
    })

    socket.on('error', () => {
      // Socket not available - Plexus app might not be running
      resolve(null)
    })

    socket.on('close', () => {
      resolve(null)
    })

    socket.connect(SOCKET_PATH)
  })
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  let input: GeminiHookInput

  try {
    input = await readStdin<GeminiHookInput>()
  } catch {
    process.exit(1)
  }

  let {
    session_id: sessionId,
    hook_event_name: event,
    cwd,
    tool_name: toolName,
    tool_input: toolInput,
    notification_type: notificationType,
    message,
    details,
    prompt,
  } = input

  // Extract tool info from details if not at top level (for Notification events)
  if (!toolName && details && typeof details.tool_name === 'string') {
    toolName = details.tool_name
  }
  if (!toolInput && details && typeof details.tool_input === 'object') {
    toolInput = details.tool_input as Record<string, unknown>
  }

  // Get process info
  const geminiPid = process.ppid
  const tty = getTty()

  // Map event to status
  const status = mapEventToStatus(event, notificationType)

  // Skip certain events
  if (status === 'skip') {
    process.exit(0)
  }

  // Map event name for internal consistency
  const mappedEvent = mapEventName(event)

  // Build event object
  const hookEvent: HookEvent = {
    sessionId,
    cwd,
    event: mappedEvent as HookEvent['event'],
    status,
    agent: 'gemini',
    pid: geminiPid,
    tty,
  }

  // Add tool info if present
  if (toolName) {
    hookEvent.tool = toolName
  }
  if (toolInput) {
    hookEvent.toolInput = toolInput
  }
  if (notificationType) {
    hookEvent.notificationType = notificationType
  }
  if (message) {
    hookEvent.message = message
  }

  // Capture user prompt for session title (BeforeAgent event)
  if (event === 'BeforeAgent' && prompt) {
    hookEvent.message = prompt.slice(0, 100)
  }

  // Fix #10: Generate deterministic toolUseId for server-side correlation
  // This applies to both PreToolUse and ToolPermission events
  if (
    (mappedEvent === 'PreToolUse' ||
      (event === 'Notification' && notificationType === 'ToolPermission')) &&
    !hookEvent.toolUseId &&
    toolName
  ) {
    hookEvent.toolUseId = generateToolUseId('gemini', sessionId, toolName)
  }

  // Handle permission requests (Notification with ToolPermission)
  if (event === 'Notification' && notificationType === 'ToolPermission') {
    // Question tools should NOT be handled as permission requests
    // Let Gemini CLI show its native question UI
    if (isQuestionTool(toolName)) {
      await sendEvent(hookEvent)
      // Exit without outputting anything - let Gemini CLI handle user interaction
      process.exit(0)
    }

    const response = await sendEvent(hookEvent)

    if (response) {
      const { decision, reason } = response

      if (decision === 'allow') {
        const output: GeminiHookOutput = {
          decision: 'allow',
          systemMessage: 'Approved by Plexus',
        }
        console.log(JSON.stringify(output))
        process.exit(0)
      } else if (decision === 'deny') {
        const output: GeminiHookOutput = {
          decision: 'deny',
          reason: reason || 'Denied by user via Plexus',
        }
        console.log(JSON.stringify(output))
        process.exit(0)
      } else if (decision === 'ask') {
        // Let Gemini CLI show its native UI
        const output: GeminiHookOutput = {
          decision: 'ask',
        }
        console.log(JSON.stringify(output))
        process.exit(0)
      } else if (decision === 'block') {
        // Permanently block this tool (Gemini-specific)
        const output: GeminiHookOutput = {
          decision: 'block',
          reason: reason || 'Blocked by user via Plexus',
        }
        console.log(JSON.stringify(output))
        process.exit(0)
      }
    }

    // No response - let Gemini CLI show its normal UI
    process.exit(0)
  }

  // Fire and forget for non-permission events
  await sendEvent(hookEvent)
  process.exit(0)
}

// Run
main().catch(() => {
  process.exit(1)
})
