/**
 * History Store
 *
 * SQLite-based persistent storage for session history.
 * Manages sessions, messages, and tool executions with full-text search support.
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import { mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { detectGitBranch } from '../utils/git-branch-detector'
import { detectProjectRoot } from '../utils/project-root-detector'
import type {
  HistorySession,
  HistoryMessage,
  ToolExecution,
  SearchFilters,
  SearchResult,
  QueryOptions,
  Statistics,
  ExtendedStatistics,
  ToolStats,
  TimeSeriesDataPoint,
  SessionRow,
  MessageRow,
  ToolExecutionRow,
  MessageRole,
  ToolExecutionStatus,
  FrequentPrompt,
  AgentStats,
  GroupedPrompt,
  EnhancedPromptGroup,
  GroupingMode,
  AIProvider,
  HourlyUsageData,
  ProjectUsageStats,
  ProductivityTrend,
  FailurePattern,
  WeekComparison,
} from 'shared/history-types'
import type { AgentType } from 'shared/hook-types'
import { CURATED_PROMPTS } from 'shared/curated-prompts'
import { groupPrompts, selectSmartGroupingMode } from './prompt-normalizer'
import { SCHEMA_VERSION } from '../constants/sessions'
import { generateId, devLog } from '../lib/utils'

/**
 * Convert database row to HistorySession
 */
function rowToSession(row: SessionRow): HistorySession {
  return {
    id: row.id,
    agent: row.agent as AgentType,
    cwd: row.cwd,
    displayTitle: row.display_title,
    sessionSummary: row.session_summary,
    firstUserPrompt: row.first_user_prompt,
    projectRoot: row.project_root,
    projectName: row.project_name,
    gitBranch: row.git_branch,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    isInTmux: row.is_in_tmux === 1,
    tmuxSession: row.tmux_session,
    tmuxWindow: row.tmux_window,
    tmuxPane: row.tmux_pane,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at,
  }
}

/**
 * Convert database row to HistoryMessage
 */
function rowToMessage(row: MessageRow): HistoryMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as MessageRole,
    content: row.content,
    contentPreview: row.content_preview,
    timestamp: row.timestamp,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    jsonlPath: row.jsonl_path,
    jsonlOffset: row.jsonl_offset,
    jsonlLength: row.jsonl_length,
  }
}

/**
 * Convert database row to ToolExecution
 */
function rowToToolExecution(row: ToolExecutionRow): ToolExecution {
  return {
    id: row.id,
    sessionId: row.session_id,
    toolUseId: row.tool_use_id,
    toolName: row.tool_name,
    toolInput: row.tool_input ? JSON.parse(row.tool_input) : null,
    toolOutput: row.tool_output,
    status: row.status as ToolExecutionStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
  }
}

/**
 * Cache entry for enhanced prompts
 */
interface EnhancedPromptsCache {
  data: EnhancedPromptGroup[]
  timestamp: number
  agentFilter: AgentType | undefined
  daysBack: number
  minCount: number
}

// Statistics cache entry
interface StatisticsCache {
  data: Statistics
  timestamp: number
  key: string
}

class HistoryStore {
  private db: Database.Database | null = null
  private dbPath: string | null = null

  // Enhanced prompts cache (5 minutes TTL)
  private enhancedPromptsCache: EnhancedPromptsCache | null = null
  private static readonly ENHANCED_PROMPTS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  // Statistics cache (5 minutes TTL for expensive queries)
  private statisticsCache: StatisticsCache | null = null
  private static readonly STATISTICS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  /**
   * Initialize the database
   */
  initialize(dbPath?: string): void {
    if (this.db) {
      devLog.log('[HistoryStore] Already initialized')
      return
    }

    // Default path: ~/.plexus/history.db
    this.dbPath = dbPath || join(app.getPath('home'), '.plexus', 'history.db')

    // Ensure directory exists
    const dir = dirname(this.dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    devLog.log(`[HistoryStore] Initializing database at ${this.dbPath}`)

    this.db = new Database(this.dbPath)

    // Performance-optimized PRAGMA settings
    this.db.pragma('journal_mode = WAL') // Write-Ahead Logging for concurrent reads
    this.db.pragma('synchronous = NORMAL') // Balance between safety and speed
    this.db.pragma('cache_size = -64000') // 64MB cache (negative = KB)
    this.db.pragma('temp_store = MEMORY') // Use memory for temp tables
    this.db.pragma('mmap_size = 268435456') // 256MB memory-mapped I/O
    this.db.pragma('busy_timeout = 5000') // 5 second timeout for busy handling
    this.db.pragma('foreign_keys = ON') // Enable foreign key constraints

    this.runMigrations()
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      devLog.log('[HistoryStore] Database closed')
    }
  }

  /**
   * Run database migrations
   */
  private runMigrations(): void {
    if (!this.db) throw new Error('Database not initialized')

    const currentVersion = this.db.pragma('user_version', {
      simple: true,
    }) as number

    devLog.log(
      `[HistoryStore] Current schema version: ${currentVersion}, target: ${SCHEMA_VERSION}`
    )

    if (currentVersion < 1) {
      this.migrateToV1()
    }

    if (currentVersion < 2) {
      this.migrateToV2()
    }

    if (currentVersion < 3) {
      this.migrateToV3()
    }

    if (currentVersion < 4) {
      this.migrateToV4()
    }

    if (currentVersion < 5) {
      this.migrateToV5()
    }

    if (currentVersion < 6) {
      this.migrateToV6()
    }

    if (currentVersion < 7) {
      this.migrateToV7()
    }
  }

  /**
   * Migration to schema version 1
   */
  private migrateToV1(): void {
    if (!this.db) throw new Error('Database not initialized')

    devLog.log('[HistoryStore] Running migration to v1')

    this.db.exec(`
      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL,
        cwd TEXT NOT NULL,
        display_title TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        duration_ms INTEGER,
        is_in_tmux INTEGER DEFAULT 0,
        tmux_session TEXT,
        tmux_window TEXT,
        tmux_pane TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent);
      CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions(cwd);

      -- Messages table
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session_timestamp ON messages(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);

      -- Tool executions table
      CREATE TABLE IF NOT EXISTS tool_executions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        tool_use_id TEXT,
        tool_name TEXT NOT NULL,
        tool_input TEXT,
        tool_output TEXT,
        status TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        duration_ms INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tool_executions_session ON tool_executions(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_name ON tool_executions(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_executions_started_at ON tool_executions(started_at DESC);

      -- Full-text search virtual table
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        content='messages',
        content_rowid='rowid'
      );

      -- Triggers to keep FTS index in sync
      CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
      END;
    `)

    this.db.pragma('user_version = 1')
    devLog.log('[HistoryStore] Migration to v1 complete')
  }

  /**
   * Migration to schema version 2 - Add JSONL reference columns for on-demand loading
   */
  private migrateToV2(): void {
    if (!this.db) throw new Error('Database not initialized')

    devLog.log('[HistoryStore] Running migration to v2 (JSONL references)')

    // Add new columns to messages table for JSONL references
    this.db.exec(`
      -- Add content preview column (first 200 chars for display)
      ALTER TABLE messages ADD COLUMN content_preview TEXT;

      -- Add JSONL file reference columns for on-demand loading
      ALTER TABLE messages ADD COLUMN jsonl_path TEXT;
      ALTER TABLE messages ADD COLUMN jsonl_offset INTEGER;
      ALTER TABLE messages ADD COLUMN jsonl_length INTEGER;
    `)

    // Backfill content_preview from existing content
    this.db.exec(`
      UPDATE messages
      SET content_preview = SUBSTR(content, 1, 200) || CASE WHEN LENGTH(content) > 200 THEN '...' ELSE '' END
      WHERE content_preview IS NULL
    `)

    this.db.pragma('user_version = 2')
    devLog.log('[HistoryStore] Migration to v2 complete')
  }

  /**
   * Migration to schema version 3 - Add project root columns for folder grouping
   */
  private migrateToV3(): void {
    if (!this.db) throw new Error('Database not initialized')

    devLog.log('[HistoryStore] Running migration to v3 (project root)')

    // Add project root columns
    this.db.exec(`
      -- Add project root columns for folder-based grouping
      ALTER TABLE sessions ADD COLUMN project_root TEXT;
      ALTER TABLE sessions ADD COLUMN project_name TEXT;

      -- Create index for efficient folder grouping
      CREATE INDEX IF NOT EXISTS idx_sessions_project_root ON sessions(project_root);
    `)

    // Backfill existing sessions by detecting project root from cwd
    const sessions = this.db
      .prepare('SELECT id, cwd FROM sessions WHERE project_root IS NULL')
      .all() as Array<{ id: string; cwd: string }>

    if (sessions.length > 0) {
      devLog.log(
        `[HistoryStore] Backfilling project root for ${sessions.length} sessions`
      )

      const updateStmt = this.db.prepare(
        'UPDATE sessions SET project_root = ?, project_name = ? WHERE id = ?'
      )

      for (const session of sessions) {
        try {
          const { projectRoot, projectName } = detectProjectRoot(session.cwd)
          updateStmt.run(projectRoot, projectName, session.id)
        } catch (_error) {
          // If detection fails, use cwd as fallback
          const parts = session.cwd.split('/')
          const name = parts[parts.length - 1] || session.cwd
          updateStmt.run(session.cwd, name, session.id)
        }
      }
    }

    this.db.pragma('user_version = 3')
    devLog.log('[HistoryStore] Migration to v3 complete')
  }

  /**
   * Migration to schema version 4 - Add token usage table for cost tracking
   */
  private migrateToV4(): void {
    if (!this.db) throw new Error('Database not initialized')

    devLog.log('[HistoryStore] Running migration to v4 (token usage)')

    this.db.exec(`
      -- Token usage table for cost tracking
      CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        recorded_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      -- Index for efficient cost queries by date
      CREATE INDEX IF NOT EXISTS idx_token_usage_recorded ON token_usage(recorded_at DESC);

      -- Index for agent-specific cost queries
      CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent);

      -- Index for session-specific cost queries
      CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);

      -- Index for model-specific cost queries
      CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
    `)

    this.db.pragma('user_version = 4')
    devLog.log('[HistoryStore] Migration to v4 complete')
  }

  /**
   * Migration to schema version 5 - Add session title fields
   */
  private migrateToV5(): void {
    if (!this.db) throw new Error('Database not initialized')

    devLog.log('[HistoryStore] Running migration to v5 (session titles)')

    this.db.exec(`
      -- Add session title source columns
      ALTER TABLE sessions ADD COLUMN session_summary TEXT;
      ALTER TABLE sessions ADD COLUMN first_user_prompt TEXT;
    `)

    this.db.pragma('user_version = 5')
    devLog.log('[HistoryStore] Migration to v5 complete')
  }

  /**
   * Migration to schema version 6 - Add git branch field
   */
  private migrateToV6(): void {
    if (!this.db) throw new Error('Database not initialized')

    devLog.log('[HistoryStore] Running migration to v6 (git branch)')

    this.db.exec(`
      -- Add git branch column
      ALTER TABLE sessions ADD COLUMN git_branch TEXT;
    `)

    this.db.pragma('user_version = 6')
    devLog.log('[HistoryStore] Migration to v6 complete')
  }

  /**
   * Migration to schema version 7 - Add performance indexes
   */
  private migrateToV7(): void {
    if (!this.db) throw new Error('Database not initialized')

    devLog.log('[HistoryStore] Running migration to v7 (performance indexes)')

    this.db.exec(`
      -- Index for frequent prompts query (role + timestamp filtering)
      CREATE INDEX IF NOT EXISTS idx_messages_role_timestamp
        ON messages(role, timestamp DESC);

      -- Composite index for agent-filtered session queries
      CREATE INDEX IF NOT EXISTS idx_sessions_agent_started
        ON sessions(agent, started_at DESC);

      -- Index for tool statistics queries (tool name + status)
      CREATE INDEX IF NOT EXISTS idx_tool_executions_status_tool
        ON tool_executions(tool_name, status, started_at DESC);

      -- Index for session lookup by tool_use_id
      CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_use_id
        ON tool_executions(tool_use_id);
    `)

    this.db.pragma('user_version = 7')
    devLog.log('[HistoryStore] Migration to v7 complete')
  }

  // ============================================================================
  // Session Operations
  // ============================================================================

  /**
   * Create a new session
   */
  createSession(session: Omit<HistorySession, 'createdAt'>): HistorySession {
    if (!this.db) throw new Error('Database not initialized')

    const createdAt = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, agent, cwd, display_title, session_summary, first_user_prompt,
        project_root, project_name, git_branch,
        started_at, ended_at, duration_ms,
        is_in_tmux, tmux_session, tmux_window, tmux_pane, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      session.id,
      session.agent,
      session.cwd,
      session.displayTitle,
      session.sessionSummary,
      session.firstUserPrompt,
      session.projectRoot,
      session.projectName,
      session.gitBranch,
      session.startedAt,
      session.endedAt,
      session.durationMs,
      session.isInTmux ? 1 : 0,
      session.tmuxSession,
      session.tmuxWindow,
      session.tmuxPane,
      session.metadata ? JSON.stringify(session.metadata) : null,
      createdAt
    )

    devLog.log(`[HistoryStore] Session created: ${session.id.slice(0, 8)}`)

    // Invalidate enhanced prompts cache (new session may affect prompt statistics)
    this.invalidateEnhancedPromptsCache()

    return { ...session, createdAt }
  }

  /**
   * Update a session
   */
  updateSession(
    sessionId: string,
    updates: Partial<Omit<HistorySession, 'id' | 'createdAt'>>
  ): void {
    if (!this.db) throw new Error('Database not initialized')

    const fields: string[] = []
    const values: unknown[] = []

    if (updates.agent !== undefined) {
      fields.push('agent = ?')
      values.push(updates.agent)
    }
    if (updates.cwd !== undefined) {
      fields.push('cwd = ?')
      values.push(updates.cwd)
    }
    if (updates.displayTitle !== undefined) {
      fields.push('display_title = ?')
      values.push(updates.displayTitle)
    }
    if (updates.sessionSummary !== undefined) {
      fields.push('session_summary = ?')
      values.push(updates.sessionSummary)
    }
    if (updates.firstUserPrompt !== undefined) {
      fields.push('first_user_prompt = ?')
      values.push(updates.firstUserPrompt)
    }
    if (updates.startedAt !== undefined) {
      fields.push('started_at = ?')
      values.push(updates.startedAt)
    }
    if (updates.endedAt !== undefined) {
      fields.push('ended_at = ?')
      values.push(updates.endedAt)
    }
    if (updates.durationMs !== undefined) {
      fields.push('duration_ms = ?')
      values.push(updates.durationMs)
    }
    if (updates.isInTmux !== undefined) {
      fields.push('is_in_tmux = ?')
      values.push(updates.isInTmux ? 1 : 0)
    }
    if (updates.tmuxSession !== undefined) {
      fields.push('tmux_session = ?')
      values.push(updates.tmuxSession)
    }
    if (updates.tmuxWindow !== undefined) {
      fields.push('tmux_window = ?')
      values.push(updates.tmuxWindow)
    }
    if (updates.tmuxPane !== undefined) {
      fields.push('tmux_pane = ?')
      values.push(updates.tmuxPane)
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?')
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null)
    }

    if (fields.length === 0) return

    values.push(sessionId)
    const stmt = this.db.prepare(
      `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`
    )
    stmt.run(...values)
  }

  /**
   * End a session (set endedAt and calculate duration)
   */
  endSession(sessionId: string): void {
    if (!this.db) throw new Error('Database not initialized')

    const session = this.getSession(sessionId)
    if (!session) return

    const endedAt = Date.now()
    const durationMs = endedAt - session.startedAt

    this.updateSession(sessionId, { endedAt, durationMs })
    devLog.log(
      `[HistoryStore] Session ended: ${sessionId.slice(0, 8)} (duration: ${durationMs}ms)`
    )
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): HistorySession | null {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?')
    const row = stmt.get(sessionId) as SessionRow | undefined

    return row ? rowToSession(row) : null
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('SELECT 1 FROM sessions WHERE id = ? LIMIT 1')
    return stmt.get(sessionId) !== undefined
  }

  /**
   * Get all sessions with optional filtering
   */
  getSessions(options?: QueryOptions): HistorySession[] {
    if (!this.db) throw new Error('Database not initialized')

    let sql = 'SELECT * FROM sessions WHERE 1=1'
    const params: unknown[] = []

    // Apply filters
    if (options?.filters) {
      const { agents, dateRange, cwd } = options.filters

      if (agents && agents.length > 0) {
        sql += ` AND agent IN (${agents.map(() => '?').join(', ')})`
        params.push(...agents)
      }

      if (dateRange) {
        sql += ' AND started_at >= ? AND started_at <= ?'
        params.push(dateRange.start, dateRange.end)
      }

      if (cwd) {
        sql += ' AND cwd LIKE ?'
        params.push(`%${cwd}%`)
      }
    }

    // Apply sorting
    const sortField = options?.sort?.field || 'startedAt'
    const sortOrder = options?.sort?.order || 'desc'
    const fieldMap: Record<string, string> = {
      startedAt: 'started_at',
      endedAt: 'ended_at',
      duration: 'duration_ms',
    }
    sql += ` ORDER BY ${fieldMap[sortField] || 'started_at'} ${sortOrder.toUpperCase()}`

    // Apply pagination
    if (options?.pagination) {
      sql += ' LIMIT ? OFFSET ?'
      params.push(options.pagination.limit, options.pagination.offset)
    }

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as SessionRow[]

    return rows.map(rowToSession)
  }

  /**
   * Delete a session and all related data
   */
  deleteSession(sessionId: string): void {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?')
    stmt.run(sessionId)
    devLog.log(`[HistoryStore] Session deleted: ${sessionId.slice(0, 8)}`)
  }

  // ============================================================================
  // Message Operations
  // ============================================================================

  /**
   * Add a message to a session
   */
  addMessage(message: Omit<HistoryMessage, 'id'>): HistoryMessage {
    if (!this.db) throw new Error('Database not initialized')

    const id = generateId()
    // Generate preview if not provided
    const contentPreview =
      message.contentPreview ??
      (message.content.length > 200
        ? `${message.content.slice(0, 200)}...`
        : message.content)

    const stmt = this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, content_preview, timestamp, metadata, jsonl_path, jsonl_offset, jsonl_length)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      message.sessionId,
      message.role,
      message.content,
      contentPreview,
      message.timestamp,
      message.metadata ? JSON.stringify(message.metadata) : null,
      message.jsonlPath ?? null,
      message.jsonlOffset ?? null,
      message.jsonlLength ?? null
    )

    // Invalidate cache if this is a user message (affects prompt statistics)
    if (message.role === 'user') {
      this.invalidateEnhancedPromptsCache()
    }

    return { id, ...message, contentPreview }
  }

  /**
   * Get messages for a session
   */
  getMessages(
    sessionId: string,
    options?: { limit?: number; offset?: number }
  ): HistoryMessage[] {
    if (!this.db) throw new Error('Database not initialized')

    let sql =
      'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC'
    const params: unknown[] = [sessionId]

    if (options?.limit) {
      sql += ' LIMIT ?'
      params.push(options.limit)
    }
    if (options?.offset) {
      sql += ' OFFSET ?'
      params.push(options.offset)
    }

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as MessageRow[]

    return rows.map(rowToMessage)
  }

  /**
   * Get a message by ID
   */
  getMessage(messageId: string): HistoryMessage | null {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?')
    const row = stmt.get(messageId) as MessageRow | undefined

    return row ? rowToMessage(row) : null
  }

  /**
   * Add messages from JSONL parsing (batch insert for efficiency)
   */
  addMessagesFromJsonl(
    sessionId: string,
    messages: Array<{
      role: MessageRole
      content: string
      contentPreview: string
      timestamp: number
      jsonlPath: string
      jsonlOffset: number
      jsonlLength: number
      metadata?: Record<string, unknown>
    }>
  ): void {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, content_preview, timestamp, metadata, jsonl_path, jsonl_offset, jsonl_length)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMany = this.db.transaction(
      (
        msgs: Array<{
          role: MessageRole
          content: string
          contentPreview: string
          timestamp: number
          jsonlPath: string
          jsonlOffset: number
          jsonlLength: number
          metadata?: Record<string, unknown>
        }>
      ) => {
        for (const msg of msgs) {
          stmt.run(
            generateId(),
            sessionId,
            msg.role,
            msg.content,
            msg.contentPreview,
            msg.timestamp,
            msg.metadata ? JSON.stringify(msg.metadata) : null,
            msg.jsonlPath,
            msg.jsonlOffset,
            msg.jsonlLength
          )
        }
      }
    )

    insertMany(messages)
    devLog.log(
      `[HistoryStore] Added ${messages.length} messages from JSONL for session ${sessionId.slice(0, 8)}`
    )
  }

  // ============================================================================
  // Tool Execution Operations
  // ============================================================================

  /**
   * Add a tool execution
   */
  addToolExecution(execution: Omit<ToolExecution, 'id'>): ToolExecution {
    if (!this.db) throw new Error('Database not initialized')

    const id = generateId()
    const stmt = this.db.prepare(`
      INSERT INTO tool_executions (
        id, session_id, tool_use_id, tool_name, tool_input, tool_output,
        status, started_at, completed_at, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      execution.sessionId,
      execution.toolUseId,
      execution.toolName,
      execution.toolInput ? JSON.stringify(execution.toolInput) : null,
      execution.toolOutput,
      execution.status,
      execution.startedAt,
      execution.completedAt,
      execution.durationMs
    )

    return { id, ...execution }
  }

  /**
   * Update a tool execution (e.g., when it completes)
   */
  updateToolExecution(
    id: string,
    updates: Partial<Omit<ToolExecution, 'id' | 'sessionId'>>
  ): void {
    if (!this.db) throw new Error('Database not initialized')

    const fields: string[] = []
    const values: unknown[] = []

    if (updates.toolOutput !== undefined) {
      fields.push('tool_output = ?')
      values.push(updates.toolOutput)
    }
    if (updates.status !== undefined) {
      fields.push('status = ?')
      values.push(updates.status)
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?')
      values.push(updates.completedAt)
    }
    if (updates.durationMs !== undefined) {
      fields.push('duration_ms = ?')
      values.push(updates.durationMs)
    }

    if (fields.length === 0) return

    values.push(id)
    const stmt = this.db.prepare(
      `UPDATE tool_executions SET ${fields.join(', ')} WHERE id = ?`
    )
    stmt.run(...values)
  }

  /**
   * Complete a tool execution by toolUseId
   */
  completeToolExecution(
    toolUseId: string,
    status: ToolExecutionStatus,
    output?: string
  ): void {
    if (!this.db) throw new Error('Database not initialized')

    const completedAt = Date.now()

    // Get the started_at to calculate duration
    const existing = this.db
      .prepare('SELECT started_at FROM tool_executions WHERE tool_use_id = ?')
      .get(toolUseId) as { started_at: number } | undefined

    const durationMs = existing ? completedAt - existing.started_at : null

    const stmt = this.db.prepare(`
      UPDATE tool_executions
      SET status = ?, tool_output = ?, completed_at = ?, duration_ms = ?
      WHERE tool_use_id = ?
    `)

    stmt.run(status, output || null, completedAt, durationMs, toolUseId)
  }

  /**
   * Get tool executions for a session
   */
  getToolExecutions(sessionId: string): ToolExecution[] {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(
      'SELECT * FROM tool_executions WHERE session_id = ? ORDER BY started_at ASC'
    )
    const rows = stmt.all(sessionId) as ToolExecutionRow[]

    return rows.map(rowToToolExecution)
  }

  // ============================================================================
  // Search Operations
  // ============================================================================

  /**
   * Escape special characters for FTS5 query
   * FTS5 treats these as operators: AND, OR, NOT, (, ), *, ", ^, :, .
   */
  private escapeFts5Query(query: string): string {
    // Remove or escape special characters that cause FTS5 syntax errors
    // Wrap each word in double quotes to treat as literal phrase
    const words = query
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => {
        // Escape double quotes within the word
        const escaped = word.replace(/"/g, '""')
        // Wrap in double quotes to treat as literal
        return `"${escaped}"`
      })

    return words.join(' ')
  }

  /**
   * Search messages using full-text search
   */
  searchMessages(
    query: string,
    filters?: SearchFilters,
    limit = 50
  ): SearchResult[] {
    if (!this.db) throw new Error('Database not initialized')

    // Escape special characters for FTS5
    const safeQuery = this.escapeFts5Query(query)

    // If query becomes empty after escaping, return empty results
    if (!safeQuery.trim()) {
      return []
    }

    // Build the search query
    let sql = `
      SELECT
        m.id as message_id,
        m.session_id,
        m.content,
        s.*,
        snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
      FROM messages_fts fts
      JOIN messages m ON m.rowid = fts.rowid
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ?
    `
    const params: unknown[] = [safeQuery]

    // Apply filters
    if (filters) {
      if (filters.agents && filters.agents.length > 0) {
        sql += ` AND s.agent IN (${filters.agents.map(() => '?').join(', ')})`
        params.push(...filters.agents)
      }

      if (filters.dateRange) {
        sql += ' AND s.started_at >= ? AND s.started_at <= ?'
        params.push(filters.dateRange.start, filters.dateRange.end)
      }

      if (filters.cwd) {
        sql += ' AND s.cwd LIKE ?'
        params.push(`%${filters.cwd}%`)
      }
    }

    sql += ' ORDER BY rank LIMIT ?'
    params.push(limit)

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as (SessionRow & {
      message_id: string
      content: string
      snippet: string
    })[]

    return rows.map(row => ({
      sessionId: row.id,
      messageId: row.message_id,
      snippet: row.snippet || row.content.slice(0, 200),
      highlights: [],
      score: 0,
      session: rowToSession(row),
    }))
  }

  // ============================================================================
  // Statistics Operations
  // ============================================================================

  /**
   * Get overall statistics (with caching for expensive queries)
   */
  getStatistics(timeRange?: { start: number; end: number }): Statistics {
    if (!this.db) throw new Error('Database not initialized')

    // Generate cache key based on time range
    const cacheKey = timeRange ? `${timeRange.start}-${timeRange.end}` : 'all'

    // Check cache
    if (
      this.statisticsCache &&
      this.statisticsCache.key === cacheKey &&
      Date.now() - this.statisticsCache.timestamp <
        HistoryStore.STATISTICS_CACHE_TTL
    ) {
      return this.statisticsCache.data
    }

    let whereClause = '1=1'
    let whereClauseWithAlias = '1=1' // For queries with table alias 's'
    const params: unknown[] = []

    if (timeRange) {
      whereClause = 'started_at >= ? AND started_at <= ?'
      whereClauseWithAlias = 's.started_at >= ? AND s.started_at <= ?'
      params.push(timeRange.start, timeRange.end)
    }

    // Total sessions
    const sessionsStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM sessions WHERE ${whereClause}`
    )
    const totalSessions = (sessionsStmt.get(...params) as { count: number })
      .count

    // Total messages
    const messagesStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN sessions s ON s.id = m.session_id
      WHERE ${whereClauseWithAlias}
    `)
    const totalMessages = (messagesStmt.get(...params) as { count: number })
      .count

    // Total tool executions
    const toolsStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM tool_executions t
      JOIN sessions s ON s.id = t.session_id
      WHERE ${whereClauseWithAlias}
    `)
    const totalToolExecutions = (toolsStmt.get(...params) as { count: number })
      .count

    // Average session duration
    const durationStmt = this.db.prepare(`
      SELECT AVG(duration_ms) as avg FROM sessions
      WHERE duration_ms IS NOT NULL AND ${whereClause}
    `)
    const avgDuration =
      (durationStmt.get(...params) as { avg: number | null }).avg || 0

    // Success rate (sessions that ended vs all sessions)
    const successStmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN ended_at IS NOT NULL THEN 1 ELSE 0 END) as completed
      FROM sessions WHERE ${whereClause}
    `)
    const successResult = successStmt.get(...params) as {
      total: number
      completed: number
    }
    const successRate =
      successResult.total > 0
        ? successResult.completed / successResult.total
        : 0

    // Top tools
    const topToolsStmt = this.db.prepare(`
      SELECT
        t.tool_name,
        COUNT(*) as count,
        SUM(CASE WHEN t.status = 'success' THEN 1 ELSE 0 END) as success_count,
        AVG(t.duration_ms) as avg_duration
      FROM tool_executions t
      JOIN sessions s ON s.id = t.session_id
      WHERE ${whereClauseWithAlias}
      GROUP BY t.tool_name
      ORDER BY count DESC
      LIMIT 10
    `)
    const topToolsRows = topToolsStmt.all(...params) as {
      tool_name: string
      count: number
      success_count: number
      avg_duration: number | null
    }[]

    const topTools: ToolStats[] = topToolsRows.map(row => ({
      toolName: row.tool_name,
      count: row.count,
      successRate: row.count > 0 ? row.success_count / row.count : 0,
      averageDurationMs: row.avg_duration || 0,
    }))

    // Sessions over time (by day)
    const sessionsOverTimeStmt = this.db.prepare(`
      SELECT
        date(started_at / 1000, 'unixepoch') as date,
        COUNT(*) as count
      FROM sessions
      WHERE ${whereClause}
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `)
    const sessionsOverTime: TimeSeriesDataPoint[] = (
      sessionsOverTimeStmt.all(...params) as {
        date: string
        count: number
      }[]
    ).map(row => ({
      timestamp: new Date(row.date).getTime(),
      value: row.count,
      label: row.date,
    }))

    // Messages over time (by day)
    const messagesOverTimeStmt = this.db.prepare(`
      SELECT
        date(m.timestamp / 1000, 'unixepoch') as date,
        COUNT(*) as count
      FROM messages m
      JOIN sessions s ON s.id = m.session_id
      WHERE ${whereClauseWithAlias}
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `)
    const messagesOverTime: TimeSeriesDataPoint[] = (
      messagesOverTimeStmt.all(...params) as {
        date: string
        count: number
      }[]
    ).map(row => ({
      timestamp: new Date(row.date).getTime(),
      value: row.count,
      label: row.date,
    }))

    // Average messages per session
    const avgMessagesStmt = this.db.prepare(`
      SELECT AVG(msg_count) as avg_messages
      FROM (
        SELECT COUNT(*) as msg_count
        FROM messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE ${whereClauseWithAlias}
        GROUP BY m.session_id
      )
    `)
    const avgMessagesResult = avgMessagesStmt.get(...params) as {
      avg_messages: number | null
    }
    const averageMessagesPerSession = avgMessagesResult.avg_messages || 0

    // Session status counts (completed, error, interrupted)
    const sessionStatusStmt = this.db.prepare(`
      SELECT
        SUM(CASE WHEN ended_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN metadata LIKE '%"error"%' OR metadata LIKE '%error%' THEN 1 ELSE 0 END) as errored,
        SUM(CASE WHEN metadata LIKE '%"interrupted"%' OR metadata LIKE '%interrupt%' THEN 1 ELSE 0 END) as interrupted
      FROM sessions
      WHERE ${whereClause}
    `)
    const sessionStatusResult = sessionStatusStmt.get(...params) as {
      completed: number | null
      errored: number | null
      interrupted: number | null
    }
    const completedSessions = sessionStatusResult.completed || 0
    const errorSessions = sessionStatusResult.errored || 0
    const interruptedSessions = sessionStatusResult.interrupted || 0

    // Agent-specific statistics
    const agentStatsStmt = this.db.prepare(`
      SELECT
        s.agent,
        COUNT(DISTINCT s.id) as session_count,
        COUNT(m.id) as message_count,
        AVG(s.duration_ms) as avg_duration,
        SUM(CASE WHEN s.ended_at IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT s.id) as success_rate
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE ${whereClauseWithAlias}
      GROUP BY s.agent
      ORDER BY session_count DESC
    `)
    const agentStatsRows = agentStatsStmt.all(...params) as {
      agent: string
      session_count: number
      message_count: number
      avg_duration: number | null
      success_rate: number | null
    }[]

    const agentStats: AgentStats[] = agentStatsRows.map(row => ({
      agent: row.agent as AgentType,
      sessionCount: row.session_count,
      messageCount: row.message_count,
      avgDurationMs: row.avg_duration || 0,
      successRate: row.success_rate || 0,
    }))

    const result: Statistics = {
      totalSessions,
      totalMessages,
      totalToolExecutions,
      averageSessionDurationMs: avgDuration,
      successRate,
      topTools,
      sessionsOverTime,
      messagesOverTime,
      averageMessagesPerSession,
      completedSessions,
      errorSessions,
      interruptedSessions,
      agentStats,
    }

    // Cache the result
    this.statisticsCache = {
      data: result,
      timestamp: Date.now(),
      key: cacheKey,
    }

    return result
  }

  /**
   * Get most used tools
   */
  getMostUsedTools(limit = 10): ToolStats[] {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(`
      SELECT
        tool_name,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        AVG(duration_ms) as avg_duration
      FROM tool_executions
      GROUP BY tool_name
      ORDER BY count DESC
      LIMIT ?
    `)

    const rows = stmt.all(limit) as {
      tool_name: string
      count: number
      success_count: number
      avg_duration: number | null
    }[]

    return rows.map(row => ({
      toolName: row.tool_name,
      count: row.count,
      successRate: row.count > 0 ? row.success_count / row.count : 0,
      averageDurationMs: row.avg_duration || 0,
    }))
  }

  // ============================================================================
  // Extended Statistics Operations (for Analytics)
  // ============================================================================

  /**
   * Get hourly usage data for heatmap visualization
   * @param daysBack Number of days to look back (default: 30)
   */
  getHourlyUsage(daysBack = 30): HourlyUsageData[] {
    if (!this.db) throw new Error('Database not initialized')

    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000

    const stmt = this.db.prepare(`
      SELECT
        CAST(strftime('%H', datetime(started_at/1000, 'unixepoch', 'localtime')) AS INTEGER) as hour,
        CAST(strftime('%w', datetime(started_at/1000, 'unixepoch', 'localtime')) AS INTEGER) as day_of_week,
        COUNT(*) as session_count
      FROM sessions
      WHERE started_at >= ?
      GROUP BY hour, day_of_week
      ORDER BY day_of_week, hour
    `)

    const rows = stmt.all(cutoff) as {
      hour: number
      day_of_week: number
      session_count: number
    }[]

    return rows.map(row => ({
      hour: row.hour,
      dayOfWeek: row.day_of_week,
      sessionCount: row.session_count,
    }))
  }

  /**
   * Get project usage statistics
   * @param limit Maximum number of projects to return (default: 10)
   */
  getProjectStats(limit = 10): ProjectUsageStats[] {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(`
      SELECT
        s.project_name,
        s.project_root,
        COUNT(DISTINCT s.id) as session_count,
        COUNT(m.id) as total_messages,
        MAX(s.started_at) as last_used,
        (
          SELECT agent FROM sessions
          WHERE project_root = s.project_root
          GROUP BY agent
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ) as favorite_agent
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE s.project_name IS NOT NULL AND s.project_root IS NOT NULL
      GROUP BY s.project_root
      ORDER BY session_count DESC
      LIMIT ?
    `)

    const rows = stmt.all(limit) as {
      project_name: string
      project_root: string
      session_count: number
      total_messages: number
      last_used: number
      favorite_agent: string
    }[]

    return rows.map(row => ({
      projectName: row.project_name,
      projectRoot: row.project_root,
      sessionCount: row.session_count,
      totalMessages: row.total_messages,
      lastUsed: row.last_used,
      favoriteAgent: row.favorite_agent as AgentType,
    }))
  }

  /**
   * Get weekly productivity trends
   * @param weeksBack Number of weeks to look back (default: 4)
   */
  getWeeklyTrends(weeksBack = 4): ProductivityTrend[] {
    if (!this.db) throw new Error('Database not initialized')

    const now = Date.now()
    const trends: ProductivityTrend[] = []

    for (let i = 0; i < weeksBack; i++) {
      const weekEnd = now - i * 7 * 24 * 60 * 60 * 1000
      const weekStart = weekEnd - 7 * 24 * 60 * 60 * 1000

      // Get session stats for this week
      const sessionStmt = this.db.prepare(`
        SELECT
          COUNT(*) as session_count,
          AVG(duration_ms) as avg_duration,
          SUM(CASE WHEN ended_at IS NOT NULL THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as completion_rate
        FROM sessions
        WHERE started_at >= ? AND started_at < ?
      `)
      const sessionResult = sessionStmt.get(weekStart, weekEnd) as {
        session_count: number
        avg_duration: number | null
        completion_rate: number | null
      }

      // Get message stats for this week
      const messageStmt = this.db.prepare(`
        SELECT AVG(msg_count) as avg_messages
        FROM (
          SELECT COUNT(*) as msg_count
          FROM messages m
          JOIN sessions s ON s.id = m.session_id
          WHERE s.started_at >= ? AND s.started_at < ?
          GROUP BY m.session_id
        )
      `)
      const messageResult = messageStmt.get(weekStart, weekEnd) as {
        avg_messages: number | null
      }

      // Get tool success rate for this week
      const toolStmt = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN t.status = 'success' THEN 1 ELSE 0 END) as success_count
        FROM tool_executions t
        JOIN sessions s ON s.id = t.session_id
        WHERE s.started_at >= ? AND s.started_at < ?
      `)
      const toolResult = toolStmt.get(weekStart, weekEnd) as {
        total: number
        success_count: number
      }

      const weekLabel =
        i === 0 ? 'This Week' : i === 1 ? 'Last Week' : `${i} weeks ago`

      trends.push({
        weekLabel,
        weekStart,
        sessionsPerDay: sessionResult.session_count / 7,
        avgMessagesPerSession: messageResult.avg_messages || 0,
        toolSuccessRate:
          toolResult.total > 0
            ? toolResult.success_count / toolResult.total
            : 0,
        completionRate: sessionResult.completion_rate || 0,
      })
    }

    return trends
  }

  /**
   * Get tool failure patterns
   * @param limit Maximum number of tools to return (default: 5)
   */
  getFailurePatterns(limit = 5): FailurePattern[] {
    if (!this.db) throw new Error('Database not initialized')

    const now = Date.now()
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000

    // Get tools with most failures
    const stmt = this.db.prepare(`
      SELECT
        t.tool_name,
        SUM(CASE WHEN t.status = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN t.status = 'denied' THEN 1 ELSE 0 END) as denied_count,
        COUNT(DISTINCT t.session_id) as affected_sessions
      FROM tool_executions t
      JOIN sessions s ON s.id = t.session_id
      WHERE s.started_at >= ?
        AND (t.status = 'error' OR t.status = 'denied')
      GROUP BY t.tool_name
      HAVING error_count + denied_count > 0
      ORDER BY error_count + denied_count DESC
      LIMIT ?
    `)

    const rows = stmt.all(twoWeeksAgo, limit) as {
      tool_name: string
      error_count: number
      denied_count: number
      affected_sessions: number
    }[]

    // Prepare statements for trend calculation
    const db = this.db
    const lastWeekStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM tool_executions t
      JOIN sessions s ON s.id = t.session_id
      WHERE t.tool_name = ?
        AND s.started_at >= ? AND s.started_at < ?
        AND (t.status = 'error' OR t.status = 'denied')
    `)
    const thisWeekStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM tool_executions t
      JOIN sessions s ON s.id = t.session_id
      WHERE t.tool_name = ?
        AND s.started_at >= ?
        AND (t.status = 'error' OR t.status = 'denied')
    `)

    // Calculate trend for each tool
    return rows.map(row => {
      const lastWeekResult = lastWeekStmt.get(
        row.tool_name,
        twoWeeksAgo,
        oneWeekAgo
      ) as { count: number }

      const thisWeekResult = thisWeekStmt.get(row.tool_name, oneWeekAgo) as {
        count: number
      }

      let trend: 'improving' | 'worsening' | 'stable' = 'stable'
      if (thisWeekResult.count < lastWeekResult.count * 0.8) {
        trend = 'improving'
      } else if (thisWeekResult.count > lastWeekResult.count * 1.2) {
        trend = 'worsening'
      }

      return {
        toolName: row.tool_name,
        errorCount: row.error_count,
        deniedCount: row.denied_count,
        affectedSessions: row.affected_sessions,
        trend,
      }
    })
  }

  /**
   * Get week-over-week comparison metrics
   */
  getWeekComparison(): WeekComparison {
    if (!this.db) throw new Error('Database not initialized')

    const now = Date.now()
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000

    // This week stats
    const thisWeekStmt = this.db.prepare(`
      SELECT
        COUNT(*) as sessions,
        SUM(duration_ms) as total_duration,
        SUM(CASE WHEN ended_at IS NOT NULL THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate
      FROM sessions
      WHERE started_at >= ?
    `)
    const thisWeek = thisWeekStmt.get(oneWeekAgo) as {
      sessions: number
      total_duration: number | null
      success_rate: number | null
    }

    const thisWeekMsgStmt = this.db.prepare(`
      SELECT COUNT(*) as messages
      FROM messages m
      JOIN sessions s ON s.id = m.session_id
      WHERE s.started_at >= ?
    `)
    const thisWeekMsg = thisWeekMsgStmt.get(oneWeekAgo) as { messages: number }

    // Last week stats
    const lastWeekStmt = this.db.prepare(`
      SELECT
        COUNT(*) as sessions,
        SUM(duration_ms) as total_duration,
        SUM(CASE WHEN ended_at IS NOT NULL THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate
      FROM sessions
      WHERE started_at >= ? AND started_at < ?
    `)
    const lastWeek = lastWeekStmt.get(twoWeeksAgo, oneWeekAgo) as {
      sessions: number
      total_duration: number | null
      success_rate: number | null
    }

    const lastWeekMsgStmt = this.db.prepare(`
      SELECT COUNT(*) as messages
      FROM messages m
      JOIN sessions s ON s.id = m.session_id
      WHERE s.started_at >= ? AND s.started_at < ?
    `)
    const lastWeekMsg = lastWeekMsgStmt.get(twoWeeksAgo, oneWeekAgo) as {
      messages: number
    }

    // Calculate percentage changes
    const calcChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0
      return ((current - previous) / previous) * 100
    }

    return {
      sessionsChange: calcChange(thisWeek.sessions, lastWeek.sessions),
      messagesChange: calcChange(thisWeekMsg.messages, lastWeekMsg.messages),
      durationChange: calcChange(
        thisWeek.total_duration || 0,
        lastWeek.total_duration || 0
      ),
      successRateChange:
        ((thisWeek.success_rate || 0) - (lastWeek.success_rate || 0)) * 100,
    }
  }

  /**
   * Get extended statistics including productivity and usage patterns
   */
  getExtendedStatistics(timeRange?: {
    start: number
    end: number
  }): ExtendedStatistics {
    // Get base statistics
    const baseStats = this.getStatistics(timeRange)

    // Get extended data
    const hourlyUsage = this.getHourlyUsage(30)
    const projectStats = this.getProjectStats(10)
    const weeklyTrends = this.getWeeklyTrends(4)
    const failurePatterns = this.getFailurePatterns(5)
    const thisWeekVsLastWeek = this.getWeekComparison()

    // Calculate peak hour and day
    let peakHour = 0
    let peakDayOfWeek = 0
    let maxSessions = 0

    for (const data of hourlyUsage) {
      if (data.sessionCount > maxSessions) {
        maxSessions = data.sessionCount
        peakHour = data.hour
        peakDayOfWeek = data.dayOfWeek
      }
    }

    return {
      ...baseStats,
      hourlyUsage,
      peakHour,
      peakDayOfWeek,
      projectStats,
      weeklyTrends,
      thisWeekVsLastWeek,
      failurePatterns,
    }
  }

  // ============================================================================
  // Maintenance Operations
  // ============================================================================

  /**
   * Clean up stale "ongoing" sessions that were never properly ended
   * This can happen when the app crashes or sessions are not properly tracked
   * @param maxAgeHours Maximum age in hours for ongoing sessions (default: 24)
   * @returns Number of sessions cleaned up
   */
  cleanupOngoingSessions(maxAgeHours = 24): number {
    if (!this.db) throw new Error('Database not initialized')

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000

    // Find ongoing sessions older than cutoff
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET ended_at = started_at + 1000,
          duration_ms = 1000
      WHERE ended_at IS NULL
        AND started_at < ?
    `)

    const result = stmt.run(cutoff)

    if (result.changes > 0) {
      devLog.log(
        `[HistoryStore] Cleaned up ${result.changes} stale ongoing sessions`
      )
    }

    return result.changes
  }

  /**
   * Delete old sessions based on retention policy
   */
  cleanup(options: { maxAgeDays?: number; maxSessions?: number }): number {
    if (!this.db) throw new Error('Database not initialized')

    let deletedCount = 0

    // Delete by age
    if (options.maxAgeDays) {
      const cutoff = Date.now() - options.maxAgeDays * 24 * 60 * 60 * 1000
      const stmt = this.db.prepare('DELETE FROM sessions WHERE started_at < ?')
      const result = stmt.run(cutoff)
      deletedCount += result.changes
    }

    // Delete oldest sessions if over limit
    if (options.maxSessions) {
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as count FROM sessions'
      )
      const { count } = countStmt.get() as { count: number }

      if (count > options.maxSessions) {
        const toDelete = count - options.maxSessions
        const stmt = this.db.prepare(`
          DELETE FROM sessions WHERE id IN (
            SELECT id FROM sessions ORDER BY started_at ASC LIMIT ?
          )
        `)
        const result = stmt.run(toDelete)
        deletedCount += result.changes
      }
    }

    if (deletedCount > 0) {
      devLog.log(`[HistoryStore] Cleaned up ${deletedCount} sessions`)
    }

    return deletedCount
  }

  /**
   * Optimize the database
   */
  vacuum(): void {
    if (!this.db) throw new Error('Database not initialized')
    this.db.exec('VACUUM')
    devLog.log('[HistoryStore] Database vacuumed')
  }

  /**
   * Get database file size in bytes
   */
  getDatabaseSize(): number {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(
      'SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()'
    )
    const result = stmt.get() as { size: number }
    return result.size
  }

  // ============================================================================
  // Prompt Insights Operations
  // ============================================================================

  /**
   * Get frequently used prompts from user messages
   * @param daysBack Number of days to look back (default: 30)
   * @param minCount Minimum number of occurrences to count as "frequent" (default: 3)
   * @param agentFilter Optional agent filter
   */
  getFrequentPrompts(
    daysBack = 30,
    minCount = 3,
    agentFilter?: AgentType
  ): FrequentPrompt[] {
    if (!this.db) throw new Error('Database not initialized')

    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000

    // Build query with optional agent filter
    // Filter out system messages and non-user content
    let sql = `
      SELECT
        m.content,
        COUNT(*) as count,
        GROUP_CONCAT(DISTINCT s.agent) as agents,
        MAX(m.timestamp) as last_used
      FROM messages m
      JOIN sessions s ON s.id = m.session_id
      WHERE m.role = 'user'
        AND m.timestamp > ?
        AND LENGTH(m.content) > 20
        AND m.content NOT LIKE '[Tool:%'
        AND m.content NOT LIKE 'User submitted prompt%'
        AND m.content NOT LIKE '[Request interrupted%'
        AND m.content NOT LIKE '<%'
        AND m.content NOT LIKE 'Session %'
    `
    const params: unknown[] = [cutoff]

    if (agentFilter) {
      sql += ' AND s.agent = ?'
      params.push(agentFilter)
    }

    sql += `
      GROUP BY m.content
      HAVING count >= ?
      ORDER BY count DESC
      LIMIT 100
    `
    params.push(minCount)

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(...params) as Array<{
      content: string
      count: number
      agents: string
      last_used: number
    }>

    return rows.map(row => ({
      content: row.content,
      count: row.count,
      agents: row.agents.split(',') as AgentType[],
      lastUsed: row.last_used,
    }))
  }

  /**
   * Get frequently used prompts grouped by mode
   * @param daysBack Number of days to look back (default: 30)
   * @param minCount Minimum number of occurrences (default: 1 for grouping)
   * @param agentFilter Optional agent filter
   * @param groupingMode Grouping mode: 'exact', 'similar', or 'semantic'
   * @param options Additional options for grouping
   */
  /**
   * Invalidate the enhanced prompts cache
   * Should be called when new sessions or messages are added
   */
  invalidateEnhancedPromptsCache(): void {
    this.enhancedPromptsCache = null
  }

  /**
   * Get enhanced prompts combining curated + user frequent prompts
   * Uses caching to avoid expensive recalculation on each call
   * @param daysBack - Number of days to look back for user prompts
   * @param minCount - Minimum count for frequent prompts
   * @param agentFilter - Optional agent filter
   * @param includeUserPrompts - Whether to include user's frequent prompts
   */
  async getEnhancedPrompts(
    daysBack = 30,
    minCount = 3,
    agentFilter?: AgentType,
    includeUserPrompts = true
  ): Promise<EnhancedPromptGroup[]> {
    const now = Date.now()

    // Check cache first
    if (
      this.enhancedPromptsCache &&
      now - this.enhancedPromptsCache.timestamp <
        HistoryStore.ENHANCED_PROMPTS_CACHE_TTL &&
      this.enhancedPromptsCache.agentFilter === agentFilter &&
      this.enhancedPromptsCache.daysBack === daysBack &&
      this.enhancedPromptsCache.minCount === minCount
    ) {
      return this.enhancedPromptsCache.data
    }

    const results: EnhancedPromptGroup[] = []

    // 1. Add curated prompts (filtered by agent if specified)
    for (const curated of CURATED_PROMPTS) {
      if (agentFilter && !curated.recommendedAgents.includes(agentFilter)) {
        continue
      }

      results.push({
        representative: curated.content,
        variants: [
          {
            content: curated.content,
            count: 0, // Not from user history
          },
        ],
        totalCount: 0,
        agents: curated.recommendedAgents,
        lastUsed: 0,
        groupedBy: 'exact',
        isCurated: true,
        curatedId: curated.id,
        category: curated.category,
        priority: curated.priority,
      })
    }

    // 2. Get user's frequent prompts
    if (includeUserPrompts) {
      const userPrompts = this.getFrequentPrompts(
        daysBack,
        minCount,
        agentFilter
      )

      if (userPrompts.length > 0) {
        // Auto-select grouping mode (uses fast Jaccard similarity now)
        const smartOptions = selectSmartGroupingMode(userPrompts)
        const groupedUser = await groupPrompts(
          userPrompts,
          smartOptions.recommendedMode
          // Uses default threshold (0.5 for Jaccard)
        )

        // Add all user prompts (no limit)
        for (const group of groupedUser) {
          results.push({
            ...group,
            isCurated: false,
            priority: 5, // Medium priority for user prompts
          })
        }
      }
    }

    // 3. Sort by priority (curated first, then by usage)
    results.sort((a, b) => {
      if (a.isCurated && !b.isCurated) return -1
      if (!a.isCurated && b.isCurated) return 1
      if (a.priority !== b.priority)
        return (b.priority || 0) - (a.priority || 0)
      return b.totalCount - a.totalCount
    })

    // Store in cache
    this.enhancedPromptsCache = {
      data: results,
      timestamp: now,
      agentFilter,
      daysBack,
      minCount,
    }

    return results
  }

  async getGroupedPrompts(
    daysBack = 30,
    minCount = 1,
    agentFilter?: AgentType,
    groupingMode: GroupingMode = 'exact',
    options?: {
      similarityThreshold?: number
      aiProvider?: AIProvider
      apiKey?: string
    }
  ): Promise<GroupedPrompt[]> {
    // Get raw prompts first
    const rawPrompts = this.getFrequentPrompts(daysBack, minCount, agentFilter)

    // Group using the prompt normalizer
    const grouped = await groupPrompts(rawPrompts, groupingMode, options)

    // Limit to top 50 groups
    return grouped.slice(0, 50)
  }

  // ============================================================================
  // Re-sync Operations
  // ============================================================================

  /**
   * Re-sync sessions from JSONL files
   * Scans ~/.claude/projects/ and imports missing sessions
   */
  async resyncSessions(): Promise<{
    scanned: number
    imported: number
    skipped: number
    errors: number
  }> {
    if (!this.db) throw new Error('Database not initialized')

    // Import here to avoid circular dependency
    const { scanAllJsonlFiles, extractSessionMetadata, parseJsonlFile } =
      await import('../history/jsonl-parser')

    const result = {
      scanned: 0,
      imported: 0,
      skipped: 0,
      errors: 0,
    }

    devLog.log('[HistoryStore] Starting re-sync...')

    // Scan all JSONL files
    const jsonlFiles = scanAllJsonlFiles()
    result.scanned = jsonlFiles.length

    devLog.log(`[HistoryStore] Found ${jsonlFiles.length} JSONL files`)

    for (const file of jsonlFiles) {
      try {
        // Check if session already exists
        if (this.hasSession(file.sessionId)) {
          result.skipped++
          continue
        }

        // Extract metadata from JSONL
        const metadata = await extractSessionMetadata(file.jsonlPath)
        if (!metadata) {
          devLog.log(
            `[HistoryStore] Could not extract metadata from ${file.sessionId.slice(0, 8)}`
          )
          result.errors++
          continue
        }

        // Detect project root
        const { projectRoot, projectName } = detectProjectRoot(metadata.cwd)

        // Detect git branch (may be null if old session or not git repo)
        const { branch: gitBranch } = detectGitBranch(metadata.cwd)

        // Create session
        this.createSession({
          id: metadata.sessionId,
          agent: 'claude', // JSONL files are from Claude
          cwd: metadata.cwd,
          displayTitle: this.extractDisplayTitle(
            metadata.firstUserPrompt,
            metadata.cwd
          ),
          sessionSummary: null,
          firstUserPrompt: metadata.firstUserPrompt,
          projectRoot,
          projectName,
          gitBranch,
          startedAt: metadata.startedAt,
          endedAt: file.modifiedAt, // Use file modification time as end time
          durationMs: file.modifiedAt - metadata.startedAt,
          isInTmux: false,
          tmuxSession: null,
          tmuxWindow: null,
          tmuxPane: null,
          metadata: null,
        })

        // Parse and import messages
        const { entries, toolExecutions } = await parseJsonlFile(
          file.jsonlPath,
          metadata.sessionId
        )

        // Add messages
        const messages = entries
          .filter(entry => entry.role === 'user' || entry.role === 'assistant')
          .map(entry => ({
            role: entry.role as MessageRole,
            content: entry.content,
            contentPreview: entry.contentPreview,
            timestamp: entry.timestamp,
            jsonlPath: entry.jsonlPath,
            jsonlOffset: entry.jsonlOffset,
            jsonlLength: entry.jsonlLength,
            metadata: entry.toolName
              ? { toolName: entry.toolName, toolUseId: entry.toolUseId }
              : undefined,
          }))

        if (messages.length > 0) {
          this.addMessagesFromJsonl(metadata.sessionId, messages)
        }

        // Add tool executions
        for (const tool of toolExecutions) {
          if (tool.toolUseId) {
            this.addToolExecution({
              sessionId: metadata.sessionId,
              toolUseId: tool.toolUseId,
              toolName: tool.toolName,
              toolInput: tool.toolInput,
              toolOutput: tool.toolOutput || null,
              status: 'success',
              startedAt: tool.timestamp,
              completedAt: tool.timestamp,
              durationMs: null,
            })
          }
        }

        result.imported++
        devLog.log(
          `[HistoryStore] Imported session ${metadata.sessionId.slice(0, 8)} with ${messages.length} messages`
        )
      } catch (error) {
        devLog.error(
          `[HistoryStore] Error importing ${file.sessionId.slice(0, 8)}:`,
          error
        )
        result.errors++
      }
    }

    devLog.log(
      `[HistoryStore] Re-sync complete: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`
    )

    return result
  }

  /**
   * Extract display title from first user prompt or cwd
   */
  private extractDisplayTitle(firstPrompt: string | null, cwd: string): string {
    if (firstPrompt) {
      // Use first line or first 50 chars of prompt
      const firstLine = firstPrompt.split('\n')[0].trim()
      if (firstLine.length > 50) {
        return `${firstLine.slice(0, 47)}...`
      }
      return firstLine
    }

    // Fallback to folder name
    const parts = cwd.split('/')
    return parts[parts.length - 1] || cwd
  }
}

// Singleton instance
export const historyStore = new HistoryStore()
