/**
 * History Types - Types for session history persistence and search
 */

import type { AgentType, SessionPhase } from './hook-types'

// ============================================================================
// Database Entity Types
// ============================================================================

/**
 * Persisted session record in history database
 */
export interface HistorySession {
  id: string
  agent: AgentType
  cwd: string
  displayTitle: string
  // Session title sources - extracted from conversation
  sessionSummary: string | null // AI-generated summary (Claude Code only)
  firstUserPrompt: string | null // First user message (all agents)
  // Project folder detection
  projectRoot: string | null
  projectName: string | null
  // Git context
  gitBranch: string | null
  startedAt: number
  endedAt: number | null
  durationMs: number | null
  isInTmux: boolean
  tmuxSession: string | null
  tmuxWindow: string | null
  tmuxPane: string | null
  metadata: Record<string, unknown> | null
  createdAt: number
}

/**
 * Message role in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

/**
 * Persisted message record in history database
 */
export interface HistoryMessage {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  contentPreview: string | null // First 200 chars for display (null for backward compat)
  timestamp: number
  metadata: Record<string, unknown> | null
  // JSONL reference for on-demand loading
  jsonlPath: string | null
  jsonlOffset: number | null
  jsonlLength: number | null
}

// ============================================================================
// Thinking Block Types (Reasoning Trace)
// ============================================================================

/**
 * Source of thinking data
 */
export type ThinkingSource = 'claude-code' | 'cursor-agent' | 'gemini-cli'

/**
 * Thinking block (reasoning trace) in conversation
 */
export interface ThinkingBlock {
  id: string
  sessionId: string
  text: string
  source: ThinkingSource
  timestamp: number
  durationMs: number | null // Available for Cursor, null for Claude
}

// ============================================================================
// Tool Execution Types
// ============================================================================

/**
 * Tool execution status
 */
export type ToolExecutionStatus =
  | 'running'
  | 'success'
  | 'error'
  | 'denied'
  | 'interrupted'

/**
 * Persisted tool execution record in history database
 */
export interface ToolExecution {
  id: string
  sessionId: string
  toolUseId: string | null
  toolName: string
  toolInput: Record<string, unknown> | null
  toolOutput: string | null
  status: ToolExecutionStatus
  startedAt: number
  completedAt: number | null
  durationMs: number | null
}

// ============================================================================
// Search & Query Types
// ============================================================================

/**
 * Filters for searching history
 */
export interface SearchFilters {
  agents?: AgentType[]
  dateRange?: {
    start: number
    end: number
  }
  tools?: string[]
  cwd?: string
  phases?: SessionPhase[]
}

/**
 * Sort options for search results
 */
export type SortField = 'startedAt' | 'endedAt' | 'relevance' | 'duration'
export type SortOrder = 'asc' | 'desc'

export interface SortOptions {
  field: SortField
  order: SortOrder
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit: number
  offset: number
}

/**
 * Query options combining filters, sort, and pagination
 */
export interface QueryOptions {
  filters?: SearchFilters
  sort?: SortOptions
  pagination?: PaginationOptions
}

/**
 * Search result item
 */
export interface SearchResult {
  sessionId: string
  messageId: string | null
  snippet: string
  highlights: string[]
  score: number
  session: HistorySession
}

/**
 * Session with messages for detail view
 */
export interface SessionWithMessages {
  session: HistorySession
  messages: HistoryMessage[]
  toolExecutions: ToolExecution[]
  thinkingBlocks: ThinkingBlock[]
}

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * Tool usage statistics
 */
export interface ToolStats {
  toolName: string
  count: number
  successRate: number
  averageDurationMs: number
}

/**
 * Agent-specific statistics for comparison
 */
export interface AgentStats {
  agent: AgentType
  sessionCount: number
  messageCount: number
  avgDurationMs: number
  successRate: number
}

// Note: TimeRange is defined in cost-types.ts to avoid duplication
// Import from 'shared/cost-types' if needed for history statistics

/**
 * Time series data point
 */
export interface TimeSeriesDataPoint {
  timestamp: number
  value: number
  label?: string
}

/**
 * Overall statistics
 */
export interface Statistics {
  // Basic counts
  totalSessions: number
  totalMessages: number
  totalToolExecutions: number
  averageSessionDurationMs: number
  successRate: number
  topTools: ToolStats[]
  sessionsOverTime: TimeSeriesDataPoint[]
  messagesOverTime: TimeSeriesDataPoint[]

  // Session quality metrics
  averageMessagesPerSession: number
  completedSessions: number
  errorSessions: number
  interruptedSessions: number

  // Agent comparison
  agentStats: AgentStats[]
}

// ============================================================================
// Extended Statistics Types (for Analytics)
// ============================================================================

/**
 * Hourly usage data for heatmap visualization
 */
export interface HourlyUsageData {
  hour: number // 0-23
  dayOfWeek: number // 0-6 (Sunday = 0)
  sessionCount: number
}

/**
 * Project usage statistics
 */
export interface ProjectUsageStats {
  projectName: string
  projectRoot: string
  sessionCount: number
  totalMessages: number
  lastUsed: number
  favoriteAgent: AgentType
}

/**
 * Weekly productivity trend data
 */
export interface ProductivityTrend {
  weekLabel: string // "This Week", "Last Week"
  weekStart: number // timestamp
  sessionsPerDay: number
  avgMessagesPerSession: number
  toolSuccessRate: number
  completionRate: number
}

/**
 * Tool failure pattern for analysis
 */
export interface FailurePattern {
  toolName: string
  errorCount: number
  deniedCount: number
  affectedSessions: number
  trend: 'improving' | 'worsening' | 'stable'
}

/**
 * Week-over-week comparison metrics
 */
export interface WeekComparison {
  sessionsChange: number // percentage
  messagesChange: number
  durationChange: number
  successRateChange: number
}

/**
 * Extended statistics including productivity and usage patterns
 */
export interface ExtendedStatistics extends Statistics {
  // Time patterns
  hourlyUsage: HourlyUsageData[]
  peakHour: number // 0-23
  peakDayOfWeek: number // 0-6

  // Project breakdown
  projectStats: ProjectUsageStats[]

  // Productivity trends
  weeklyTrends: ProductivityTrend[]
  thisWeekVsLastWeek: WeekComparison

  // Failure analysis
  failurePatterns: FailurePattern[]
}

// ============================================================================
// Export Types
// ============================================================================

/**
 * Export format options
 */
export type ExportFormat = 'json' | 'markdown'

/**
 * Export options
 */
export interface ExportOptions {
  format: ExportFormat
  sessionIds: string[]
  includeToolOutputs?: boolean
}

// ============================================================================
// Event Types (for IPC)
// ============================================================================

/**
 * History event types for real-time updates
 */
export type HistoryEventType =
  | 'session:created'
  | 'session:updated'
  | 'session:ended'
  | 'message:added'
  | 'tool:started'
  | 'tool:completed'

/**
 * History event payload
 */
export interface HistoryEvent {
  type: HistoryEventType
  sessionId: string
  data: HistorySession | HistoryMessage | ToolExecution
  timestamp: number
}

// ============================================================================
// Database Schema Types (internal)
// ============================================================================

/**
 * Raw session row from database
 */
export interface SessionRow {
  id: string
  agent: string
  cwd: string
  display_title: string
  session_summary: string | null
  first_user_prompt: string | null
  project_root: string | null
  project_name: string | null
  git_branch: string | null
  started_at: number
  ended_at: number | null
  duration_ms: number | null
  is_in_tmux: number
  tmux_session: string | null
  tmux_window: string | null
  tmux_pane: string | null
  metadata: string | null
  created_at: number
}

/**
 * Raw message row from database
 */
export interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string
  content_preview: string | null
  timestamp: number
  metadata: string | null
  jsonl_path: string | null
  jsonl_offset: number | null
  jsonl_length: number | null
}

/**
 * Raw tool execution row from database
 */
export interface ToolExecutionRow {
  id: string
  session_id: string
  tool_use_id: string | null
  tool_name: string
  tool_input: string | null
  tool_output: string | null
  status: string
  started_at: number
  completed_at: number | null
  duration_ms: number | null
}

// ============================================================================
// Prompt Insights Types
// ============================================================================

/**
 * AI provider for prompt improvement
 */
export type AIProvider = 'claude' | 'openai' | 'gemini'

/**
 * Frequently used prompt pattern
 */
export interface FrequentPrompt {
  content: string
  count: number
  agents: AgentType[]
  lastUsed: number
}

/**
 * Grouping mode for prompt clustering
 */
export type GroupingMode = 'exact' | 'similar' | 'semantic'

/**
 * Variant of a prompt within a group
 */
export interface PromptVariant {
  content: string
  count: number
  normalizedContent?: string // For exact mode
  similarity?: number // For similar/semantic mode (0-1)
}

/**
 * Grouped prompt with variants
 */
export interface GroupedPrompt {
  // Representative prompt (most frequently used)
  representative: string
  // All prompt variants in this group
  variants: PromptVariant[]
  // Total usage count across all variants
  totalCount: number
  // Agents that used any variant
  agents: AgentType[]
  // Last used timestamp
  lastUsed: number
  // Grouping mode used
  groupedBy: GroupingMode
}

/**
 * Enhanced prompt group with curation metadata
 */
export interface EnhancedPromptGroup extends GroupedPrompt {
  isCurated: boolean
  curatedId?: string
  category?: string
  priority?: number
}

/**
 * Prompt improvement result
 */
export interface PromptImprovement {
  original: string
  improved: string
  changes: string[]
  provider: AIProvider
}

/**
 * AI service settings
 */
export interface AISettings {
  maxOutputTokens: number
  defaultProvider: AIProvider | null
  groupingMode: GroupingMode | 'auto'
  similarityThreshold: number // 0-1, default 0.8
  showCuratedPrompts?: boolean
  frequentPromptMinCount?: number
}

/**
 * Saved improved prompt
 */
export interface SavedPrompt {
  id: string
  original: string
  improved: string
  changes: string[]
  provider: AIProvider
  savedAt: number
}

// ============================================================================
// Session Replay Types
// ============================================================================

/**
 * Unified timeline event for replay, combining messages and tool executions
 */
export interface ReplayTimelineEvent {
  id: string
  type: 'message' | 'tool'
  timestamp: number
  data: HistoryMessage | ToolExecution
}

/**
 * Playback speed multiplier options
 */
export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2

/**
 * Replay player state
 */
export interface ReplayState {
  sessionId: string
  currentIndex: number
  isPlaying: boolean
  speed: PlaybackSpeed
  timeline: ReplayTimelineEvent[]
  startTime: number
  totalDuration: number
}

// ============================================================================
// JSONL Parser Types (for replay and history import)
// ============================================================================

/**
 * Parsed conversation entry from JSONL file
 */
export interface ParsedConversationEntry {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  contentPreview: string
  timestamp: number
  jsonlPath: string
  jsonlOffset: number
  jsonlLength: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
}

/**
 * Parsed tool execution from JSONL file
 */
export interface ParsedToolExecution {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  toolOutput?: string
  timestamp: number
}
