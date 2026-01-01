#!/usr/bin/env node
/**
 * Plexus Cursor Hook Script
 *
 * This script is installed to ~/.cursor/hooks/plexus-cursor-hook.js
 * and is invoked by Cursor IDE on various Agent hook events.
 *
 * It sends session state to the Plexus app via Unix socket
 * and handles permission requests by waiting for user decisions.
 */

import * as net from 'node:net'
import * as fs from 'node:fs'
import {
  SOCKET_PATH,
  isQuestionTool,
  getTty,
  readStdin,
} from 'shared/hook-utils'

// Constants
const DEBUG_LOG_PATH = '/tmp/plexus-cursor-hook.log'
const PERMISSION_TIMEOUT_MS = 30000 // 30 seconds (shorter for Cursor responsiveness)
const DEBUG =
  process.env.PLEXUS_DEBUG === 'true' || process.env.PLEXUS_DEBUG === '1'

/**
 * Debug log to file and stderr (file is more reliable when Cursor kills the process)
 */
function debug(message: string): void {
  if (DEBUG) {
    const timestamp = new Date().toISOString().slice(11, 23)
    const line = `[CursorHook ${timestamp}] ${message}\n`
    process.stderr.write(line)
    try {
      fs.appendFileSync(DEBUG_LOG_PATH, line)
    } catch {
      // Ignore file write errors
    }
  }
}

// Types (duplicated here to avoid import issues in standalone script)
interface CursorHookInput {
  conversation_id: string
  generation_id: string
  model: string
  hook_event_name: string
  cursor_version: string
  workspace_roots: string[]
  user_email: string | null
  // Event-specific fields
  command?: string
  cwd?: string
  output?: string
  duration?: number
  tool_name?: string
  parameters?: Record<string, unknown>
  tool_input?: string
  result_json?: string
  url?: string
  file_path?: string
  content?: string
  edits?: Array<{
    old_string: string
    new_string: string
  }>
  prompt?: string
  attachments?: Array<{
    type: string
    filePath?: string
  }>
  text?: string
  duration_ms?: number
  status?: 'completed' | 'aborted' | 'error'
  loop_count?: number
}

interface HookEvent {
  sessionId: string
  cwd: string
  event: string
  status: string
  agent: 'cursor'
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
}

interface CursorHookOutput {
  permission?: 'allow' | 'deny' | 'ask'
  user_message?: string
  agent_message?: string
  continue?: boolean
  followup_message?: string
}

/**
 * Extract working directory from Cursor input
 */
function extractCwd(input: CursorHookInput): string {
  // Priority: explicit cwd > first workspace root > empty string
  if (input.cwd) return input.cwd
  if (input.workspace_roots?.[0]) return input.workspace_roots[0]
  return ''
}

/**
 * Map Cursor event to internal SessionStatus
 */
function mapEventToStatus(eventName: string, input: CursorHookInput): string {
  switch (eventName) {
    case 'beforeSubmitPrompt':
      return 'processing'

    case 'afterAgentThought':
      return 'processing'

    case 'afterAgentResponse':
      return 'waiting_for_input'

    case 'beforeShellExecution':
      // Will request permission from user
      return 'waiting_for_approval'

    case 'beforeMCPExecution':
      // Check if this is a question-asking tool
      if (isQuestionTool(input.tool_name)) {
        return 'waiting_for_input'
      }
      // Will request permission from user
      return 'waiting_for_approval'

    case 'afterShellExecution':
    case 'afterMCPExecution':
    case 'afterFileEdit':
      return 'processing'

    case 'beforeReadFile':
      return 'running_tool'

    case 'stop':
      // Fix #9: Distinguish error status from normal end
      if (input.status === 'error') {
        return 'error'
      }
      // completed, aborted treated as session end
      // Session will be reactivated when new events arrive
      return 'ended'

    default:
      return 'processing'
  }
}

/**
 * Map Cursor event to Claude-compatible event name
 */
function mapEventName(eventName: string): string {
  switch (eventName) {
    case 'beforeShellExecution':
    case 'beforeMCPExecution':
    case 'beforeReadFile':
      return 'PreToolUse'

    case 'afterShellExecution':
    case 'afterMCPExecution':
    case 'afterFileEdit':
      return 'PostToolUse'

    case 'beforeSubmitPrompt':
      return 'UserPromptSubmit'

    case 'afterAgentResponse':
      return 'Stop'

    case 'afterAgentThought':
      return 'PostToolUse' // Agent thinking completed, continue processing

    case 'stop':
      return 'SessionEnd'

    default:
      return eventName
  }
}

/**
 * Extract tool information from Cursor input
 */
function extractToolInfo(input: CursorHookInput): {
  tool?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
} {
  const eventName = input.hook_event_name

  switch (eventName) {
    case 'beforeShellExecution':
    case 'afterShellExecution':
      return {
        tool: 'Bash',
        toolInput: input.command ? { command: input.command } : undefined,
        toolUseId: `${input.conversation_id}-shell-${Date.now()}`,
      }

    case 'beforeMCPExecution':
    case 'afterMCPExecution':
      return {
        tool: input.tool_name || 'MCP',
        toolInput: input.parameters,
        toolUseId: `${input.conversation_id}-mcp-${Date.now()}`,
      }

    case 'beforeReadFile':
      return {
        tool: 'Read',
        toolInput: input.file_path ? { file_path: input.file_path } : undefined,
        toolUseId: `${input.conversation_id}-read-${Date.now()}`,
      }

    case 'afterFileEdit':
      return {
        tool: 'Edit',
        toolInput: input.file_path ? { file_path: input.file_path } : undefined,
        toolUseId: `${input.conversation_id}-edit-${Date.now()}`,
      }

    default:
      return {}
  }
}

/**
 * Send event to the Plexus app via Unix socket
 * Returns the response for permission requests, or undefined for fire-and-forget events
 */
async function sendEvent(
  event: HookEvent,
  waitForResponse = false
): Promise<HookResponse | undefined> {
  const startTime = Date.now()
  debug(`sendEvent: ${event.event} waitForResponse=${waitForResponse}`)

  return new Promise((resolve, _reject) => {
    const client = net.connect(SOCKET_PATH)
    let responseData = ''
    let timeout: NodeJS.Timeout | undefined
    let resolved = false

    const resolveOnce = (
      result: HookResponse | undefined,
      reason: string
    ): void => {
      if (resolved) {
        debug(`sendEvent: already resolved, ignoring ${reason}`)
        return
      }
      resolved = true
      const elapsed = Date.now() - startTime
      debug(
        `sendEvent: resolved via ${reason} after ${elapsed}ms, result=${JSON.stringify(result)}`
      )
      if (timeout) clearTimeout(timeout)
      resolve(result)
    }

    // Set timeout for permission requests
    if (waitForResponse) {
      debug(`sendEvent: setting ${PERMISSION_TIMEOUT_MS}ms timeout`)
      timeout = setTimeout(() => {
        debug(`sendEvent: timeout fired after ${PERMISSION_TIMEOUT_MS}ms`)
        client.destroy()
        resolveOnce({ decision: 'ask' }, 'timeout')
      }, PERMISSION_TIMEOUT_MS)
    }

    client.on('connect', () => {
      debug(`sendEvent: connected to socket`)
      // Send JSON event
      client.write(JSON.stringify(event))
      client.write('\n')

      if (!waitForResponse) {
        // Fire-and-forget: close immediately
        debug(`sendEvent: fire-and-forget, closing socket`)
        client.end()
      } else {
        debug(`sendEvent: waiting for response...`)
      }
    })

    client.on('data', data => {
      responseData += data.toString()
      debug(`sendEvent: received data: ${responseData.slice(0, 100)}`)

      // Check if we have a complete JSON response
      if (responseData.includes('\n') || responseData.includes('}')) {
        try {
          const response = JSON.parse(responseData.trim()) as HookResponse
          debug(`sendEvent: parsed response: ${JSON.stringify(response)}`)
          client.end()
          resolveOnce(response, 'data')
        } catch {
          debug(`sendEvent: incomplete JSON, waiting for more data`)
        }
      }
    })

    client.on('end', () => {
      debug(
        `sendEvent: socket ended, responseData=${responseData.slice(0, 100)}`
      )
      if (!waitForResponse) {
        resolveOnce(undefined, 'end-fire-and-forget')
      } else if (responseData) {
        try {
          const response = JSON.parse(responseData.trim()) as HookResponse
          resolveOnce(response, 'end-with-data')
        } catch {
          resolveOnce({ decision: 'ask' }, 'end-parse-error')
        }
      } else {
        resolveOnce({ decision: 'ask' }, 'end-no-data')
      }
    })

    client.on('error', error => {
      debug(`sendEvent: socket error: ${error.message}`)
      resolveOnce(waitForResponse ? { decision: 'ask' } : undefined, 'error')
    })

    client.on('close', hadError => {
      debug(`sendEvent: socket closed, hadError=${hadError}`)
    })
  })
}

/**
 * Handle permission request events
 */
async function handlePermissionRequest(input: CursorHookInput): Promise<void> {
  debug(`handlePermissionRequest: ${input.hook_event_name}`)
  const startTime = Date.now()

  const cwd = extractCwd(input)
  const status = mapEventToStatus(input.hook_event_name, input)
  const eventName = mapEventName(input.hook_event_name)
  const toolInfo = extractToolInfo(input)

  const hookEvent: HookEvent = {
    sessionId: input.conversation_id,
    cwd,
    event: eventName,
    status,
    agent: 'cursor',
    pid: process.ppid,
    tty: getTty(),
    ...toolInfo,
  }

  debug(
    `handlePermissionRequest: sending event ${eventName} for ${input.conversation_id.slice(0, 8)} pid=${process.ppid}`
  )

  // Send event and wait for response
  const response = await sendEvent(hookEvent, true)

  const elapsed = Date.now() - startTime
  debug(
    `handlePermissionRequest: got response after ${elapsed}ms: ${JSON.stringify(response)}`
  )

  // Return output to Cursor
  const output: CursorHookOutput = {}

  if (response?.decision === 'allow') {
    output.permission = 'allow'
    debug('handlePermissionRequest: returning permission=allow')
  } else if (response?.decision === 'deny') {
    output.permission = 'deny'
    output.user_message = response.reason || 'Denied by Plexus'
    debug('handlePermissionRequest: returning permission=deny')
  } else {
    // No response or ask - let Cursor show its default permission UI
    output.permission = 'ask'
    debug('handlePermissionRequest: returning permission=ask (fallback)')
  }

  console.log(JSON.stringify(output))
  debug('handlePermissionRequest: done')
}

/**
 * Handle fire-and-forget events
 */
async function handleFireAndForget(input: CursorHookInput): Promise<void> {
  const cwd = extractCwd(input)
  const status = mapEventToStatus(input.hook_event_name, input)
  const eventName = mapEventName(input.hook_event_name)
  const toolInfo = extractToolInfo(input)

  const hookEvent: HookEvent = {
    sessionId: input.conversation_id,
    cwd,
    event: eventName,
    status,
    agent: 'cursor',
    pid: process.ppid,
    tty: getTty(),
    ...toolInfo,
  }

  // Capture user prompt for session title
  if (input.hook_event_name === 'beforeSubmitPrompt' && input.prompt) {
    hookEvent.message = input.prompt.slice(0, 100)
  }

  // Send event without waiting for response
  await sendEvent(hookEvent, false)

  // For most events, no output is needed
  // Cursor will continue normally
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  debug('main: started')
  let input: CursorHookInput

  try {
    input = await readStdin<CursorHookInput>()
    debug(`main: received input for ${input.hook_event_name}`)
  } catch (error) {
    debug(`main: failed to read stdin: ${error}`)
    process.exit(1)
  }

  const eventName = input.hook_event_name

  // Question tools from MCP should be fire-and-forget (not permission requests)
  const isQuestionMCPTool =
    eventName === 'beforeMCPExecution' && isQuestionTool(input.tool_name)

  // Determine if this event requires permission handling
  const needsPermission =
    eventName === 'beforeShellExecution' ||
    (eventName === 'beforeMCPExecution' && !isQuestionMCPTool)

  debug(
    `main: needsPermission=${needsPermission}, isQuestionMCPTool=${isQuestionMCPTool}`
  )

  try {
    if (needsPermission) {
      await handlePermissionRequest(input)
    } else {
      await handleFireAndForget(input)
    }
    debug('main: exiting successfully')
    process.exit(0)
  } catch (error) {
    debug(`main: error: ${error}`)
    // Error: fail silently, don't block Cursor
    if (needsPermission) {
      // For permission requests, return 'ask' so Cursor shows its UI
      console.log(JSON.stringify({ permission: 'ask' }))
    }
    process.exit(0)
  }
}

main()
