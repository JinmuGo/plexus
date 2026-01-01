/**
 * Cost Store
 *
 * Database operations for token usage and cost tracking.
 * Works with the token_usage table created in migration v4.
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import { join, dirname } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import type {
  SessionCost,
  TokenUsageRow,
  CostStatistics,
  DailyCost,
  CostBreakdown,
  TimeRange,
  ParsedUsage,
} from 'shared/cost-types'
import type { AgentType } from 'shared/hook-types'
import { generateId } from '../lib/utils'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get start of day timestamp
 */
function getStartOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

// ============================================================================
// Cost Store Class
// ============================================================================

class CostStore {
  private db: Database.Database | null = null
  private dbPath: string | null = null

  /**
   * Initialize connection to the history database
   * Uses the same database as HistoryStore
   */
  initialize(dbPath?: string): void {
    if (this.db) {
      console.log('[CostStore] Already initialized')
      return
    }

    this.dbPath = dbPath || join(app.getPath('home'), '.plexus', 'history.db')

    // Ensure directory exists
    const dir = dirname(this.dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    console.log(`[CostStore] Connecting to database at ${this.dbPath}`)

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      console.log('[CostStore] Database connection closed')
    }
  }

  // ============================================================================
  // Record Operations
  // ============================================================================

  /**
   * Record token usage for a session
   */
  recordUsage(
    sessionId: string,
    agent: AgentType,
    usage: ParsedUsage,
    costUsd: number
  ): SessionCost {
    if (!this.db) throw new Error('Database not initialized')

    const id = generateId()
    const recordedAt = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO token_usage (
        id, session_id, agent, model,
        input_tokens, output_tokens,
        cache_creation_tokens, cache_read_tokens,
        cost_usd, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      sessionId,
      agent,
      usage.model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheCreationTokens,
      usage.cacheReadTokens,
      costUsd,
      recordedAt
    )

    console.log(
      `[CostStore] Recorded usage for session ${sessionId.slice(0, 8)}: $${costUsd.toFixed(4)}`
    )

    return {
      id,
      sessionId,
      agent,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      cacheReadTokens: usage.cacheReadTokens,
      costUsd,
      recordedAt,
    }
  }

  /**
   * Record multiple usage records in a transaction
   */
  recordUsageBatch(
    records: Array<{
      sessionId: string
      agent: AgentType
      usage: ParsedUsage
      costUsd: number
    }>
  ): void {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(`
      INSERT INTO token_usage (
        id, session_id, agent, model,
        input_tokens, output_tokens,
        cache_creation_tokens, cache_read_tokens,
        cost_usd, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMany = this.db.transaction(
      (
        items: Array<{
          sessionId: string
          agent: AgentType
          usage: ParsedUsage
          costUsd: number
        }>
      ) => {
        const recordedAt = Date.now()
        for (const item of items) {
          stmt.run(
            generateId(),
            item.sessionId,
            item.agent,
            item.usage.model,
            item.usage.inputTokens,
            item.usage.outputTokens,
            item.usage.cacheCreationTokens,
            item.usage.cacheReadTokens,
            item.costUsd,
            recordedAt
          )
        }
      }
    )

    insertMany(records)
    console.log(`[CostStore] Batch recorded ${records.length} usage records`)
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Get cost for a specific session
   */
  getSessionCost(sessionId: string): SessionCost | null {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(`
      SELECT
        id, session_id, agent, model,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(cache_creation_tokens) as cache_creation_tokens,
        SUM(cache_read_tokens) as cache_read_tokens,
        SUM(cost_usd) as cost_usd,
        MAX(recorded_at) as recorded_at
      FROM token_usage
      WHERE session_id = ?
      GROUP BY session_id
    `)

    const row = stmt.get(sessionId) as TokenUsageRow | undefined
    if (!row) return null

    return {
      id: row.id,
      sessionId: row.session_id,
      agent: row.agent as AgentType,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheCreationTokens: row.cache_creation_tokens,
      cacheReadTokens: row.cache_read_tokens,
      costUsd: row.cost_usd,
      recordedAt: row.recorded_at,
    }
  }

  /**
   * Get daily costs for a time range
   */
  getDailyCosts(timeRange?: TimeRange): DailyCost[] {
    if (!this.db) throw new Error('Database not initialized')

    let sql = `
      SELECT
        date(recorded_at / 1000, 'unixepoch', 'localtime') as date,
        MIN(recorded_at) as timestamp,
        SUM(cost_usd) as cost_usd,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        COUNT(DISTINCT session_id) as session_count
      FROM token_usage
    `
    const params: unknown[] = []

    if (timeRange) {
      sql += ' WHERE recorded_at >= ? AND recorded_at <= ?'
      params.push(timeRange.start, timeRange.end)
    }

    sql += `
      GROUP BY date
      ORDER BY date DESC
      LIMIT 90
    `

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as Array<{
      date: string
      timestamp: number
      cost_usd: number
      input_tokens: number
      output_tokens: number
      session_count: number
    }>

    return rows.map(row => ({
      date: row.date,
      timestamp: row.timestamp,
      costUsd: row.cost_usd,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      sessionCount: row.session_count,
    }))
  }

  /**
   * Get cost breakdown by agent
   */
  getCostByAgent(timeRange?: TimeRange): CostBreakdown[] {
    if (!this.db) throw new Error('Database not initialized')

    let sql = `
      SELECT
        agent as label,
        SUM(cost_usd) as cost_usd,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens
      FROM token_usage
    `
    const params: unknown[] = []

    if (timeRange) {
      sql += ' WHERE recorded_at >= ? AND recorded_at <= ?'
      params.push(timeRange.start, timeRange.end)
    }

    sql += ' GROUP BY agent ORDER BY cost_usd DESC'

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as Array<{
      label: string
      cost_usd: number
      input_tokens: number
      output_tokens: number
    }>

    const total = rows.reduce((sum, r) => sum + r.cost_usd, 0)

    return rows.map(row => ({
      label: row.label,
      costUsd: row.cost_usd,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      percentage: total > 0 ? (row.cost_usd / total) * 100 : 0,
    }))
  }

  /**
   * Get cost breakdown by model
   */
  getCostByModel(timeRange?: TimeRange): CostBreakdown[] {
    if (!this.db) throw new Error('Database not initialized')

    let sql = `
      SELECT
        model as label,
        SUM(cost_usd) as cost_usd,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens
      FROM token_usage
    `
    const params: unknown[] = []

    if (timeRange) {
      sql += ' WHERE recorded_at >= ? AND recorded_at <= ?'
      params.push(timeRange.start, timeRange.end)
    }

    sql += ' GROUP BY model ORDER BY cost_usd DESC'

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as Array<{
      label: string
      cost_usd: number
      input_tokens: number
      output_tokens: number
    }>

    const total = rows.reduce((sum, r) => sum + r.cost_usd, 0)

    return rows.map(row => ({
      label: row.label,
      costUsd: row.cost_usd,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      percentage: total > 0 ? (row.cost_usd / total) * 100 : 0,
    }))
  }

  /**
   * Get cost breakdown by project
   */
  getCostByProject(timeRange?: TimeRange): CostBreakdown[] {
    if (!this.db) throw new Error('Database not initialized')

    let sql = `
      SELECT
        COALESCE(s.project_name, 'Unknown') as label,
        SUM(t.cost_usd) as cost_usd,
        SUM(t.input_tokens) as input_tokens,
        SUM(t.output_tokens) as output_tokens
      FROM token_usage t
      LEFT JOIN sessions s ON s.id = t.session_id
    `
    const params: unknown[] = []

    if (timeRange) {
      sql += ' WHERE t.recorded_at >= ? AND t.recorded_at <= ?'
      params.push(timeRange.start, timeRange.end)
    }

    sql += ' GROUP BY s.project_name ORDER BY cost_usd DESC'

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as Array<{
      label: string
      cost_usd: number
      input_tokens: number
      output_tokens: number
    }>

    const total = rows.reduce((sum, r) => sum + r.cost_usd, 0)

    return rows.map(row => ({
      label: row.label,
      costUsd: row.cost_usd,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      percentage: total > 0 ? (row.cost_usd / total) * 100 : 0,
    }))
  }

  /**
   * Get comprehensive cost statistics
   */
  getStatistics(timeRange?: TimeRange): CostStatistics {
    if (!this.db) throw new Error('Database not initialized')

    const now = Date.now()
    const startOfToday = getStartOfDay(now)
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000
    const startOfMonth = startOfToday - 30 * 24 * 60 * 60 * 1000

    // Total cost for different periods
    const getTotalCost = (start: number, end: number): number => {
      const stmt = this.db?.prepare(`
        SELECT COALESCE(SUM(cost_usd), 0) as total
        FROM token_usage
        WHERE recorded_at >= ? AND recorded_at <= ?
      `)
      if (!stmt) return 0
      const result = stmt.get(start, end) as { total: number }
      return result.total
    }

    const totalCostToday = getTotalCost(startOfToday, now)
    const totalCostThisWeek = getTotalCost(startOfWeek, now)
    const totalCostThisMonth = getTotalCost(startOfMonth, now)

    // All-time totals
    const allTimeStmt = this.db.prepare(`
      SELECT
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COALESCE(SUM(input_tokens), 0) as total_input,
        COALESCE(SUM(output_tokens), 0) as total_output,
        COUNT(DISTINCT session_id) as session_count
      FROM token_usage
    `)
    const allTime = allTimeStmt.get() as {
      total_cost: number
      total_input: number
      total_output: number
      session_count: number
    }

    // Week-over-week change
    const lastWeekStart = startOfWeek - 7 * 24 * 60 * 60 * 1000
    const lastWeekCost = getTotalCost(lastWeekStart, startOfWeek)
    const weekOverWeekChange =
      lastWeekCost > 0
        ? ((totalCostThisWeek - lastWeekCost) / lastWeekCost) * 100
        : 0

    // Month-over-month change
    const lastMonthStart = startOfMonth - 30 * 24 * 60 * 60 * 1000
    const lastMonthCost = getTotalCost(lastMonthStart, startOfMonth)
    const monthOverMonthChange =
      lastMonthCost > 0
        ? ((totalCostThisMonth - lastMonthCost) / lastMonthCost) * 100
        : 0

    return {
      totalCostToday,
      totalCostThisWeek,
      totalCostThisMonth,
      totalCostAllTime: allTime.total_cost,
      totalInputTokens: allTime.total_input,
      totalOutputTokens: allTime.total_output,
      avgCostPerSession:
        allTime.session_count > 0
          ? allTime.total_cost / allTime.session_count
          : 0,
      avgTokensPerSession:
        allTime.session_count > 0
          ? (allTime.total_input + allTime.total_output) / allTime.session_count
          : 0,
      dailyCosts: this.getDailyCosts(timeRange),
      costByAgent: this.getCostByAgent(timeRange),
      costByProject: this.getCostByProject(timeRange),
      costByModel: this.getCostByModel(timeRange),
      weekOverWeekChange,
      monthOverMonthChange,
    }
  }

  // ============================================================================
  // Cleanup Operations
  // ============================================================================

  /**
   * Delete old usage records
   */
  cleanup(maxAgeDays: number): number {
    if (!this.db) throw new Error('Database not initialized')

    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
    const stmt = this.db.prepare(
      'DELETE FROM token_usage WHERE recorded_at < ?'
    )
    const result = stmt.run(cutoff)

    if (result.changes > 0) {
      console.log(`[CostStore] Cleaned up ${result.changes} old usage records`)
    }

    return result.changes
  }

  /**
   * Check if usage exists for a session
   */
  hasUsage(sessionId: string): boolean {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(
      'SELECT 1 FROM token_usage WHERE session_id = ? LIMIT 1'
    )
    return stmt.get(sessionId) !== undefined
  }
}

// Singleton instance
export const costStore = new CostStore()
