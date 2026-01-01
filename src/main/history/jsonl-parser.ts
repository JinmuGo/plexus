/**
 * JSONL Parser
 *
 * Parses Claude Code conversation JSONL files and extracts:
 * - User prompts (full text)
 * - Assistant response previews (first 200 chars)
 * - Tool usage summaries
 * - File references for on-demand loading
 */

import { createReadStream, existsSync, statSync, readdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join, basename } from 'node:path'

// ============================================================================
// Types
// ============================================================================

/**
 * Raw JSONL entry types from Claude Code
 */
interface JsonlEntryBase {
  uuid: string
  parentUuid: string | null
  sessionId: string
  timestamp: string
  type: string
  cwd?: string
}

interface JsonlUserEntry extends JsonlEntryBase {
  type: 'user'
  message: {
    role: 'user'
    content: string | JsonlContentBlock[]
  }
  isMeta?: boolean
}

interface JsonlAssistantEntry extends JsonlEntryBase {
  type: 'assistant'
  message: {
    role: 'assistant'
    content: JsonlContentBlock[]
    model?: string
  }
}

interface JsonlSystemEntry extends JsonlEntryBase {
  type: 'system'
  subtype?: string
  content?: string
}

interface JsonlSummaryEntry {
  type: 'summary'
  summary: string
  leafUuid: string
}

type JsonlEntry =
  | JsonlUserEntry
  | JsonlAssistantEntry
  | JsonlSystemEntry
  | JsonlSummaryEntry
  | { type: string; [key: string]: unknown }

/**
 * Content block types
 */
interface JsonlTextBlock {
  type: 'text'
  text: string
}

interface JsonlToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface JsonlToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: Array<{ type: string; text?: string }>
}

interface JsonlThinkingBlock {
  type: 'thinking'
  thinking: string
}

type JsonlContentBlock =
  | JsonlTextBlock
  | JsonlToolUseBlock
  | JsonlToolResultBlock
  | JsonlThinkingBlock

/**
 * Parsed conversation entry for storage
 */
export interface ParsedConversationEntry {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  contentPreview: string // First 200 chars for display
  timestamp: number
  jsonlPath: string
  jsonlOffset: number // Byte offset in file
  jsonlLength: number // Byte length of entry
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
}

/**
 * Tool execution extracted from JSONL
 */
export interface ParsedToolExecution {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  toolOutput?: string
  timestamp: number
}

/**
 * Thinking block (reasoning trace) extracted from JSONL
 */
export interface ParsedThinkingBlock {
  id: string
  sessionId: string
  text: string
  timestamp: number
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get JSONL file path for a session
 */
export function getJsonlPath(cwd: string, sessionId: string): string | null {
  // Claude Code stores JSONL in ~/.claude/projects/{encoded-cwd}/{sessionId}.jsonl
  const encodedCwd = cwd.replace(/\//g, '-')
  const jsonlPath = join(
    homedir(),
    '.claude',
    'projects',
    encodedCwd,
    `${sessionId}.jsonl`
  )

  if (existsSync(jsonlPath)) {
    return jsonlPath
  }

  return null
}

/**
 * Extract text content from message content (handles string or array)
 */
function extractTextContent(content: string | JsonlContentBlock[]): string {
  if (typeof content === 'string') {
    return content
  }

  const texts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && 'text' in block) {
      texts.push(block.text)
    }
  }

  return texts.join('\n')
}

/**
 * Extract tool uses from assistant message
 */
function extractToolUses(content: JsonlContentBlock[]): ParsedToolExecution[] {
  const tools: ParsedToolExecution[] = []

  for (const block of content) {
    if (block.type === 'tool_use' && 'id' in block && 'name' in block) {
      tools.push({
        toolUseId: block.id,
        toolName: block.name,
        toolInput: block.input || {},
        timestamp: Date.now(),
      })
    }
  }

  return tools
}

/**
 * Create content preview (first N chars)
 */
function createPreview(content: string, maxLength = 200): string {
  if (content.length <= maxLength) {
    return content
  }
  return `${content.slice(0, maxLength)}...`
}

/**
 * Summarize tool input for display
 */
function summarizeToolInput(
  toolName: string,
  input: Record<string, unknown>
): string {
  if (!input || Object.keys(input).length === 0) {
    return ''
  }

  switch (toolName) {
    case 'Bash':
      return String(input.command || '').slice(0, 100)
    case 'Read':
    case 'Write':
    case 'Edit':
      return String(input.file_path || '')
    case 'Grep':
      return String(input.pattern || '').slice(0, 100)
    case 'Glob':
      return String(input.pattern || '').slice(0, 100)
    case 'Task':
      return String(input.prompt || '').slice(0, 100)
    default: {
      const firstKey = Object.keys(input)[0]
      const firstValue = firstKey ? input[firstKey] : null
      if (firstValue && typeof firstValue === 'string') {
        return firstValue.slice(0, 100)
      }
      return JSON.stringify(input).slice(0, 100)
    }
  }
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Extract thinking blocks from assistant message content
 */
function extractThinkingBlocks(
  content: JsonlContentBlock[],
  id: string,
  sessionId: string,
  timestamp: number
): ParsedThinkingBlock[] {
  const thinking: ParsedThinkingBlock[] = []

  for (const block of content) {
    if (block.type === 'thinking' && 'thinking' in block) {
      const thinkingBlock = block as JsonlThinkingBlock
      if (thinkingBlock.thinking?.trim()) {
        thinking.push({
          id: `${id}-thinking-${thinking.length}`,
          sessionId,
          text: thinkingBlock.thinking,
          timestamp,
        })
      }
    }
  }

  return thinking
}

/**
 * Parse a JSONL file and extract conversation entries
 */
export async function parseJsonlFile(
  jsonlPath: string,
  sessionId: string
): Promise<{
  entries: ParsedConversationEntry[]
  toolExecutions: ParsedToolExecution[]
  thinkingBlocks: ParsedThinkingBlock[]
}> {
  const entries: ParsedConversationEntry[] = []
  const toolExecutions: ParsedToolExecution[] = []
  const thinkingBlocks: ParsedThinkingBlock[] = []
  const toolOutputs = new Map<string, string>() // toolUseId -> output

  if (!existsSync(jsonlPath)) {
    return { entries, toolExecutions, thinkingBlocks }
  }

  const fileStream = createReadStream(jsonlPath, { encoding: 'utf-8' })
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  let currentOffset = 0

  for await (const line of rl) {
    const lineLength = Buffer.byteLength(line, 'utf-8') + 1 // +1 for newline

    try {
      const entry = JSON.parse(line) as JsonlEntry

      // Skip non-conversation entries
      if (
        entry.type === 'summary' ||
        entry.type === 'file-history-snapshot' ||
        entry.type === 'queue-operation'
      ) {
        currentOffset += lineLength
        continue
      }

      // Process user messages
      if (entry.type === 'user' && 'message' in entry) {
        const userEntry = entry as JsonlUserEntry

        // Skip meta messages (system injected)
        if (userEntry.isMeta) {
          currentOffset += lineLength
          continue
        }

        const content = extractTextContent(userEntry.message.content)

        // Check if this is a tool result
        if (Array.isArray(userEntry.message.content)) {
          for (const block of userEntry.message.content) {
            if (block.type === 'tool_result' && 'tool_use_id' in block) {
              const resultBlock = block as JsonlToolResultBlock
              const outputText = resultBlock.content
                ?.filter(c => c.type === 'text' && c.text)
                .map(c => c.text)
                .join('\n')

              if (outputText) {
                toolOutputs.set(
                  resultBlock.tool_use_id,
                  outputText.slice(0, 1000)
                ) // Limit output size
              }
            }
          }
        }

        // Skip tool results as separate messages (they're linked to tools)
        if (content.startsWith('<tool_result>') || !content.trim()) {
          currentOffset += lineLength
          continue
        }

        entries.push({
          id: userEntry.uuid,
          sessionId,
          role: 'user',
          content,
          contentPreview: createPreview(content),
          timestamp: new Date(userEntry.timestamp).getTime(),
          jsonlPath,
          jsonlOffset: currentOffset,
          jsonlLength: lineLength,
        })
      }

      // Process assistant messages
      if (entry.type === 'assistant' && 'message' in entry) {
        const assistantEntry = entry as JsonlAssistantEntry
        const textContent = extractTextContent(assistantEntry.message.content)
        const tools = extractToolUses(assistantEntry.message.content)
        const timestamp = new Date(assistantEntry.timestamp).getTime()

        // Extract thinking blocks
        const thinking = extractThinkingBlocks(
          assistantEntry.message.content,
          assistantEntry.uuid,
          sessionId,
          timestamp
        )
        thinkingBlocks.push(...thinking)

        // Add text response if present
        if (textContent.trim()) {
          entries.push({
            id: assistantEntry.uuid,
            sessionId,
            role: 'assistant',
            content: textContent,
            contentPreview: createPreview(textContent),
            timestamp,
            jsonlPath,
            jsonlOffset: currentOffset,
            jsonlLength: lineLength,
          })
        }

        // Add tool executions
        for (const tool of tools) {
          tool.timestamp = timestamp
          toolExecutions.push(tool)

          // Also add as a tool entry for timeline
          entries.push({
            id: `${assistantEntry.uuid}-${tool.toolUseId}`,
            sessionId,
            role: 'tool',
            content: `[${tool.toolName}] ${summarizeToolInput(tool.toolName, tool.toolInput)}`,
            contentPreview: `${tool.toolName}: ${summarizeToolInput(tool.toolName, tool.toolInput)}`,
            timestamp: tool.timestamp,
            jsonlPath,
            jsonlOffset: currentOffset,
            jsonlLength: lineLength,
            toolName: tool.toolName,
            toolInput: tool.toolInput,
            toolUseId: tool.toolUseId,
          })
        }
      }

      // Process system messages (session start/end, etc.)
      if (entry.type === 'system' && 'content' in entry) {
        const systemEntry = entry as JsonlSystemEntry

        // Only include meaningful system messages
        if (systemEntry.content && !systemEntry.content.includes('<command')) {
          entries.push({
            id: systemEntry.uuid,
            sessionId,
            role: 'system',
            content: systemEntry.content,
            contentPreview: createPreview(systemEntry.content),
            timestamp: new Date(systemEntry.timestamp).getTime(),
            jsonlPath,
            jsonlOffset: currentOffset,
            jsonlLength: lineLength,
          })
        }
      }
    } catch {
      // Skip malformed lines
    }

    currentOffset += lineLength
  }

  // Attach tool outputs to tool executions
  for (const tool of toolExecutions) {
    const output = toolOutputs.get(tool.toolUseId)
    if (output) {
      tool.toolOutput = output
    }
  }

  // Sort by timestamp
  entries.sort((a, b) => a.timestamp - b.timestamp)
  thinkingBlocks.sort((a, b) => a.timestamp - b.timestamp)

  return { entries, toolExecutions, thinkingBlocks }
}

/**
 * Read a specific entry from JSONL file by offset
 */
export async function readJsonlEntry(
  jsonlPath: string,
  offset: number,
  length: number
): Promise<JsonlEntry | null> {
  if (!existsSync(jsonlPath)) {
    return null
  }

  return new Promise((resolve, reject) => {
    const stream = createReadStream(jsonlPath, {
      encoding: 'utf-8',
      start: offset,
      end: offset + length - 1,
    })

    let data = ''

    stream.on('data', chunk => {
      data += chunk
    })

    stream.on('end', () => {
      try {
        resolve(JSON.parse(data.trim()) as JsonlEntry)
      } catch {
        resolve(null)
      }
    })

    stream.on('error', reject)
  })
}

/**
 * Get full content for an entry (reads from JSONL)
 */
export async function getFullContent(
  jsonlPath: string,
  offset: number,
  length: number
): Promise<string | null> {
  const entry = await readJsonlEntry(jsonlPath, offset, length)

  if (!entry) {
    return null
  }

  if (entry.type === 'user' && 'message' in entry) {
    return extractTextContent((entry as JsonlUserEntry).message.content)
  }

  if (entry.type === 'assistant' && 'message' in entry) {
    return extractTextContent((entry as JsonlAssistantEntry).message.content)
  }

  if (entry.type === 'system' && 'content' in entry) {
    return (entry as JsonlSystemEntry).content || null
  }

  return null
}

/**
 * Check if JSONL file exists for a session
 */
export function hasJsonlFile(cwd: string, sessionId: string): boolean {
  const path = getJsonlPath(cwd, sessionId)
  return path !== null
}

/**
 * Get JSONL file size
 */
export function getJsonlFileSize(jsonlPath: string): number {
  if (!existsSync(jsonlPath)) {
    return 0
  }
  return statSync(jsonlPath).size
}

// ============================================================================
// Re-sync Functions
// ============================================================================

/**
 * Discovered JSONL file info
 */
export interface DiscoveredJsonlFile {
  sessionId: string
  jsonlPath: string
  cwd: string
  fileSize: number
  modifiedAt: number
}

/**
 * Session metadata extracted from first entry of JSONL
 */
export interface ExtractedSessionMetadata {
  sessionId: string
  cwd: string
  startedAt: number
  firstUserPrompt: string | null
}

/**
 * Scan ~/.claude/projects/ for all JSONL files
 */
export function scanAllJsonlFiles(): DiscoveredJsonlFile[] {
  const projectsDir = join(homedir(), '.claude', 'projects')

  if (!existsSync(projectsDir)) {
    return []
  }

  const discovered: DiscoveredJsonlFile[] = []

  try {
    const projectDirs = readdirSync(projectsDir, { withFileTypes: true })

    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue

      const projectPath = join(projectsDir, projectDir.name)

      try {
        const files = readdirSync(projectPath, { withFileTypes: true })

        for (const file of files) {
          if (!file.isFile() || !file.name.endsWith('.jsonl')) continue

          const jsonlPath = join(projectPath, file.name)
          const sessionId = basename(file.name, '.jsonl')

          // Decode cwd from folder name (dash-separated path)
          const cwd = projectDir.name.replace(/-/g, '/')

          try {
            const stats = statSync(jsonlPath)
            discovered.push({
              sessionId,
              jsonlPath,
              cwd,
              fileSize: stats.size,
              modifiedAt: stats.mtimeMs,
            })
          } catch {
            // Skip files we can't stat
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }
  } catch {
    // Return empty if we can't read projects dir
  }

  return discovered
}

/**
 * Extract session metadata from JSONL file (reads first few entries)
 */
export async function extractSessionMetadata(
  jsonlPath: string
): Promise<ExtractedSessionMetadata | null> {
  if (!existsSync(jsonlPath)) {
    return null
  }

  return new Promise(resolve => {
    const stream = createReadStream(jsonlPath, { encoding: 'utf-8' })
    const rl = createInterface({
      input: stream,
      crlfDelay: Number.POSITIVE_INFINITY,
    })

    let sessionId: string | null = null
    let cwd: string | null = null
    let startedAt: number | null = null
    let firstUserPrompt: string | null = null
    let lineCount = 0
    const maxLines = 20 // Only read first N lines

    rl.on('line', line => {
      lineCount++

      try {
        const entry = JSON.parse(line) as JsonlEntry

        // Extract session ID from any entry
        if (!sessionId && 'sessionId' in entry) {
          const entryWithSession = entry as JsonlEntryBase
          sessionId = entryWithSession.sessionId
        }

        // Extract cwd from any entry
        if (!cwd && 'cwd' in entry) {
          const entryWithCwd = entry as JsonlEntryBase
          if (entryWithCwd.cwd) {
            cwd = entryWithCwd.cwd
          }
        }

        // Extract start time from first entry
        if (!startedAt && 'timestamp' in entry) {
          const entryWithTimestamp = entry as JsonlEntryBase
          startedAt = new Date(entryWithTimestamp.timestamp).getTime()
        }

        // Extract first user prompt
        if (!firstUserPrompt && entry.type === 'user' && 'message' in entry) {
          const userEntry = entry as JsonlUserEntry
          if (!userEntry.isMeta) {
            const content = extractTextContent(userEntry.message.content)
            if (content.trim()) {
              firstUserPrompt = content
            }
          }
        }

        // Stop if we have all info or reached max lines
        if (
          (sessionId && cwd && startedAt && firstUserPrompt) ||
          lineCount >= maxLines
        ) {
          rl.close()
          stream.destroy()
        }
      } catch {
        // Skip malformed lines
      }
    })

    rl.on('close', () => {
      if (sessionId && cwd && startedAt) {
        resolve({
          sessionId,
          cwd,
          startedAt,
          firstUserPrompt,
        })
      } else {
        resolve(null)
      }
    })

    rl.on('error', () => {
      resolve(null)
    })
  })
}
