/**
 * JSONL Parser
 *
 * Parses Claude JSONL conversation files to extract messages and tool results.
 * Optimized for incremental parsing - only reads new lines since last sync.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type {
  ChatHistoryItem,
  ToolCallItem,
  StructuredToolResult,
  ReadResult,
  EditResult,
  WriteResult,
  BashResult,
  GrepResult,
  GlobResult,
  PatchHunk,
  SubagentToolInfo,
} from 'shared/hook-types'

// Conversation info summary
export interface ConversationInfo {
  summary?: string
  lastMessage?: string
  lastMessageRole?: 'user' | 'assistant' | 'tool'
  lastToolName?: string
  firstUserMessage?: string
  lastUserMessageDate?: Date
}

// Tool result from JSONL
interface ToolResult {
  content?: string
  stdout?: string
  stderr?: string
  isError: boolean
  isInterrupted: boolean
}

// Incremental parse state
interface IncrementalParseState {
  lastFileOffset: number
  messages: ChatHistoryItem[]
  seenToolIds: Set<string>
  toolIdToName: Map<string, string>
  completedToolIds: Set<string>
  toolResults: Map<string, ToolResult>
  structuredResults: Map<string, StructuredToolResult>
  lastClearOffset: number
  clearPending: boolean
}

// Incremental parse result
export interface IncrementalParseResult {
  newMessages: ChatHistoryItem[]
  allMessages: ChatHistoryItem[]
  completedToolIds: Set<string>
  toolResults: Map<string, ToolResult>
  structuredResults: Map<string, StructuredToolResult>
  clearDetected: boolean
  interruptDetected: boolean
}

/**
 * Build session file path
 */
function sessionFilePath(sessionId: string, cwd: string): string {
  const projectDir = cwd.replace(/\//g, '-').replace(/\./g, '-')
  return path.join(
    os.homedir(),
    '.claude',
    'projects',
    projectDir,
    `${sessionId}.jsonl`
  )
}

/**
 * Build agent file path
 */
function agentFilePath(agentId: string, cwd: string): string {
  const projectDir = cwd.replace(/\//g, '-').replace(/\./g, '-')
  return path.join(
    os.homedir(),
    '.claude',
    'projects',
    projectDir,
    `agent-${agentId}.jsonl`
  )
}

/**
 * Truncate message for display
 */
function truncateMessage(
  message: string | undefined,
  maxLength = 80
): string | undefined {
  if (!message) return undefined
  const cleaned = message.trim().replace(/\n/g, ' ')
  if (cleaned.length > maxLength) {
    return `${cleaned.slice(0, maxLength - 3)}...`
  }
  return cleaned
}

/**
 * Format tool input for display
 */
function formatToolInput(
  input: Record<string, unknown> | undefined,
  toolName: string
): string {
  if (!input) return ''

  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit': {
      const filePath = input.file_path as string | undefined
      if (filePath) {
        return path.basename(filePath)
      }
      break
    }
    case 'Bash': {
      const command = input.command as string | undefined
      if (command) return command
      break
    }
    case 'Grep':
    case 'Glob': {
      const pattern = input.pattern as string | undefined
      if (pattern) return pattern
      break
    }
    case 'Task': {
      const description = input.description as string | undefined
      if (description) return description
      break
    }
    case 'WebFetch': {
      const url = input.url as string | undefined
      if (url) return url
      break
    }
    case 'WebSearch': {
      const query = input.query as string | undefined
      if (query) return query
      break
    }
    default: {
      for (const value of Object.values(input)) {
        if (typeof value === 'string' && value) {
          return value
        }
      }
    }
  }
  return ''
}

/**
 * Check if content contains interrupt pattern
 */
function isInterruptContent(content: string | undefined): boolean {
  if (!content) return false
  return (
    content.includes('Interrupted by user') ||
    content.includes('interrupted by user') ||
    content.includes("user doesn't want to proceed") ||
    content.includes('[Request interrupted by user')
  )
}

/**
 * JSONL Parser - singleton class for parsing Claude JSONL files
 */
class JsonlParser {
  private cache: Map<
    string,
    { modificationDate: number; info: ConversationInfo }
  > = new Map()
  private incrementalState: Map<string, IncrementalParseState> = new Map()

  /**
   * Parse a JSONL file to extract conversation info (cached)
   */
  parse(sessionId: string, cwd: string): ConversationInfo {
    const filePath = sessionFilePath(sessionId, cwd)

    try {
      const stats = fs.statSync(filePath)
      const modDate = stats.mtimeMs

      const cached = this.cache.get(filePath)
      if (cached && cached.modificationDate === modDate) {
        return cached.info
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const info = this.parseContent(content)
      this.cache.set(filePath, { modificationDate: modDate, info })

      return info
    } catch {
      return {}
    }
  }

  /**
   * Parse JSONL content for conversation info
   */
  private parseContent(content: string): ConversationInfo {
    const lines = content.split('\n').filter(l => l.trim())

    let summary: string | undefined
    let lastMessage: string | undefined
    let lastMessageRole: 'user' | 'assistant' | 'tool' | undefined
    let lastToolName: string | undefined
    let firstUserMessage: string | undefined
    let lastUserMessageDate: Date | undefined

    // Find first user message
    for (const line of lines) {
      try {
        const json = JSON.parse(line) as Record<string, unknown>
        const type = json.type as string | undefined
        const isMeta = json.isMeta as boolean | undefined

        if (type === 'user' && !isMeta) {
          const message = json.message as Record<string, unknown> | undefined
          const msgContent = message?.content as string | undefined
          if (
            msgContent &&
            !msgContent.startsWith('<command-name>') &&
            !msgContent.startsWith('<local-command') &&
            !msgContent.startsWith('Caveat:')
          ) {
            firstUserMessage = truncateMessage(msgContent, 50)
            break
          }
        }
      } catch {}
    }

    // Find last message, summary, and last user message date (reverse iteration)
    let foundLastUserMessage = false
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]
      try {
        const json = JSON.parse(line) as Record<string, unknown>
        const type = json.type as string | undefined

        if (!lastMessage && (type === 'user' || type === 'assistant')) {
          const isMeta = json.isMeta as boolean | undefined
          if (!isMeta) {
            const message = json.message as Record<string, unknown> | undefined
            if (message) {
              const msgContent = message.content
              if (typeof msgContent === 'string') {
                if (
                  !msgContent.startsWith('<command-name>') &&
                  !msgContent.startsWith('<local-command') &&
                  !msgContent.startsWith('Caveat:')
                ) {
                  lastMessage = msgContent
                  lastMessageRole = type as 'user' | 'assistant'
                }
              } else if (Array.isArray(msgContent)) {
                for (let j = msgContent.length - 1; j >= 0; j--) {
                  const block = msgContent[j] as Record<string, unknown>
                  const blockType = block.type as string | undefined
                  if (blockType === 'tool_use') {
                    const toolName = (block.name as string) || 'Tool'
                    const toolInput = block.input as
                      | Record<string, unknown>
                      | undefined
                    lastMessage = formatToolInput(toolInput, toolName)
                    lastMessageRole = 'tool'
                    lastToolName = toolName
                    break
                  }
                  if (blockType === 'text') {
                    const text = block.text as string | undefined
                    if (
                      text &&
                      !text.startsWith('[Request interrupted by user')
                    ) {
                      lastMessage = text
                      lastMessageRole = type as 'user' | 'assistant'
                      break
                    }
                  }
                }
              }
            }
          }
        }

        if (!foundLastUserMessage && type === 'user') {
          const isMeta = json.isMeta as boolean | undefined
          if (!isMeta) {
            const message = json.message as Record<string, unknown> | undefined
            const msgContent = message?.content as string | undefined
            if (
              msgContent &&
              !msgContent.startsWith('<command-name>') &&
              !msgContent.startsWith('<local-command') &&
              !msgContent.startsWith('Caveat:')
            ) {
              const timestampStr = json.timestamp as string | undefined
              if (timestampStr) {
                lastUserMessageDate = new Date(timestampStr)
              }
              foundLastUserMessage = true
            }
          }
        }

        if (!summary && type === 'summary') {
          summary = json.summary as string | undefined
        }

        if (summary && lastMessage && foundLastUserMessage) {
          break
        }
      } catch {}
    }

    return {
      summary,
      lastMessage: truncateMessage(lastMessage),
      lastMessageRole,
      lastToolName,
      firstUserMessage,
      lastUserMessageDate,
    }
  }

  /**
   * Parse only NEW messages since last call (incremental)
   */
  parseIncremental(sessionId: string, cwd: string): IncrementalParseResult {
    const filePath = sessionFilePath(sessionId, cwd)

    if (!fs.existsSync(filePath)) {
      return {
        newMessages: [],
        allMessages: [],
        completedToolIds: new Set(),
        toolResults: new Map(),
        structuredResults: new Map(),
        clearDetected: false,
        interruptDetected: false,
      }
    }

    let state = this.incrementalState.get(sessionId)
    if (!state) {
      state = {
        lastFileOffset: 0,
        messages: [],
        seenToolIds: new Set(),
        toolIdToName: new Map(),
        completedToolIds: new Set(),
        toolResults: new Map(),
        structuredResults: new Map(),
        lastClearOffset: 0,
        clearPending: false,
      }
    }

    const { newMessages, interruptDetected } = this.parseNewLines(
      filePath,
      state
    )
    const clearDetected = state.clearPending
    if (clearDetected) {
      state.clearPending = false
    }
    this.incrementalState.set(sessionId, state)

    return {
      newMessages,
      allMessages: state.messages,
      completedToolIds: state.completedToolIds,
      toolResults: state.toolResults,
      structuredResults: state.structuredResults,
      clearDetected,
      interruptDetected,
    }
  }

  /**
   * Parse new lines from file
   */
  private parseNewLines(
    filePath: string,
    state: IncrementalParseState
  ): { newMessages: ChatHistoryItem[]; interruptDetected: boolean } {
    let fd: number | undefined
    try {
      fd = fs.openSync(filePath, 'r')
      const stats = fs.fstatSync(fd)
      const fileSize = stats.size

      // Reset if file was truncated
      if (fileSize < state.lastFileOffset) {
        state.lastFileOffset = 0
        state.messages = []
        state.seenToolIds.clear()
        state.toolIdToName.clear()
        state.completedToolIds.clear()
        state.toolResults.clear()
        state.structuredResults.clear()
        state.lastClearOffset = 0
      }

      // No new content
      if (fileSize === state.lastFileOffset) {
        return { newMessages: [], interruptDetected: false }
      }

      // Read new content
      const buffer = Buffer.alloc(fileSize - state.lastFileOffset)
      fs.readSync(fd, buffer, 0, buffer.length, state.lastFileOffset)
      const newContent = buffer.toString('utf-8')

      const isIncrementalRead = state.lastFileOffset > 0
      const lines = newContent.split('\n')
      const newMessages: ChatHistoryItem[] = []
      let interruptDetected = false

      for (const line of lines) {
        if (!line.trim()) continue

        // Check for /clear command
        if (line.includes('<command-name>/clear</command-name>')) {
          state.messages = []
          state.seenToolIds.clear()
          state.toolIdToName.clear()
          state.completedToolIds.clear()
          state.toolResults.clear()
          state.structuredResults.clear()

          if (isIncrementalRead) {
            state.clearPending = true
            state.lastClearOffset = state.lastFileOffset
          }
          continue
        }

        // Check for tool_result
        if (line.includes('"tool_result"')) {
          try {
            const json = JSON.parse(line) as Record<string, unknown>
            const messageDict = json.message as
              | Record<string, unknown>
              | undefined
            const contentArray = messageDict?.content as
              | Array<Record<string, unknown>>
              | undefined
            const toolUseResult = json.toolUseResult as
              | Record<string, unknown>
              | undefined
            const topLevelToolName = json.toolName as string | undefined
            const stdout = toolUseResult?.stdout as string | undefined
            const stderr = toolUseResult?.stderr as string | undefined

            if (contentArray) {
              for (const block of contentArray) {
                if (block.type === 'tool_result') {
                  const toolUseId = block.tool_use_id as string | undefined
                  if (toolUseId) {
                    state.completedToolIds.add(toolUseId)

                    const content = block.content as string | undefined
                    const isError = (block.is_error as boolean) || false

                    const toolResult: ToolResult = {
                      content,
                      stdout,
                      stderr,
                      isError,
                      isInterrupted: isError && isInterruptContent(content),
                    }
                    state.toolResults.set(toolUseId, toolResult)

                    // Check for interrupt
                    if (toolResult.isInterrupted) {
                      interruptDetected = true
                    }

                    // Parse structured result
                    const toolName =
                      topLevelToolName || state.toolIdToName.get(toolUseId)
                    if (toolUseResult && toolName) {
                      const structured = this.parseStructuredResult(
                        toolName,
                        toolUseResult,
                        isError
                      )
                      state.structuredResults.set(toolUseId, structured)
                    }
                  }
                }
              }
            }
          } catch {}
        } else if (
          line.includes('"type":"user"') ||
          line.includes('"type":"assistant"')
        ) {
          try {
            const json = JSON.parse(line) as Record<string, unknown>
            const message = this.parseMessageLine(
              json,
              state.seenToolIds,
              state.toolIdToName
            )
            if (message) {
              newMessages.push(message)
              state.messages.push(message)

              // Check for interrupt in message content
              if (message.content.type === 'interrupted') {
                interruptDetected = true
              }
            }
          } catch {}
        }
      }

      state.lastFileOffset = fileSize
      return { newMessages, interruptDetected }
    } catch {
      return { newMessages: [], interruptDetected: false }
    } finally {
      if (fd !== undefined) {
        fs.closeSync(fd)
      }
    }
  }

  /**
   * Parse a single message line
   */
  private parseMessageLine(
    json: Record<string, unknown>,
    seenToolIds: Set<string>,
    toolIdToName: Map<string, string>
  ): ChatHistoryItem | undefined {
    const type = json.type as string | undefined
    const uuid = json.uuid as string | undefined

    if (!type || !uuid) return undefined
    if (type !== 'user' && type !== 'assistant') return undefined
    if (json.isMeta) return undefined

    const messageDict = json.message as Record<string, unknown> | undefined
    if (!messageDict) return undefined

    const timestampStr = json.timestamp as string | undefined
    const timestamp = timestampStr
      ? new Date(timestampStr).getTime()
      : Date.now()

    const content = messageDict.content

    if (typeof content === 'string') {
      if (
        content.startsWith('<command-name>') ||
        content.startsWith('<local-command') ||
        content.startsWith('Caveat:')
      ) {
        return undefined
      }

      if (content.startsWith('[Request interrupted by user')) {
        return {
          id: uuid,
          type: 'interrupted',
          content: { type: 'interrupted' },
          timestamp,
        }
      }

      return {
        id: uuid,
        type: type as 'user' | 'assistant',
        content: { type: type as 'user' | 'assistant', text: content },
        timestamp,
      }
    }

    if (Array.isArray(content)) {
      for (const block of content as Array<Record<string, unknown>>) {
        const blockType = block.type as string | undefined

        if (blockType === 'text') {
          const text = block.text as string | undefined
          if (text) {
            if (text.startsWith('[Request interrupted by user')) {
              return {
                id: uuid,
                type: 'interrupted',
                content: { type: 'interrupted' },
                timestamp,
              }
            }
            return {
              id: uuid,
              type: type as 'user' | 'assistant',
              content: { type: type as 'user' | 'assistant', text },
              timestamp,
            }
          }
        }

        if (blockType === 'tool_use') {
          const toolId = block.id as string | undefined
          const toolName = block.name as string | undefined

          if (toolId && toolName) {
            if (seenToolIds.has(toolId)) continue
            seenToolIds.add(toolId)
            toolIdToName.set(toolId, toolName)

            const inputDict = block.input as Record<string, unknown> | undefined
            const input: Record<string, string> = {}
            if (inputDict) {
              for (const [key, value] of Object.entries(inputDict)) {
                if (typeof value === 'string') {
                  input[key] = value
                } else if (typeof value === 'number') {
                  input[key] = String(value)
                } else if (typeof value === 'boolean') {
                  input[key] = value ? 'true' : 'false'
                }
              }
            }

            const toolCall: ToolCallItem = {
              id: toolId,
              name: toolName,
              input,
              status: 'running',
            }

            return {
              id: uuid,
              type: 'toolCall',
              content: { type: 'toolCall', tool: toolCall },
              timestamp,
            }
          }
        }

        if (blockType === 'thinking') {
          const thinking = block.thinking as string | undefined
          if (thinking) {
            return {
              id: uuid,
              type: 'thinking',
              content: { type: 'thinking', text: thinking },
              timestamp,
            }
          }
        }
      }
    }

    return undefined
  }

  /**
   * Parse structured tool result
   */
  private parseStructuredResult(
    toolName: string,
    toolUseResult: Record<string, unknown>,
    _isError: boolean
  ): StructuredToolResult {
    // Handle MCP tools
    if (toolName.startsWith('mcp__')) {
      return {
        type: 'generic',
        data: { rawContent: JSON.stringify(toolUseResult) },
      }
    }

    switch (toolName) {
      case 'Read':
        return this.parseReadResult(toolUseResult)
      case 'Edit':
        return this.parseEditResult(toolUseResult)
      case 'Write':
        return this.parseWriteResult(toolUseResult)
      case 'Bash':
        return this.parseBashResult(toolUseResult)
      case 'Grep':
        return this.parseGrepResult(toolUseResult)
      case 'Glob':
        return this.parseGlobResult(toolUseResult)
      default: {
        const content =
          (toolUseResult.content as string) ||
          (toolUseResult.stdout as string) ||
          (toolUseResult.result as string)
        return {
          type: 'generic',
          data: { rawContent: content },
        }
      }
    }
  }

  private parseReadResult(data: Record<string, unknown>): StructuredToolResult {
    const fileData = data.file as Record<string, unknown> | undefined
    const source = fileData || data

    const result: ReadResult = {
      filename: (source.filePath as string) || '',
      content: (source.content as string) || '',
      startLine: (source.startLine as number) || 1,
      totalLines: (source.totalLines as number) || 0,
    }
    return { type: 'read', data: result }
  }

  private parseEditResult(data: Record<string, unknown>): StructuredToolResult {
    const result: EditResult = {
      filename: (data.filePath as string) || '',
      oldString: (data.oldString as string) || '',
      newString: (data.newString as string) || '',
      userModified: (data.userModified as boolean) || false,
    }
    return { type: 'edit', data: result }
  }

  private parseWriteResult(
    data: Record<string, unknown>
  ): StructuredToolResult {
    const typeStr = (data.type as string) || 'create'
    const patches: PatchHunk[] = []

    const patchArray = data.structuredPatch as
      | Array<Record<string, unknown>>
      | undefined
    if (patchArray) {
      for (const patch of patchArray) {
        if (
          typeof patch.oldStart === 'number' &&
          typeof patch.oldLines === 'number' &&
          typeof patch.newStart === 'number' &&
          typeof patch.newLines === 'number' &&
          Array.isArray(patch.lines)
        ) {
          patches.push({
            oldStart: patch.oldStart,
            oldLines: patch.oldLines,
            newStart: patch.newStart,
            newLines: patch.newLines,
            lines: patch.lines as string[],
          })
        }
      }
    }

    const result: WriteResult = {
      filename: (data.filePath as string) || '',
      type: typeStr === 'overwrite' ? 'overwrite' : 'create',
      content: (data.content as string) || '',
      structuredPatch: patches.length > 0 ? patches : undefined,
    }
    return { type: 'write', data: result }
  }

  private parseBashResult(data: Record<string, unknown>): StructuredToolResult {
    const result: BashResult = {
      stdout: (data.stdout as string) || '',
      stderr: (data.stderr as string) || '',
      returnCode: data.returnCode as number | undefined,
      returnCodeInterpretation: data.returnCodeInterpretation as
        | string
        | undefined,
      backgroundTaskId: data.backgroundTaskId as string | undefined,
      hasOutput: !!(data.stdout || data.stderr),
    }
    return { type: 'bash', data: result }
  }

  private parseGrepResult(data: Record<string, unknown>): StructuredToolResult {
    const modeStr = (data.mode as string) || 'files_with_matches'
    let mode: 'filesWithMatches' | 'content' | 'count' = 'filesWithMatches'
    if (modeStr === 'content') mode = 'content'
    else if (modeStr === 'count') mode = 'count'

    const result: GrepResult = {
      mode,
      filenames: (data.filenames as string[]) || [],
      content: data.content as string | undefined,
      numFiles: (data.numFiles as number) || 0,
    }
    return { type: 'grep', data: result }
  }

  private parseGlobResult(data: Record<string, unknown>): StructuredToolResult {
    const result: GlobResult = {
      filenames: (data.filenames as string[]) || [],
      truncated: (data.truncated as boolean) || false,
    }
    return { type: 'glob', data: result }
  }

  /**
   * Get completed tool IDs for a session
   */
  getCompletedToolIds(sessionId: string): Set<string> {
    return this.incrementalState.get(sessionId)?.completedToolIds || new Set()
  }

  /**
   * Get tool results for a session
   */
  getToolResults(sessionId: string): Map<string, ToolResult> {
    return this.incrementalState.get(sessionId)?.toolResults || new Map()
  }

  /**
   * Get structured results for a session
   */
  getStructuredResults(sessionId: string): Map<string, StructuredToolResult> {
    return this.incrementalState.get(sessionId)?.structuredResults || new Map()
  }

  /**
   * Reset state for a session
   */
  resetState(sessionId: string): void {
    this.incrementalState.delete(sessionId)
  }

  /**
   * Parse subagent tools from an agent JSONL file
   */
  parseSubagentTools(agentId: string, cwd: string): SubagentToolInfo[] {
    if (!agentId) return []

    const filePath = agentFilePath(agentId, cwd)
    if (!fs.existsSync(filePath)) return []

    let content: string
    try {
      content = fs.readFileSync(filePath, 'utf-8')
    } catch {
      return []
    }

    const tools: SubagentToolInfo[] = []
    const seenToolIds = new Set<string>()
    const completedToolIds = new Set<string>()

    const lines = content.split('\n')

    // First pass: find completed tool IDs
    for (const line of lines) {
      if (!line.trim()) continue
      if (!line.includes('"tool_result"')) continue

      try {
        const json = JSON.parse(line) as Record<string, unknown>
        const messageDict = json.message as Record<string, unknown> | undefined
        const contentArray = messageDict?.content as
          | Array<Record<string, unknown>>
          | undefined

        if (contentArray) {
          for (const block of contentArray) {
            if (block.type === 'tool_result') {
              const toolUseId = block.tool_use_id as string | undefined
              if (toolUseId) {
                completedToolIds.add(toolUseId)
              }
            }
          }
        }
      } catch {}
    }

    // Second pass: extract tool use info
    for (const line of lines) {
      if (!line.trim()) continue
      if (!line.includes('"tool_use"')) continue

      try {
        const json = JSON.parse(line) as Record<string, unknown>
        const messageDict = json.message as Record<string, unknown> | undefined
        const contentArray = messageDict?.content as
          | Array<Record<string, unknown>>
          | undefined

        if (!contentArray) continue

        for (const block of contentArray) {
          if (block.type !== 'tool_use') continue

          const toolId = block.id as string | undefined
          const toolName = block.name as string | undefined

          if (!toolId || !toolName) continue
          if (seenToolIds.has(toolId)) continue

          seenToolIds.add(toolId)

          const inputDict = block.input as Record<string, unknown> | undefined
          const input: Record<string, string> = {}
          if (inputDict) {
            for (const [key, value] of Object.entries(inputDict)) {
              if (typeof value === 'string') {
                input[key] = value
              } else if (typeof value === 'number') {
                input[key] = String(value)
              } else if (typeof value === 'boolean') {
                input[key] = value ? 'true' : 'false'
              }
            }
          }

          tools.push({
            id: toolId,
            name: toolName,
            input,
            isCompleted: completedToolIds.has(toolId),
            timestamp: json.timestamp as string | undefined,
          })
        }
      } catch {}
    }

    return tools
  }
}

// Singleton instance
export const jsonlParser = new JsonlParser()
