/**
 * Session Title Extractor
 *
 * Computes meaningful display titles for sessions based on available sources.
 * Priority: AI summary > first user prompt > project name > cwd basename
 */

import { jsonlParser, type ConversationInfo } from '../watchers/jsonl-parser'

/**
 * Result of session title extraction
 */
export interface SessionTitleResult {
  displayTitle: string
  sessionSummary?: string
  firstUserPrompt?: string
}

/**
 * Truncate a title string for display
 */
function truncateTitle(title: string, maxLength: number): string {
  const cleaned = title.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ')
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength - 3)}...`
}

/**
 * Get display title from cwd (last directory name)
 */
function getDisplayTitleFromCwd(cwd: string): string {
  const parts = cwd.split('/')
  return parts[parts.length - 1] || cwd
}

/**
 * Compute display title from available sources
 *
 * Priority:
 * 1. sessionSummary - AI-generated summary (most descriptive)
 * 2. firstUserPrompt - First user message (shows user intent)
 * 3. projectName - Detected project name
 * 4. cwd basename - Last resort fallback
 */
export function computeDisplayTitle(
  sessionSummary?: string,
  firstUserPrompt?: string,
  projectName?: string,
  cwd?: string
): string {
  // Priority 1: AI-generated summary
  if (sessionSummary) {
    return truncateTitle(sessionSummary, 60)
  }

  // Priority 2: First user prompt
  if (firstUserPrompt) {
    return truncateTitle(firstUserPrompt, 60)
  }

  // Priority 3: Project name
  if (projectName) {
    return projectName
  }

  // Priority 4: CWD basename
  if (cwd) {
    return getDisplayTitleFromCwd(cwd)
  }

  return 'Session'
}

/**
 * Extract session title from Claude Code JSONL file
 *
 * This function uses the existing jsonlParser to extract summary and
 * firstUserMessage from the JSONL file, then computes an appropriate
 * display title.
 */
export function extractClaudeTitle(
  sessionId: string,
  cwd: string,
  projectName?: string
): SessionTitleResult {
  // Use existing jsonlParser which already extracts summary and firstUserMessage
  const info: ConversationInfo = jsonlParser.parse(sessionId, cwd)

  return {
    displayTitle: computeDisplayTitle(
      info.summary,
      info.firstUserMessage,
      projectName,
      cwd
    ),
    sessionSummary: info.summary,
    firstUserPrompt: info.firstUserMessage,
  }
}

/**
 * Check if session has a meaningful title (not just project/cwd based)
 */
export function hasMeaningfulTitle(
  sessionSummary?: string,
  firstUserPrompt?: string
): boolean {
  return !!(sessionSummary || firstUserPrompt)
}
