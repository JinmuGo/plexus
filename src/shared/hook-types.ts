/**
 * Hook Types - Shared between Hook script and Electron app
 * Based on claude-island's hook protocol
 */

// Hook Event Names (from Claude Code)
export type HookEventName =
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PermissionRequest'
  | 'Notification'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreCompact'

// Session Status (internal representation)
export type SessionStatus =
  | 'processing'
  | 'running_tool'
  | 'waiting_for_approval'
  | 'waiting_for_input'
  | 'notification'
  | 'compacting'
  | 'ended'
  | 'error' // Fix #9: Added error status
  | 'unknown'

// Session Phase (state machine states)
export type SessionPhase =
  | 'idle'
  | 'processing'
  | 'waitingForInput'
  | 'waitingForApproval'
  | 'compacting'
  | 'ended'

// Agent Type (which AI agent is being tracked)
export type AgentType = 'claude' | 'gemini' | 'cursor'

// Hook Input (JSON from Claude Code via stdin)
export interface HookInput {
  session_id: string
  hook_event_name: HookEventName
  cwd: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_use_id?: string
  notification_type?: string
  message?: string
}

// Hook Event (sent to Electron app via socket)
export interface HookEvent {
  sessionId: string
  cwd: string
  event: HookEventName
  status: SessionStatus
  agent: AgentType
  pid?: number
  tty?: string
  tool?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  notificationType?: string
  message?: string
}

// ============================================================================
// Permission Decision Types (Agent-specific)
// ============================================================================

// Claude Code: only allow/deny (no ask support for PermissionRequest)
// Reference: https://code.claude.com/docs/en/hooks
export type ClaudeDecision = 'allow' | 'deny'

// Cursor: allow/deny/ask
// Reference: https://cursor.com/docs/agent/hooks
export type CursorDecision = 'allow' | 'deny' | 'ask'

// Gemini CLI: allow/deny/ask/block
// Reference: https://geminicli.com/docs/hooks/reference/
export type GeminiDecision = 'allow' | 'deny' | 'ask' | 'block'

// Plexus internal decision type (agent protocol + Plexus features)
export type PermissionDecision =
  | 'allow'
  | 'deny'
  | 'ask' // Cursor, Gemini only
  | 'block' // Gemini only
  | 'auto-allow-session' // Plexus-only feature

// Agent permission capabilities
export interface AgentPermissionCapabilities {
  ask: boolean // Defer to agent's native UI
  block: boolean // Permanent block
  updatedInput: boolean // Modify input before allow (Claude only)
  interrupt: boolean // Stop agent on deny (Claude only)
  autoAllow: boolean // Plexus auto-allow feature
}

export const AGENT_CAPABILITIES: Record<
  AgentType,
  AgentPermissionCapabilities
> = {
  claude: {
    ask: false,
    block: false,
    updatedInput: true,
    interrupt: true,
    autoAllow: true,
  },
  cursor: {
    ask: true,
    block: false,
    updatedInput: false,
    interrupt: false,
    autoAllow: true,
  },
  gemini: {
    ask: true,
    block: true,
    updatedInput: false,
    interrupt: false,
    autoAllow: true,
  },
}

// Auto-allow entry for session-based auto-approval
export interface AutoAllowEntry {
  toolName: string
  allowedAt: number
}

// ============================================================================
// Hook Response Types
// ============================================================================

// Hook Response (from Electron app for PermissionRequest)
export interface HookResponse {
  decision: 'allow' | 'deny' | 'ask' | 'block'
  reason?: string
  // Claude-only: modify tool input before execution
  updatedInput?: Record<string, unknown>
  // Claude-only: stop agent entirely on deny
  interrupt?: boolean
}

// Hook Output (JSON to Claude Code via stdout)
export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest'
    decision: {
      behavior: 'allow' | 'deny'
      message?: string
      // For allow with modified input
      updatedInput?: Record<string, unknown>
      // For deny with agent interruption
      interrupt?: boolean
    }
  }
}

// Permission Context (for UI display)
export interface PermissionContext {
  toolUseId: string
  toolName: string
  toolInput?: Record<string, unknown>
  receivedAt: number
}

// Question Context (for question-asking tools like AskUserQuestion)
export interface QuestionContext {
  toolUseId: string
  toolName: string
  question: string
  options?: string[]
  header?: string
  receivedAt: number
}

// Tmux Target
export interface TmuxTarget {
  session: string
  window: string
  pane: string
}

// Claude Session (main session state)
export interface ClaudeSession {
  id: string
  cwd: string
  agent: AgentType
  pid?: number
  tty?: string
  phase: SessionPhase
  startedAt: number
  lastActivity: number
  activePermission?: PermissionContext
  questionContext?: QuestionContext
  // Auto-allowed tools for this session
  autoAllowedTools?: AutoAllowEntry[]
  // Tmux detection - isInTmux is set immediately, tmuxTarget is resolved async
  isInTmux: boolean
  tmuxTarget?: TmuxTarget
  // Project folder detection - detected from cwd at session start
  projectRoot?: string
  projectName?: string
  gitBranch?: string
  displayTitle?: string
  // Session title sources - extracted from conversation
  sessionSummary?: string // AI-generated summary (Claude Code only)
  firstUserPrompt?: string // First user message (all agents)
  lastMessage?: string
  lastMessageRole?: 'user' | 'assistant' | 'tool'
  lastToolName?: string
  /** Fix #6: Track when compacting phase started for timeout detection */
  compactingStartedAt?: number
}

// Pending Permission (for socket management)
export interface PendingPermission {
  sessionId: string
  toolUseId: string
  clientSocketId: number
  event: HookEvent
  receivedAt: number
  /** Flag to prevent duplicate failure notifications (Fix #2) */
  failureReported?: boolean
}

// Subagent Tool Info (from agent JSONL files)
export interface SubagentToolInfo {
  id: string
  name: string
  input: Record<string, string>
  isCompleted: boolean
  timestamp?: string
}

// JSONL File Update Payload
export interface FileUpdatePayload {
  sessionId: string
  messages: ChatHistoryItem[]
  newMessagesCount: number
}

// Chat History Item Types
export type ChatHistoryItemType =
  | { type: 'user'; text: string }
  | { type: 'assistant'; text: string }
  | { type: 'toolCall'; tool: ToolCallItem }
  | { type: 'thinking'; text: string }
  | { type: 'interrupted' }

export interface ChatHistoryItem {
  id: string
  type: ChatHistoryItemType['type']
  content: ChatHistoryItemType
  timestamp: number
}

// Tool Call Item
export type ToolStatus =
  | 'running'
  | 'waitingForApproval'
  | 'success'
  | 'error'
  | 'interrupted'

export interface ToolCallItem {
  id: string
  name: string
  input: Record<string, string>
  status: ToolStatus
  result?: string
  structuredResult?: StructuredToolResult
  subagentTools?: SubagentToolCall[]
}

export interface SubagentToolCall {
  id: string
  name: string
  input: Record<string, string>
  status: ToolStatus
}

// Structured Tool Results (for different tool types)
export type StructuredToolResult =
  | { type: 'read'; data: ReadResult }
  | { type: 'edit'; data: EditResult }
  | { type: 'write'; data: WriteResult }
  | { type: 'bash'; data: BashResult }
  | { type: 'grep'; data: GrepResult }
  | { type: 'glob'; data: GlobResult }
  | { type: 'generic'; data: GenericResult }

export interface ReadResult {
  filename: string
  content: string
  startLine: number
  totalLines: number
}

export interface EditResult {
  filename: string
  oldString: string
  newString: string
  userModified: boolean
}

export interface WriteResult {
  filename: string
  type: 'create' | 'overwrite'
  content: string
  structuredPatch?: PatchHunk[]
}

export interface BashResult {
  stdout: string
  stderr: string
  returnCode?: number
  returnCodeInterpretation?: string
  backgroundTaskId?: string
  hasOutput: boolean
}

export interface GrepResult {
  mode: 'filesWithMatches' | 'content' | 'count'
  filenames: string[]
  content?: string
  numFiles: number
}

export interface GlobResult {
  filenames: string[]
  truncated: boolean
}

export interface GenericResult {
  rawContent?: string
}

export interface PatchHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

// Socket Path for hook communication (separate from legacy IPC)
export const SOCKET_PATH = '/tmp/plexus-hooks.sock'

// Timeout for permission decisions (5 minutes)
export const PERMISSION_TIMEOUT_MS = 300000

// Activity Log Types (for Side Panel display)
export type ActivityEventType =
  | 'tool_start'
  | 'tool_complete'
  | 'permission_request'
  | 'permission_resolved'
  | 'phase_change'
  | 'session_start'
  | 'session_end'

export interface SessionActivityEntry {
  id: string
  timestamp: number
  type: ActivityEventType
  tool?: string
  phase?: SessionPhase
  message?: string
  decision?: 'allow' | 'deny'
}

// Cursor Hook Types (for Cursor IDE integration)
export type CursorHookEventName =
  | 'beforeShellExecution'
  | 'afterShellExecution'
  | 'beforeMCPExecution'
  | 'afterMCPExecution'
  | 'beforeReadFile'
  | 'afterFileEdit'
  | 'beforeSubmitPrompt'
  | 'afterAgentResponse'
  | 'afterAgentThought'
  | 'stop'

// Cursor Hook Input (JSON from Cursor via stdin)
export interface CursorHookInput {
  conversation_id: string
  generation_id: string
  model: string
  hook_event_name: CursorHookEventName
  cursor_version: string
  workspace_roots: string[]
  user_email: string | null
  // Event-specific fields
  command?: string // beforeShellExecution, afterShellExecution
  cwd?: string // beforeShellExecution
  output?: string // afterShellExecution
  duration?: number // afterShellExecution, afterMCPExecution
  tool_name?: string // beforeMCPExecution, afterMCPExecution
  parameters?: Record<string, unknown> // beforeMCPExecution
  tool_input?: string // beforeMCPExecution (JSON string)
  result_json?: string // afterMCPExecution
  url?: string // MCP server URL
  file_path?: string // beforeReadFile, afterFileEdit
  content?: string // beforeReadFile
  edits?: Array<{
    old_string: string
    new_string: string
    range?: {
      start_line_number: number
      start_column: number
      end_line_number: number
      end_column: number
    }
  }> // afterFileEdit
  prompt?: string // beforeSubmitPrompt
  attachments?: Array<{
    type: 'file' | 'rule'
    filePath?: string
  }> // beforeSubmitPrompt
  text?: string // afterAgentResponse, afterAgentThought
  duration_ms?: number // afterAgentThought
  status?: 'completed' | 'aborted' | 'error' // stop
  loop_count?: number // stop
}

// Cursor Hook Output (JSON to Cursor via stdout)
export interface CursorHookOutput {
  permission?: 'allow' | 'deny' | 'ask'
  user_message?: string
  agent_message?: string
  continue?: boolean // for beforeSubmitPrompt
  followup_message?: string // for stop
}
