/**
 * Shared Utilities for Agent Hook Scripts
 *
 * This file contains common utilities used across all agent hook scripts
 * (Claude, Cursor, Gemini). These are bundled with esbuild into each script.
 *
 * Note: Keep this file minimal and dependency-free to ensure bundle size
 * stays small for standalone hook scripts.
 */

import { execSync } from 'node:child_process'

// Re-export SOCKET_PATH from hook-types for convenience
export { SOCKET_PATH } from './hook-types'

/**
 * Question-asking tools that should be treated as "waiting for input"
 * rather than "waiting for approval" (permission request).
 *
 * Includes both PascalCase (Claude, Gemini) and snake_case (some MCP tools) variants.
 */
export const QUESTION_TOOLS = new Set([
  'AskUserQuestion',
  'AskFollowupQuestion',
  'ask_user_question',
  'ask_followup_question',
])

/**
 * Check if a tool name is a question-asking tool (case-insensitive)
 */
export function isQuestionTool(toolName: string | undefined): boolean {
  if (!toolName) return false
  // Direct match (fast path)
  if (QUESTION_TOOLS.has(toolName)) return true
  // Case-insensitive match (fallback)
  const lower = toolName.toLowerCase()
  return (
    lower === 'askuserquestion' ||
    lower === 'askfollowupquestion' ||
    lower === 'ask_user_question' ||
    lower === 'ask_followup_question'
  )
}

/**
 * Get the TTY device path for the parent process (the AI agent)
 *
 * @returns The TTY path (e.g., "/dev/ttys001") or undefined if not available
 */
export function getTty(): string | undefined {
  const ppid = process.ppid

  try {
    const result = execSync(`ps -p ${ppid} -o tty=`, {
      encoding: 'utf-8',
      timeout: 2000,
    }).trim()

    if (result && result !== '??' && result !== '-') {
      // ps returns just "ttys001", we need "/dev/ttys001"
      return result.startsWith('/dev/') ? result : `/dev/${result}`
    }
  } catch {
    // Ignore errors - TTY info is optional
  }

  return undefined
}

/**
 * Read JSON input from stdin
 *
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns Parsed JSON object
 * @throws Error if parsing fails or timeout occurs
 */
export async function readStdin<T>(timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = ''
    let timeoutId: NodeJS.Timeout | undefined

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        reject(new Error('Timeout reading stdin'))
      }, timeoutMs)
    }

    process.stdin.setEncoding('utf-8')

    process.stdin.on('data', chunk => {
      data += chunk
    })

    process.stdin.on('end', () => {
      if (timeoutId) clearTimeout(timeoutId)
      try {
        resolve(JSON.parse(data) as T)
      } catch {
        reject(new Error('Failed to parse JSON from stdin'))
      }
    })

    process.stdin.on('error', error => {
      if (timeoutId) clearTimeout(timeoutId)
      reject(error)
    })
  })
}

/**
 * Generate a deterministic tool use ID for agents without native IDs
 *
 * Uses time bucket (1-second granularity) for server-side correlation.
 *
 * @param agent - Agent type prefix (e.g., "gemini", "cursor")
 * @param sessionId - Session identifier
 * @param toolName - Tool being executed
 * @returns A deterministic tool use ID
 */
export function generateToolUseId(
  agent: string,
  sessionId: string,
  toolName: string
): string {
  const timeBucket = Math.floor(Date.now() / 1000)
  return `${agent}_${sessionId.slice(0, 8)}_${toolName}_${timeBucket}`
}
