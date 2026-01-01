/**
 * Cost Types - Types for AI cost tracking and intelligence
 *
 * Supports token usage and cost tracking for:
 * - Claude Code (via JSONL files)
 * - Gemini CLI (via JSON files)
 * - Cursor IDE (via Admin API)
 */

import type { AgentType } from './hook-types'

// ============================================================================
// Model Types
// ============================================================================

/**
 * Supported AI models for cost tracking
 */
export type SupportedModel =
  // Claude models
  | 'claude-opus-4-5-20251101'
  | 'claude-opus-4-20250514'
  | 'claude-sonnet-4-20250514'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-haiku-20241022'
  // Gemini models
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash'
  // Cursor models (use underlying model names)
  | 'cursor-small'
  | string // Allow unknown models

/**
 * Model pricing per million tokens (USD)
 */
export interface ModelPricing {
  model: SupportedModel
  inputPricePerMillion: number
  outputPricePerMillion: number
  cacheReadPricePerMillion?: number
  cacheCreatePricePerMillion?: number
  displayName: string
  provider: 'anthropic' | 'google' | 'openai' | 'cursor'
}

// ============================================================================
// Usage Data Types
// ============================================================================

/**
 * Parsed usage data from any platform
 */
export interface ParsedUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  // Gemini-specific
  thoughtTokens?: number
  toolTokens?: number
  model: string
  timestamp: number
}

/**
 * Aggregated usage for a session
 */
export interface SessionUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  thoughtTokens: number
  toolTokens: number
  totalTokens: number
  model: string
  messageCount: number
}

/**
 * Session cost record (stored in DB)
 */
export interface SessionCost {
  id: string
  sessionId: string
  agent: AgentType
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
  recordedAt: number
}

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * Time range for queries
 */
export interface TimeRange {
  start: number // epoch ms
  end: number // epoch ms
}

/**
 * Daily cost data point
 */
export interface DailyCost {
  date: string // YYYY-MM-DD
  timestamp: number
  costUsd: number
  inputTokens: number
  outputTokens: number
  sessionCount: number
}

/**
 * Cost breakdown by dimension
 */
export interface CostBreakdown {
  label: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  percentage: number
  trend?: 'up' | 'down' | 'stable'
  trendPercentage?: number
}

/**
 * Cost statistics for dashboard
 */
export interface CostStatistics {
  // Summary metrics
  totalCostToday: number
  totalCostThisWeek: number
  totalCostThisMonth: number
  totalCostAllTime: number

  // Token metrics
  totalInputTokens: number
  totalOutputTokens: number
  avgCostPerSession: number
  avgTokensPerSession: number

  // Time series
  dailyCosts: DailyCost[]

  // Breakdowns
  costByAgent: CostBreakdown[]
  costByProject: CostBreakdown[]
  costByModel: CostBreakdown[]

  // Trends
  weekOverWeekChange: number
  monthOverMonthChange: number
}

// ============================================================================
// Cursor API Types
// ============================================================================

/**
 * Cursor API configuration
 */
export interface CursorApiConfig {
  apiKey: string // key_xxxxx...
  baseUrl?: string // default: https://api.cursor.com
}

/**
 * Cursor usage event from API
 */
export interface CursorUsageEvent {
  timestamp: string
  model: string
  kind: string
  maxMode: boolean
  requestsCosts: number
  isTokenBasedCall: boolean
  tokenUsage: {
    inputTokens: number
    outputTokens: number
    cacheWriteTokens: number
    cacheReadTokens: number
    totalCents: number
  }
  cursorTokenFee: number
  isFreeBugbot: boolean
  userEmail: string
}

/**
 * Cursor API response for usage events
 */
export interface CursorUsageResponse {
  usageEvents: CursorUsageEvent[]
  totalUsageEventsCount: number
  pagination: {
    numPages: number
    currentPage: number
    pageSize: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
  period: {
    startDate: number
    endDate: number
  }
}

// ============================================================================
// Settings Types
// ============================================================================

/**
 * Cost tracking settings
 */
export interface CostSettings {
  // API keys
  cursorApiKey?: string

  // Display preferences
  currency: 'USD' | 'EUR' | 'KRW'
  showCostsInDashboard: boolean

  // Sync preferences
  cursorSyncEnabled: boolean
  cursorSyncIntervalMs: number // default: 1 hour
  lastCursorSync?: number
}

/**
 * Default cost settings
 */
export const DEFAULT_COST_SETTINGS: CostSettings = {
  currency: 'USD',
  showCostsInDashboard: true,
  cursorSyncEnabled: false,
  cursorSyncIntervalMs: 60 * 60 * 1000, // 1 hour
}

// ============================================================================
// Database Row Types
// ============================================================================

/**
 * Database row for token_usage table
 */
export interface TokenUsageRow {
  id: string
  session_id: string
  agent: string
  model: string
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  cost_usd: number
  recorded_at: number
}

// Note: rowToSessionCost() function removed - it was never used in the codebase
// If needed in the future, conversion should be done in main/store/cost-store.ts
