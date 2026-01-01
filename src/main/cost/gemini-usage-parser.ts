/**
 * Gemini Usage Parser
 *
 * Parses Gemini CLI JSON session files to extract token usage data.
 * Extracts input/output tokens, cached tokens, thoughts, and tool usage.
 *
 * JSON Location: ~/.gemini/tmp/{uuid}/chats/session-{id}.json
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { ParsedUsage } from 'shared/cost-types'

// ============================================================================
// Types for Gemini CLI Session Structure
// ============================================================================

interface GeminiTokenUsage {
  input: number
  output: number
  cached?: number
  thoughts?: number
  tool?: number
  total?: number
}

interface GeminiSessionEntry {
  type: string
  model?: string
  tokens?: GeminiTokenUsage
  timestamp?: string
  [key: string]: unknown
}

interface GeminiSessionFile {
  entries?: GeminiSessionEntry[]
  messages?: GeminiSessionEntry[]
  [key: string]: unknown
}

// ============================================================================
// Path Discovery Functions
// ============================================================================

/**
 * Get the Gemini CLI data directory
 */
export function getGeminiDataDir(): string {
  return join(homedir(), '.gemini', 'tmp')
}

/**
 * Discover all Gemini session files
 * Returns paths to session JSON files
 */
export function discoverGeminiSessions(): string[] {
  const dataDir = getGeminiDataDir()

  if (!existsSync(dataDir)) {
    return []
  }

  const sessionFiles: string[] = []

  try {
    // List subdirectories in ~/.gemini/tmp/
    const subdirs = readdirSync(dataDir, { withFileTypes: true })

    for (const subdir of subdirs) {
      if (!subdir.isDirectory()) continue

      const chatsDir = join(dataDir, subdir.name, 'chats')
      if (!existsSync(chatsDir)) continue

      // Find session-*.json files
      const chatFiles = readdirSync(chatsDir, { withFileTypes: true })
      for (const file of chatFiles) {
        if (
          file.isFile() &&
          file.name.startsWith('session-') &&
          file.name.endsWith('.json')
        ) {
          sessionFiles.push(join(chatsDir, file.name))
        }
      }
    }
  } catch {
    // Directory access error
  }

  return sessionFiles
}

/**
 * Get session file path for a specific session ID
 */
export function getGeminiSessionPath(sessionId: string): string | null {
  const allSessions = discoverGeminiSessions()

  for (const path of allSessions) {
    if (path.includes(sessionId)) {
      return path
    }
  }

  return null
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse a single Gemini session JSON file
 *
 * @param jsonPath - Full path to the session JSON file
 * @returns Array of parsed usage records
 */
export function parseGeminiSession(jsonPath: string): ParsedUsage[] {
  const usages: ParsedUsage[] = []

  if (!existsSync(jsonPath)) {
    return usages
  }

  try {
    const content = readFileSync(jsonPath, 'utf-8')
    const session = JSON.parse(content) as GeminiSessionFile

    // Handle different possible structures
    const entries = session.entries || session.messages || []

    // If the file itself has token data at the root level
    if ('tokens' in session && session.tokens) {
      const tokens = session.tokens as GeminiTokenUsage
      usages.push({
        inputTokens: tokens.input || 0,
        outputTokens: tokens.output || 0,
        cacheCreationTokens: 0, // Gemini doesn't have cache creation
        cacheReadTokens: tokens.cached || 0,
        thoughtTokens: tokens.thoughts || 0,
        toolTokens: tokens.tool || 0,
        model: (session.model as string) || 'gemini-unknown',
        timestamp: session.timestamp
          ? new Date(session.timestamp as string).getTime()
          : Date.now(),
      })
    }

    // Parse individual entries
    for (const entry of entries) {
      if (entry.tokens) {
        const timestamp = entry.timestamp
          ? new Date(entry.timestamp).getTime()
          : Date.now()

        usages.push({
          inputTokens: entry.tokens.input || 0,
          outputTokens: entry.tokens.output || 0,
          cacheCreationTokens: 0, // Gemini doesn't have cache creation
          cacheReadTokens: entry.tokens.cached || 0,
          thoughtTokens: entry.tokens.thoughts || 0,
          toolTokens: entry.tokens.tool || 0,
          model: entry.model || 'gemini-unknown',
          timestamp,
        })
      }
    }
  } catch {
    // JSON parse error or file read error
  }

  return usages
}

/**
 * Parse multiple Gemini session files
 *
 * @param jsonPaths - Array of session file paths
 * @returns Map of file path to usage records
 */
export function parseGeminiSessions(
  jsonPaths: string[]
): Map<string, ParsedUsage[]> {
  const results = new Map<string, ParsedUsage[]>()

  for (const path of jsonPaths) {
    const usages = parseGeminiSession(path)
    results.set(path, usages)
  }

  return results
}

/**
 * Aggregate Gemini usage records into a single summary
 *
 * @param usages - Array of parsed usage records
 * @returns Aggregated usage totals
 */
export function aggregateGeminiUsage(usages: ParsedUsage[]): {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalThoughtTokens: number
  totalToolTokens: number
  messageCount: number
  primaryModel: string
} {
  if (usages.length === 0) {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalThoughtTokens: 0,
      totalToolTokens: 0,
      messageCount: 0,
      primaryModel: 'unknown',
    }
  }

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let totalThoughtTokens = 0
  let totalToolTokens = 0
  const modelCounts = new Map<string, number>()

  for (const usage of usages) {
    totalInputTokens += usage.inputTokens
    totalOutputTokens += usage.outputTokens
    totalCacheReadTokens += usage.cacheReadTokens
    totalThoughtTokens += usage.thoughtTokens || 0
    totalToolTokens += usage.toolTokens || 0

    const count = modelCounts.get(usage.model) || 0
    modelCounts.set(usage.model, count + 1)
  }

  // Find the most used model
  let primaryModel = 'unknown'
  let maxCount = 0
  for (const [model, count] of modelCounts) {
    if (count > maxCount) {
      maxCount = count
      primaryModel = model
    }
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalThoughtTokens,
    totalToolTokens,
    messageCount: usages.length,
    primaryModel,
  }
}

/**
 * Discover and parse all Gemini sessions within a time range
 *
 * @param startTime - Start timestamp (ms)
 * @param endTime - End timestamp (ms)
 * @returns Array of all usage records within the time range
 */
export function getGeminiUsageInRange(
  startTime: number,
  endTime: number
): ParsedUsage[] {
  const allSessions = discoverGeminiSessions()
  const allUsages: ParsedUsage[] = []

  for (const path of allSessions) {
    const usages = parseGeminiSession(path)
    for (const usage of usages) {
      if (usage.timestamp >= startTime && usage.timestamp <= endTime) {
        allUsages.push(usage)
      }
    }
  }

  return allUsages
}
