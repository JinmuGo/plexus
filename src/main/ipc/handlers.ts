import { ipcMain, type BrowserWindow } from 'electron'
import { sessionStore } from '../store/sessions'
import { activityLogStore } from '../store/activity-log'
import { historyStore } from '../store/history'
import { costStore } from '../store/cost-store'
import { themeStore } from '../store/theme'
import { notificationSettingsStore } from '../store/notification-settings'
import {
  getRendererConfig,
  getConfig,
  setFeatureFlagOverride,
  removeFeatureFlagOverride,
  getFeatureFlagOverrides,
} from '../config'
import type { FeatureFlagName, FeatureFlags } from 'shared/config'
import type { Theme } from 'shared/theme-types'
import type { NotificationSettings } from 'shared/notification-types'
import type { AgentSession } from 'shared/ipc-protocol'
import type {
  ClaudeSession,
  SessionActivityEntry,
  PermissionDecision,
  AutoAllowEntry,
  AgentPermissionCapabilities,
} from 'shared/hook-types'
import { AGENT_CAPABILITIES } from 'shared/hook-types'
import type {
  HistorySession,
  HistoryMessage,
  ToolExecution,
  SearchFilters,
  SearchResult,
  QueryOptions,
  Statistics,
  ExtendedStatistics,
  SessionWithMessages,
  FrequentPrompt,
  GroupedPrompt,
  EnhancedPromptGroup,
  GroupingMode,
  AIProvider,
  PromptImprovement,
  HourlyUsageData,
  ProjectUsageStats,
  ProductivityTrend,
  FailurePattern,
} from 'shared/history-types'
import {
  respondToPermissionBySession,
  getPendingPermission,
  getHITLRequest,
  type PermissionResponseOptions,
} from '../hooks/hook-socket-server'
import { autoAllowStore } from '../store/auto-allow-store'
import type { HITLRequest } from 'shared/hitl-types'
import {
  focusPane,
  focusByTty,
  focusCursor,
  sendInterrupt,
} from '../tmux/target-finder'
import {
  getFullContent,
  parseJsonlFile,
  getJsonlPath,
  type ParsedConversationEntry,
  type ParsedToolExecution,
  type ParsedThinkingBlock,
} from '../history/jsonl-parser'
import {
  improvePrompt,
  setApiKey,
  getApiKey,
  hasApiKey,
  removeApiKey,
  getSettings,
  saveSettings,
  getSavedPrompts,
  savePrompt,
  deleteSavedPrompt,
} from '../ai/prompt-improver'
import type { AISettings, SavedPrompt } from 'shared/history-types'
import type { AgentType } from 'shared/hook-types'
import type {
  CostStatistics,
  DailyCost,
  CostBreakdown,
  SessionCost,
  TimeRange,
} from 'shared/cost-types'
import type { IntegrationSettings } from 'shared/integration-types'
import { integrationSettingsStore } from '../store/integration-settings'
import { slackWebhook, discordWebhook } from '../webhooks'
import { JSONL_CACHE_TTL_MS } from '../constants/ipc'

// Interface for socket server to avoid circular dependency
interface SocketServer {
  sendStdin: (sessionId: string, data: string, raw?: boolean) => boolean
  sendResize: (sessionId: string, cols: number, rows: number) => boolean
  sendKill: (sessionId: string, signal: 'SIGTERM' | 'SIGKILL') => boolean
}

// Cache for JSONL parsing to prevent duplicate calls (especially from React StrictMode)
interface JsonlCacheEntry {
  data: {
    entries: ParsedConversationEntry[]
    toolExecutions: ParsedToolExecution[]
    thinkingBlocks: ParsedThinkingBlock[]
  }
  timestamp: number
}

const jsonlParseCache = new Map<string, JsonlCacheEntry>()

function getJsonlFromCache(sessionId: string): JsonlCacheEntry['data'] | null {
  const entry = jsonlParseCache.get(sessionId)
  if (!entry) return null

  // Check if cache is still valid
  if (Date.now() - entry.timestamp > JSONL_CACHE_TTL_MS) {
    jsonlParseCache.delete(sessionId)
    return null
  }

  return entry.data
}

function setJsonlCache(sessionId: string, data: JsonlCacheEntry['data']): void {
  jsonlParseCache.set(sessionId, {
    data,
    timestamp: Date.now(),
  })
}

/**
 * Register IPC handlers for renderer communication
 */
export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  socketServer: SocketServer
): void {
  // Get all active sessions (legacy - returns empty for now, use claudeSessions instead)
  ipcMain.handle('sessions:getAll', (): AgentSession[] => {
    // Legacy API - return empty array, use claudeSessions:getAll instead
    return []
  })

  // Get session output buffer (legacy - not available in hook-based system)
  ipcMain.handle(
    'sessions:getOutput',
    (_: unknown, _sessionId: string): string[] => {
      // Legacy API - return empty array
      return []
    }
  )

  // Get session count
  ipcMain.handle('sessions:getCount', (): number => {
    return sessionStore.getCount()
  })

  // Send stdin to a session
  ipcMain.handle(
    'sessions:stdin',
    (_, sessionId: string, data: string, raw?: boolean): boolean => {
      // Validate session exists
      const session = sessionStore.get(sessionId)
      if (!session) {
        return false
      }

      return socketServer.sendStdin(sessionId, data, raw)
    }
  )

  // Send resize to a session
  ipcMain.handle(
    'sessions:resize',
    (_, sessionId: string, cols: number, rows: number): boolean => {
      return socketServer.sendResize(sessionId, cols, rows)
    }
  )

  // Kill a session
  ipcMain.handle(
    'sessions:kill',
    (
      _,
      sessionId: string,
      signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'
    ): boolean => {
      // Validate session exists
      const session = sessionStore.get(sessionId)
      if (!session) {
        return false
      }

      return socketServer.sendKill(sessionId, signal)
    }
  )

  // Subscribe to session updates - forward events to renderer
  sessionStore.subscribe(event => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Forward claude session events
      mainWindow.webContents.send('claudeSessions:event', event)

      // Also forward permission-specific events
      if (event.type === 'permissionRequest' && event.permissionContext) {
        mainWindow.webContents.send('permission:request', {
          sessionId: event.session.id,
          context: event.permissionContext,
        })
      } else if (
        event.type === 'permissionResolved' &&
        event.session.activePermission
      ) {
        mainWindow.webContents.send('permission:resolved', {
          sessionId: event.session.id,
          toolUseId: event.session.activePermission.toolUseId,
        })
      }
    }
  })

  // Permission handlers (Hook-based)
  ipcMain.handle('permission:approve', (_, sessionId: string): boolean => {
    const session = sessionStore.get(sessionId)
    if (!session) {
      console.warn(
        `[IPC] Cannot approve permission: session ${sessionId.slice(0, 8)} not found`
      )
      return false
    }

    respondToPermissionBySession(sessionId, 'allow')
    console.log(
      `[IPC] Permission approved for session ${sessionId.slice(0, 8)}`
    )
    return true
  })

  ipcMain.handle(
    'permission:deny',
    (_, sessionId: string, reason?: string): boolean => {
      const session = sessionStore.get(sessionId)
      if (!session) {
        console.warn(
          `[IPC] Cannot deny permission: session ${sessionId.slice(0, 8)} not found`
        )
        return false
      }

      respondToPermissionBySession(sessionId, 'deny', { reason })
      console.log(
        `[IPC] Permission denied for session ${sessionId.slice(0, 8)}`
      )
      return true
    }
  )

  // Extended permission response handler
  ipcMain.handle(
    'permission:respond',
    (
      _,
      sessionId: string,
      decision: PermissionDecision,
      options?: PermissionResponseOptions
    ): boolean => {
      const session = sessionStore.get(sessionId)
      if (!session) {
        console.warn(
          `[IPC] Cannot respond to permission: session ${sessionId.slice(0, 8)} not found`
        )
        return false
      }

      // Handle auto-allow-session: add to store and respond with allow
      if (decision === 'auto-allow-session' && session.activePermission) {
        const toolName = session.activePermission.toolName
        autoAllowStore.addAutoAllow(sessionId, toolName)
        respondToPermissionBySession(sessionId, 'allow')
        console.log(
          `[IPC] Auto-allowed '${toolName}' for session ${sessionId.slice(0, 8)}`
        )
        return true
      }

      // Map Plexus decision to agent-compatible decision
      const agentDecision =
        decision === 'auto-allow-session' ? 'allow' : decision
      respondToPermissionBySession(
        sessionId,
        agentDecision as 'allow' | 'deny' | 'ask' | 'block',
        options
      )
      console.log(
        `[IPC] Permission ${decision} for session ${sessionId.slice(0, 8)}`
      )
      return true
    }
  )

  // Get auto-allowed tools for a session
  ipcMain.handle(
    'permission:getAutoAllowed',
    (_, sessionId: string): AutoAllowEntry[] => {
      return autoAllowStore.getAutoAllowedTools(sessionId)
    }
  )

  // Remove an auto-allow entry
  ipcMain.handle(
    'permission:removeAutoAllow',
    (_, sessionId: string, toolName: string): boolean => {
      return autoAllowStore.removeAutoAllow(sessionId, toolName)
    }
  )

  // Get agent permission capabilities
  ipcMain.handle(
    'permission:getCapabilities',
    (_, agentType: AgentType): AgentPermissionCapabilities => {
      return AGENT_CAPABILITIES[agentType]
    }
  )

  ipcMain.handle(
    'permission:getPending',
    (
      _,
      sessionId: string
    ): {
      toolName: string
      toolId: string
      toolInput?: Record<string, unknown>
    } | null => {
      return getPendingPermission(sessionId)
    }
  )

  ipcMain.handle(
    'permission:getHITLRequest',
    (_, sessionId: string): HITLRequest | null => {
      return getHITLRequest(sessionId)
    }
  )

  // Claude session handlers (Hook-based)
  ipcMain.handle('claudeSessions:getAll', (): ClaudeSession[] => {
    return sessionStore.getAll()
  })

  ipcMain.handle(
    'claudeSessions:get',
    (_, sessionId: string): ClaudeSession | undefined => {
      return sessionStore.get(sessionId)
    }
  )

  ipcMain.handle('claudeSessions:getCount', (): number => {
    return sessionStore.getCount()
  })

  ipcMain.handle('claudeSessions:getSorted', (): ClaudeSession[] => {
    return sessionStore.getSortedSessions()
  })

  // Terminate a Claude session (Hook-based)
  ipcMain.handle(
    'claudeSessions:terminate',
    async (
      _,
      sessionId: string,
      signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'
    ): Promise<boolean> => {
      const success = await sessionStore.terminate(sessionId, signal)
      if (success) {
        console.log(
          `[IPC] Session ${sessionId.slice(0, 8)} terminated with ${signal}`
        )
        // Add activity log entry
        activityLogStore.addEntry(sessionId, {
          id: `terminate-${Date.now()}`,
          timestamp: Date.now(),
          type: 'session_end',
          message: `Session terminated (${signal})`,
        })
      }
      return success
    }
  )

  // Remove a session from the store (manual cleanup)
  ipcMain.handle('claudeSessions:remove', (_, sessionId: string): boolean => {
    sessionStore.remove(sessionId)
    console.log(`[IPC] Session ${sessionId.slice(0, 8)} removed from store`)
    return true
  })

  // Activity Log handlers
  ipcMain.handle(
    'activity:getLog',
    (_, sessionId: string): SessionActivityEntry[] => {
      return activityLogStore.getEntries(sessionId)
    }
  )

  // Subscribe to activity log updates and forward to renderer
  activityLogStore.subscribe((sessionId, entry) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('activity:new', { sessionId, entry })
    }
  })

  // Session focus handlers (supports tmux, TTY, and IDE sessions)
  ipcMain.handle(
    'tmux:focus',
    async (_, sessionId: string): Promise<boolean> => {
      const session = sessionStore.get(sessionId)
      if (!session) return false

      // Try tmux focus first if available
      if (session.isInTmux && session.tmuxTarget) {
        const result = await focusPane(session.tmuxTarget)
        if (result) return true
      }

      // Try TTY-based focus (works for terminal apps)
      if (session.tty) {
        const result = await focusByTty(session.tty)
        if (result) return true
      }

      // For Cursor agent sessions (no TTY), use cursor CLI with cwd
      if (session.agent === 'cursor' && session.cwd) {
        const result = await focusCursor(session.cwd)
        if (result) return true
      }

      return false
    }
  )

  ipcMain.handle(
    'session:interrupt',
    async (_, sessionId: string): Promise<boolean> => {
      const session = sessionStore.get(sessionId)
      if (!session?.tmuxTarget) {
        console.warn(
          `[IPC] Cannot interrupt: session ${sessionId.slice(0, 8)} not found or not in tmux`
        )
        return false
      }

      const result = await sendInterrupt(session.tmuxTarget)
      if (result) {
        console.log(`[IPC] Sent interrupt to session ${sessionId.slice(0, 8)}`)
        // Add activity log entry
        activityLogStore.addEntry(sessionId, {
          id: `interrupt-${Date.now()}`,
          timestamp: Date.now(),
          type: 'phase_change',
          message: 'Session interrupted (Ctrl+C)',
        })
      }
      return result
    }
  )

  // ============================================================================
  // History Handlers
  // ============================================================================

  // Search history messages
  ipcMain.handle(
    'history:search',
    (
      _,
      query: string,
      filters?: SearchFilters,
      limit?: number
    ): SearchResult[] => {
      return historyStore.searchMessages(query, filters, limit)
    }
  )

  // Get a history session by ID
  ipcMain.handle(
    'history:getSession',
    (_, sessionId: string): HistorySession | null => {
      return historyStore.getSession(sessionId)
    }
  )

  // Get all history sessions with optional filtering
  ipcMain.handle(
    'history:getSessions',
    (_, options?: QueryOptions): HistorySession[] => {
      return historyStore.getSessions(options)
    }
  )

  // Get messages for a session
  ipcMain.handle(
    'history:getMessages',
    (
      _,
      sessionId: string,
      options?: { limit?: number; offset?: number }
    ): HistoryMessage[] => {
      return historyStore.getMessages(sessionId, options)
    }
  )

  // Get tool executions for a session
  ipcMain.handle(
    'history:getToolExecutions',
    (_, sessionId: string): ToolExecution[] => {
      return historyStore.getToolExecutions(sessionId)
    }
  )

  // Get session with all messages and tool executions
  ipcMain.handle(
    'history:getSessionWithMessages',
    (_, sessionId: string): SessionWithMessages | null => {
      const session = historyStore.getSession(sessionId)
      if (!session) return null

      return {
        session,
        messages: historyStore.getMessages(sessionId),
        toolExecutions: historyStore.getToolExecutions(sessionId),
        thinkingBlocks: [], // Thinking blocks are parsed from JSONL, not stored in DB
      }
    }
  )

  // Get statistics
  ipcMain.handle(
    'history:getStatistics',
    (_, timeRange?: { start: number; end: number }): Statistics => {
      return historyStore.getStatistics(timeRange)
    }
  )

  // Get extended statistics for analytics
  ipcMain.handle(
    'history:getExtendedStatistics',
    (_, timeRange?: { start: number; end: number }): ExtendedStatistics => {
      return historyStore.getExtendedStatistics(timeRange)
    }
  )

  // Get hourly usage for heatmap
  ipcMain.handle(
    'history:getHourlyUsage',
    (_, daysBack?: number): HourlyUsageData[] => {
      return historyStore.getHourlyUsage(daysBack)
    }
  )

  // Get project statistics
  ipcMain.handle(
    'history:getProjectStats',
    (_, limit?: number): ProjectUsageStats[] => {
      return historyStore.getProjectStats(limit)
    }
  )

  // Get weekly productivity trends
  ipcMain.handle(
    'history:getWeeklyTrends',
    (_, weeksBack?: number): ProductivityTrend[] => {
      return historyStore.getWeeklyTrends(weeksBack)
    }
  )

  // Get failure patterns
  ipcMain.handle(
    'history:getFailurePatterns',
    (_, limit?: number): FailurePattern[] => {
      return historyStore.getFailurePatterns(limit)
    }
  )

  // Delete a history session
  ipcMain.handle('history:deleteSession', (_, sessionId: string): boolean => {
    try {
      historyStore.deleteSession(sessionId)
      return true
    } catch {
      return false
    }
  })

  // Cleanup old sessions
  ipcMain.handle(
    'history:cleanup',
    (_, options: { maxAgeDays?: number; maxSessions?: number }): number => {
      return historyStore.cleanup(options)
    }
  )

  // Get full content for a message from JSONL (on-demand loading)
  ipcMain.handle(
    'history:getFullContent',
    async (
      _,
      messageId: string
    ): Promise<{ content: string | null; error?: string }> => {
      try {
        const message = historyStore.getMessage(messageId)
        if (!message) {
          return { content: null, error: 'Message not found' }
        }

        // If no JSONL reference, return stored content
        if (
          !message.jsonlPath ||
          message.jsonlOffset === null ||
          message.jsonlLength === null
        ) {
          return { content: message.content }
        }

        // Load full content from JSONL
        const fullContent = await getFullContent(
          message.jsonlPath,
          message.jsonlOffset,
          message.jsonlLength
        )

        return { content: fullContent || message.content }
      } catch (error) {
        console.error('[IPC] Error getting full content:', error)
        return {
          content: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }
  )

  // Get database size
  ipcMain.handle('history:getDatabaseSize', (): number => {
    return historyStore.getDatabaseSize()
  })

  // Vacuum database
  ipcMain.handle('history:vacuum', (): boolean => {
    try {
      historyStore.vacuum()
      return true
    } catch {
      return false
    }
  })

  // Re-sync sessions from JSONL files
  ipcMain.handle(
    'history:resync',
    async (): Promise<{
      scanned: number
      imported: number
      skipped: number
      errors: number
    }> => {
      return historyStore.resyncSessions()
    }
  )

  // Parse JSONL file for replay (gets user/assistant messages directly from JSONL)
  ipcMain.handle(
    'history:parseJsonlForReplay',
    async (
      _,
      sessionId: string
    ): Promise<{
      entries: ParsedConversationEntry[]
      toolExecutions: ParsedToolExecution[]
      thinkingBlocks: ParsedThinkingBlock[]
    } | null> => {
      try {
        // Check cache first (prevents duplicate parsing from React StrictMode or multiple components)
        const cached = getJsonlFromCache(sessionId)
        if (cached) {
          console.log(
            `[IPC] JSONL cache hit for session ${sessionId.slice(0, 8)}: ${cached.entries.length} entries, ${cached.toolExecutions.length} tools, ${cached.thinkingBlocks.length} thinking`
          )
          return cached
        }

        // First, get session to find cwd
        const session = historyStore.getSession(sessionId)
        if (!session) {
          console.warn(
            `[IPC] Session ${sessionId.slice(0, 8)} not found for replay`
          )
          return null
        }

        // Find JSONL file
        const jsonlPath = getJsonlPath(session.cwd, sessionId)
        if (!jsonlPath) {
          console.warn(
            `[IPC] JSONL file not found for session ${sessionId.slice(0, 8)}`
          )
          return null
        }

        // Parse JSONL
        const result = await parseJsonlFile(jsonlPath, sessionId)
        console.log(
          `[IPC] Parsed JSONL for replay: ${result.entries.length} entries, ${result.toolExecutions.length} tools, ${result.thinkingBlocks.length} thinking`
        )

        // Cache the result
        setJsonlCache(sessionId, result)

        return result
      } catch (error) {
        console.error('[IPC] Error parsing JSONL for replay:', error)
        return null
      }
    }
  )

  // ============================================================================
  // Prompt Insights Handlers
  // ============================================================================

  // Get frequently used prompts
  ipcMain.handle(
    'history:getFrequentPrompts',
    (
      _,
      daysBack: number,
      minCount: number,
      agentFilter?: AgentType
    ): FrequentPrompt[] => {
      return historyStore.getFrequentPrompts(daysBack, minCount, agentFilter)
    }
  )

  // Get enhanced prompts (curated + user frequent)
  ipcMain.handle(
    'history:getEnhancedPrompts',
    async (
      _,
      daysBack: number,
      minCount: number,
      agentFilter: AgentType | undefined,
      includeUserPrompts: boolean
    ): Promise<EnhancedPromptGroup[]> => {
      return historyStore.getEnhancedPrompts(
        daysBack,
        minCount,
        agentFilter,
        includeUserPrompts
      )
    }
  )

  // Get grouped prompts (with normalization/similarity/semantic grouping)
  ipcMain.handle(
    'history:getGroupedPrompts',
    async (
      _,
      daysBack: number,
      minCount: number,
      agentFilter: AgentType | undefined,
      groupingMode: GroupingMode,
      options?: {
        similarityThreshold?: number
        aiProvider?: AIProvider
        apiKey?: string
      }
    ): Promise<GroupedPrompt[]> => {
      // For semantic mode, get API key from storage if not provided
      let effectiveOptions = options
      if (groupingMode === 'semantic' && !options?.apiKey) {
        // Find a configured provider
        const providers: AIProvider[] = ['claude', 'openai', 'gemini']
        for (const provider of providers) {
          if (hasApiKey(provider)) {
            const apiKey = getApiKey(provider)
            if (apiKey) {
              effectiveOptions = {
                ...options,
                aiProvider: provider,
                apiKey,
              }
              break
            }
          }
        }
      }

      return historyStore.getGroupedPrompts(
        daysBack,
        minCount,
        agentFilter,
        groupingMode,
        effectiveOptions
      )
    }
  )

  // ============================================================================
  // AI Handlers
  // ============================================================================

  // Improve a prompt using AI
  ipcMain.handle(
    'ai:improvePrompt',
    async (
      _,
      prompt: string,
      provider: AIProvider
    ): Promise<PromptImprovement> => {
      return improvePrompt(prompt, provider)
    }
  )

  // Set API key for a provider
  ipcMain.handle(
    'ai:setApiKey',
    (_, provider: AIProvider, key: string): void => {
      setApiKey(provider, key)
    }
  )

  // Check if API key is configured for a provider
  ipcMain.handle('ai:hasApiKey', (_, provider: AIProvider): boolean => {
    return hasApiKey(provider)
  })

  // Remove API key for a provider
  ipcMain.handle('ai:removeApiKey', (_, provider: AIProvider): void => {
    removeApiKey(provider)
  })

  // Get AI settings
  ipcMain.handle('ai:getSettings', (): AISettings => {
    return getSettings()
  })

  // Save AI settings
  ipcMain.handle(
    'ai:saveSettings',
    (_, settings: Partial<AISettings>): void => {
      saveSettings(settings)
    }
  )

  // Get saved prompts
  ipcMain.handle('ai:getSavedPrompts', (): SavedPrompt[] => {
    return getSavedPrompts()
  })

  // Save a prompt
  ipcMain.handle(
    'ai:savePrompt',
    (_, improvement: PromptImprovement): SavedPrompt => {
      return savePrompt(improvement)
    }
  )

  // Delete a saved prompt
  ipcMain.handle('ai:deleteSavedPrompt', (_, id: string): boolean => {
    return deleteSavedPrompt(id)
  })

  // ============================================================================
  // Theme Handlers
  // ============================================================================

  // Get current theme preference
  ipcMain.handle('theme:get', (): Theme => {
    return themeStore.getTheme()
  })

  // Set theme preference - returns resolved theme
  ipcMain.handle('theme:set', (_, theme: Theme): 'light' | 'dark' => {
    const resolved = themeStore.setTheme(theme)
    // Notify other windows of theme change
    themeStore.notifyThemeChange(mainWindow)
    return resolved
  })

  // Get resolved theme (system -> actual light/dark)
  ipcMain.handle('theme:getResolved', (): 'light' | 'dark' => {
    return themeStore.getResolvedTheme()
  })

  // Subscribe to system theme changes
  themeStore.subscribeToSystemTheme(resolved => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme:systemChanged', resolved)
    }
  })

  // ============================================================================
  // Notification Settings Handlers
  // ============================================================================

  // Get notification settings
  ipcMain.handle('notifications:getSettings', (): NotificationSettings => {
    return notificationSettingsStore.getSettings()
  })

  // Save notification settings
  ipcMain.handle(
    'notifications:saveSettings',
    (_, settings: Partial<NotificationSettings>): void => {
      notificationSettingsStore.saveSettings(settings)
    }
  )

  // Reset notification settings to defaults
  ipcMain.handle('notifications:resetSettings', (): void => {
    notificationSettingsStore.resetSettings()
  })

  // ============================================================================
  // Cost Handlers
  // ============================================================================

  // Get cost statistics
  ipcMain.handle(
    'cost:getStatistics',
    (_, timeRange?: TimeRange): CostStatistics => {
      return costStore.getStatistics(timeRange)
    }
  )

  // Get daily costs
  ipcMain.handle(
    'cost:getDailyCosts',
    (_, timeRange?: TimeRange): DailyCost[] => {
      return costStore.getDailyCosts(timeRange)
    }
  )

  // Get cost breakdown by agent
  ipcMain.handle(
    'cost:getCostByAgent',
    (_, timeRange?: TimeRange): CostBreakdown[] => {
      return costStore.getCostByAgent(timeRange)
    }
  )

  // Get cost breakdown by model
  ipcMain.handle(
    'cost:getCostByModel',
    (_, timeRange?: TimeRange): CostBreakdown[] => {
      return costStore.getCostByModel(timeRange)
    }
  )

  // Get cost breakdown by project
  ipcMain.handle(
    'cost:getCostByProject',
    (_, timeRange?: TimeRange): CostBreakdown[] => {
      return costStore.getCostByProject(timeRange)
    }
  )

  // Get cost for a specific session
  ipcMain.handle(
    'cost:getSessionCost',
    (_, sessionId: string): SessionCost | null => {
      return costStore.getSessionCost(sessionId)
    }
  )

  // ============================================================================
  // Integration Handlers (Slack/Discord Webhooks)
  // ============================================================================

  // Get integration settings
  ipcMain.handle('integration:getSettings', (): IntegrationSettings => {
    return integrationSettingsStore.getSettings()
  })

  // Save integration settings
  ipcMain.handle(
    'integration:saveSettings',
    (_, settings: Partial<IntegrationSettings>): void => {
      integrationSettingsStore.saveSettings(settings)
    }
  )

  // Reset integration settings to defaults
  ipcMain.handle('integration:resetSettings', (): void => {
    integrationSettingsStore.resetSettings()
  })

  // Test Slack webhook
  ipcMain.handle(
    'integration:testSlackWebhook',
    async (_, webhookUrl: string): Promise<boolean> => {
      return slackWebhook.testWebhook(webhookUrl)
    }
  )

  // Test Discord webhook
  ipcMain.handle(
    'integration:testDiscordWebhook',
    async (_, webhookUrl: string): Promise<boolean> => {
      return discordWebhook.testWebhook(webhookUrl)
    }
  )

  // ============================================================================
  // Config Handlers
  // ============================================================================

  // Get renderer-safe config
  ipcMain.handle('config:get', () => {
    return getRendererConfig()
  })

  // Get feature flags
  ipcMain.handle('config:getFeatureFlags', (): FeatureFlags => {
    return getConfig().features
  })

  // Set feature flag override
  ipcMain.handle(
    'config:setFeatureFlag',
    (_, name: FeatureFlagName, value: boolean): FeatureFlags => {
      setFeatureFlagOverride(name, value)
      return getConfig().features
    }
  )

  // Remove feature flag override
  ipcMain.handle(
    'config:removeFeatureFlagOverride',
    (_, name: FeatureFlagName): FeatureFlags => {
      removeFeatureFlagOverride(name)
      return getConfig().features
    }
  )

  // Get feature flag overrides
  ipcMain.handle(
    'config:getFeatureFlagOverrides',
    (): Partial<Record<FeatureFlagName, boolean>> => {
      return getFeatureFlagOverrides()
    }
  )

  console.log('[IPC] Handlers registered')
}
