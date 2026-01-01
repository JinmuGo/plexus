/**
 * Claude Usage Parser
 *
 * Parses Claude Code JSONL files to extract token usage data.
 * Extracts input/output tokens, cache metrics, and model info from assistant messages.
 *
 * JSONL Location: ~/.claude/projects/{encoded-cwd}/{sessionId}.jsonl
 */

import { createReadStream, existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import type { ParsedUsage } from 'shared/cost-types'

// ============================================================================
// Types for Claude Code JSONL Structure
// ============================================================================

interface ClaudeUsageData {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface ClaudeAssistantEntry {
  type: 'assistant'
  uuid: string
  timestamp: string
  message: {
    role: 'assistant'
    model?: string
    usage?: ClaudeUsageData
    content: unknown[]
  }
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Check if an entry is an assistant message with usage data
 */
function isAssistantWithUsage(entry: unknown): entry is ClaudeAssistantEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const obj = entry as Record<string, unknown>
  return (
    obj.type === 'assistant' &&
    typeof obj.message === 'object' &&
    obj.message !== null &&
    'usage' in (obj.message as Record<string, unknown>)
  )
}

/**
 * Parse a single Claude JSONL file and extract all usage records
 *
 * @param jsonlPath - Full path to the JSONL file
 * @returns Array of parsed usage records
 */
export async function parseClaudeSession(
  jsonlPath: string
): Promise<ParsedUsage[]> {
  const usages: ParsedUsage[] = []

  if (!existsSync(jsonlPath)) {
    return usages
  }

  const fileStream = createReadStream(jsonlPath, { encoding: 'utf-8' })
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  for await (const line of rl) {
    try {
      const entry: unknown = JSON.parse(line)

      if (isAssistantWithUsage(entry)) {
        const usage = entry.message.usage
        if (!usage) continue

        usages.push({
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cacheCreationTokens: usage.cache_creation_input_tokens || 0,
          cacheReadTokens: usage.cache_read_input_tokens || 0,
          model: entry.message.model || 'unknown',
          timestamp: new Date(entry.timestamp).getTime(),
        })
      }
    } catch {
      // Skip malformed lines
    }
  }

  return usages
}

/**
 * Aggregate usage records into a single summary
 *
 * @param usages - Array of parsed usage records
 * @returns Aggregated usage totals
 */
export function aggregateClaudeUsage(usages: ParsedUsage[]): {
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  messageCount: number
  primaryModel: string
} {
  if (usages.length === 0) {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      messageCount: 0,
      primaryModel: 'unknown',
    }
  }

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheCreationTokens = 0
  let totalCacheReadTokens = 0
  const modelCounts = new Map<string, number>()

  for (const usage of usages) {
    totalInputTokens += usage.inputTokens
    totalOutputTokens += usage.outputTokens
    totalCacheCreationTokens += usage.cacheCreationTokens
    totalCacheReadTokens += usage.cacheReadTokens

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
    totalCacheCreationTokens,
    totalCacheReadTokens,
    messageCount: usages.length,
    primaryModel,
  }
}
