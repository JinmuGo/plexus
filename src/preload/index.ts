import { contextBridge, ipcRenderer } from 'electron'
import type { AgentSession } from 'shared/ipc-protocol'
import type {
  ClaudeSession,
  PermissionContext,
  SessionPhase,
  SessionActivityEntry,
  PermissionDecision,
  AutoAllowEntry,
  AgentPermissionCapabilities,
} from 'shared/hook-types'
import type { HITLRequest } from 'shared/hitl-types'
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
  AISettings,
  SavedPrompt,
  ParsedConversationEntry,
  ParsedToolExecution,
  HourlyUsageData,
  ProjectUsageStats,
  ProductivityTrend,
  FailurePattern,
} from 'shared/history-types'
import type { ParsedThinkingBlock } from 'main/history/jsonl-parser'
import type { AgentType } from 'shared/hook-types'
import type { Theme, ResolvedTheme } from 'shared/theme-types'
import type { NotificationSettings } from 'shared/notification-types'
import type {
  CostStatistics,
  DailyCost,
  CostBreakdown,
  SessionCost,
  TimeRange,
} from 'shared/cost-types'
import type { IntegrationSettings } from 'shared/integration-types'
import type { FeatureFlagName, FeatureFlags, Environment } from 'shared/config'

// Type for renderer-safe config (matches main/config RendererEnvConfig)
interface RendererEnvConfig {
  appName: string
  appVersion: string
  environment: Environment
  isDev: boolean
  isProd: boolean
  platform: NodeJS.Platform
  features: FeatureFlags
}

// Claude session event type (Hook-based)
interface ClaudeSessionEvent {
  type:
    | 'add'
    | 'update'
    | 'remove'
    | 'phaseChange'
    | 'permissionRequest'
    | 'permissionResolved'
  session: ClaudeSession
  previousPhase?: SessionPhase
  permissionContext?: PermissionContext
}

// Export types for renderer usage
export type { ClaudeSessionEvent }

declare global {
  interface Window {
    App: typeof API
  }
}

const API = {
  // Session management
  sessions: {
    getAll: (): Promise<AgentSession[]> =>
      ipcRenderer.invoke('sessions:getAll'),

    getOutput: (sessionId: string): Promise<string[]> =>
      ipcRenderer.invoke('sessions:getOutput', sessionId),

    getCount: (): Promise<number> => ipcRenderer.invoke('sessions:getCount'),

    // Send stdin input to a session
    stdin: (sessionId: string, data: string, raw?: boolean): Promise<boolean> =>
      ipcRenderer.invoke('sessions:stdin', sessionId, data, raw),

    // Send resize to a session
    resize: (sessionId: string, cols: number, rows: number): Promise<boolean> =>
      ipcRenderer.invoke('sessions:resize', sessionId, cols, rows),

    // Kill a session (force terminate)
    kill: (
      sessionId: string,
      signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'
    ): Promise<boolean> =>
      ipcRenderer.invoke('sessions:kill', sessionId, signal),
  },

  // Permission management (Hook-based)
  permissions: {
    // Legacy: simple approve
    approve: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke('permission:approve', sessionId),

    // Legacy: simple deny
    deny: (sessionId: string, reason?: string): Promise<boolean> =>
      ipcRenderer.invoke('permission:deny', sessionId, reason),

    // Extended: respond with full options
    respond: (
      sessionId: string,
      decision: PermissionDecision,
      options?: {
        reason?: string
        updatedInput?: Record<string, unknown>
        interrupt?: boolean
      }
    ): Promise<boolean> =>
      ipcRenderer.invoke('permission:respond', sessionId, decision, options),

    // Get auto-allowed tools for a session
    getAutoAllowed: (sessionId: string): Promise<AutoAllowEntry[]> =>
      ipcRenderer.invoke('permission:getAutoAllowed', sessionId),

    // Remove an auto-allow entry
    removeAutoAllow: (sessionId: string, toolName: string): Promise<boolean> =>
      ipcRenderer.invoke('permission:removeAutoAllow', sessionId, toolName),

    // Get agent permission capabilities
    getCapabilities: (
      agentType: AgentType
    ): Promise<AgentPermissionCapabilities> =>
      ipcRenderer.invoke('permission:getCapabilities', agentType),

    getPending: (
      sessionId: string
    ): Promise<{
      toolName: string
      toolId: string
      toolInput?: Record<string, unknown>
    } | null> => ipcRenderer.invoke('permission:getPending', sessionId),

    getHITLRequest: (sessionId: string): Promise<HITLRequest | null> =>
      ipcRenderer.invoke('permission:getHITLRequest', sessionId),
  },

  // Claude sessions (Hook-based)
  claudeSessions: {
    getAll: (): Promise<ClaudeSession[]> =>
      ipcRenderer.invoke('claudeSessions:getAll'),

    get: (sessionId: string): Promise<ClaudeSession | undefined> =>
      ipcRenderer.invoke('claudeSessions:get', sessionId),

    getCount: (): Promise<number> =>
      ipcRenderer.invoke('claudeSessions:getCount'),

    getSorted: (): Promise<ClaudeSession[]> =>
      ipcRenderer.invoke('claudeSessions:getSorted'),

    // Terminate a session (send kill signal)
    terminate: (
      sessionId: string,
      signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'
    ): Promise<boolean> =>
      ipcRenderer.invoke('claudeSessions:terminate', sessionId, signal),

    // Remove a session from store (manual cleanup)
    remove: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke('claudeSessions:remove', sessionId),

    // Event: claude session event
    onEvent: (callback: (event: ClaudeSessionEvent) => void): (() => void) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        event: ClaudeSessionEvent
      ) => {
        callback(event)
      }
      ipcRenderer.on('claudeSessions:event', handler)
      return () => ipcRenderer.removeListener('claudeSessions:event', handler)
    },
  },

  // Activity Log (for Side Panel)
  activity: {
    getLog: (sessionId: string): Promise<SessionActivityEntry[]> =>
      ipcRenderer.invoke('activity:getLog', sessionId),
  },

  // Tmux control (for Side Panel)
  tmux: {
    focus: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke('tmux:focus', sessionId),

    interrupt: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke('session:interrupt', sessionId),
  },

  // History management (persistent session history)
  history: {
    // Search messages across all sessions
    search: (
      query: string,
      filters?: SearchFilters,
      limit?: number
    ): Promise<SearchResult[]> =>
      ipcRenderer.invoke('history:search', query, filters, limit),

    // Get a specific session from history
    getSession: (sessionId: string): Promise<HistorySession | null> =>
      ipcRenderer.invoke('history:getSession', sessionId),

    // Get all sessions with optional filtering
    getSessions: (options?: QueryOptions): Promise<HistorySession[]> =>
      ipcRenderer.invoke('history:getSessions', options),

    // Get messages for a session
    getMessages: (
      sessionId: string,
      options?: { limit?: number; offset?: number }
    ): Promise<HistoryMessage[]> =>
      ipcRenderer.invoke('history:getMessages', sessionId, options),

    // Get tool executions for a session
    getToolExecutions: (sessionId: string): Promise<ToolExecution[]> =>
      ipcRenderer.invoke('history:getToolExecutions', sessionId),

    // Get session with all messages and tool executions
    getSessionWithMessages: (
      sessionId: string
    ): Promise<SessionWithMessages | null> =>
      ipcRenderer.invoke('history:getSessionWithMessages', sessionId),

    // Get statistics
    getStatistics: (timeRange?: {
      start: number
      end: number
    }): Promise<Statistics> =>
      ipcRenderer.invoke('history:getStatistics', timeRange),

    // Get extended statistics for analytics
    getExtendedStatistics: (timeRange?: {
      start: number
      end: number
    }): Promise<ExtendedStatistics> =>
      ipcRenderer.invoke('history:getExtendedStatistics', timeRange),

    // Get hourly usage for heatmap
    getHourlyUsage: (daysBack?: number): Promise<HourlyUsageData[]> =>
      ipcRenderer.invoke('history:getHourlyUsage', daysBack),

    // Get project statistics
    getProjectStats: (limit?: number): Promise<ProjectUsageStats[]> =>
      ipcRenderer.invoke('history:getProjectStats', limit),

    // Get weekly productivity trends
    getWeeklyTrends: (weeksBack?: number): Promise<ProductivityTrend[]> =>
      ipcRenderer.invoke('history:getWeeklyTrends', weeksBack),

    // Get failure patterns
    getFailurePatterns: (limit?: number): Promise<FailurePattern[]> =>
      ipcRenderer.invoke('history:getFailurePatterns', limit),

    // Delete a session from history
    deleteSession: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke('history:deleteSession', sessionId),

    // Cleanup old sessions
    cleanup: (options: {
      maxAgeDays?: number
      maxSessions?: number
    }): Promise<number> => ipcRenderer.invoke('history:cleanup', options),

    // Get database size in bytes
    getDatabaseSize: (): Promise<number> =>
      ipcRenderer.invoke('history:getDatabaseSize'),

    // Optimize database
    vacuum: (): Promise<boolean> => ipcRenderer.invoke('history:vacuum'),

    // Re-sync sessions from JSONL files
    resync: (): Promise<{
      scanned: number
      imported: number
      skipped: number
      errors: number
    }> => ipcRenderer.invoke('history:resync'),

    // Get full content for a message (on-demand loading from JSONL)
    getFullContent: (
      messageId: string
    ): Promise<{ content: string | null; error?: string }> =>
      ipcRenderer.invoke('history:getFullContent', messageId),

    // Parse JSONL file directly for replay (gets user/assistant messages + thinking)
    parseJsonlForReplay: (
      sessionId: string
    ): Promise<{
      entries: ParsedConversationEntry[]
      toolExecutions: ParsedToolExecution[]
      thinkingBlocks: ParsedThinkingBlock[]
    } | null> => ipcRenderer.invoke('history:parseJsonlForReplay', sessionId),

    // Get frequently used prompts for insights
    getFrequentPrompts: (
      daysBack: number,
      minCount: number,
      agentFilter?: AgentType
    ): Promise<FrequentPrompt[]> =>
      ipcRenderer.invoke(
        'history:getFrequentPrompts',
        daysBack,
        minCount,
        agentFilter
      ),

    // Get grouped prompts with normalization/similarity/semantic grouping
    getEnhancedPrompts: (
      daysBack: number,
      minCount: number,
      agentFilter: AgentType | undefined,
      includeUserPrompts: boolean
    ): Promise<EnhancedPromptGroup[]> =>
      ipcRenderer.invoke(
        'history:getEnhancedPrompts',
        daysBack,
        minCount,
        agentFilter,
        includeUserPrompts
      ),
    getGroupedPrompts: (
      daysBack: number,
      minCount: number,
      agentFilter: AgentType | undefined,
      groupingMode: GroupingMode,
      options?: {
        similarityThreshold?: number
        aiProvider?: AIProvider
        apiKey?: string
      }
    ): Promise<GroupedPrompt[]> =>
      ipcRenderer.invoke(
        'history:getGroupedPrompts',
        daysBack,
        minCount,
        agentFilter,
        groupingMode,
        options
      ),
  },

  // AI service for prompt improvement
  ai: {
    // Improve a prompt using AI
    improvePrompt: (
      prompt: string,
      provider: AIProvider
    ): Promise<PromptImprovement> =>
      ipcRenderer.invoke('ai:improvePrompt', prompt, provider),

    // Set API key for a provider
    setApiKey: (provider: AIProvider, key: string): Promise<void> =>
      ipcRenderer.invoke('ai:setApiKey', provider, key),

    // Check if API key is configured
    hasApiKey: (provider: AIProvider): Promise<boolean> =>
      ipcRenderer.invoke('ai:hasApiKey', provider),

    // Remove API key for a provider
    removeApiKey: (provider: AIProvider): Promise<void> =>
      ipcRenderer.invoke('ai:removeApiKey', provider),

    // Get AI settings
    getSettings: (): Promise<AISettings> =>
      ipcRenderer.invoke('ai:getSettings'),

    // Save AI settings
    saveSettings: (settings: Partial<AISettings>): Promise<void> =>
      ipcRenderer.invoke('ai:saveSettings', settings),

    // Get saved prompts
    getSavedPrompts: (): Promise<SavedPrompt[]> =>
      ipcRenderer.invoke('ai:getSavedPrompts'),

    // Save a prompt
    savePrompt: (improvement: PromptImprovement): Promise<SavedPrompt> =>
      ipcRenderer.invoke('ai:savePrompt', improvement),

    // Delete a saved prompt
    deleteSavedPrompt: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('ai:deleteSavedPrompt', id),
  },

  // Window management
  window: {
    showDashboard: (): Promise<void> =>
      ipcRenderer.invoke('window:showDashboard'),

    hidePopover: (): Promise<void> => ipcRenderer.invoke('window:hidePopover'),

    quit: (): Promise<void> => ipcRenderer.invoke('window:quit'),
  },

  // Theme management
  theme: {
    // Get current theme preference
    get: (): Promise<Theme> => ipcRenderer.invoke('theme:get'),

    // Set theme preference - returns resolved theme
    set: (theme: Theme): Promise<ResolvedTheme> =>
      ipcRenderer.invoke('theme:set', theme),

    // Get resolved theme (system -> actual light/dark)
    getResolved: (): Promise<ResolvedTheme> =>
      ipcRenderer.invoke('theme:getResolved'),

    // Subscribe to system theme changes
    onSystemChange: (
      callback: (resolved: ResolvedTheme) => void
    ): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, resolved: ResolvedTheme) =>
        callback(resolved)
      ipcRenderer.on('theme:systemChanged', handler)
      return () => ipcRenderer.removeListener('theme:systemChanged', handler)
    },
  },

  // Notification settings management
  notifications: {
    // Get notification settings
    getSettings: (): Promise<NotificationSettings> =>
      ipcRenderer.invoke('notifications:getSettings'),

    // Save notification settings (partial update)
    saveSettings: (settings: Partial<NotificationSettings>): Promise<void> =>
      ipcRenderer.invoke('notifications:saveSettings', settings),

    // Reset to default settings
    resetSettings: (): Promise<void> =>
      ipcRenderer.invoke('notifications:resetSettings'),
  },

  // Cost intelligence (token usage and spending tracking)
  cost: {
    // Get comprehensive cost statistics
    getStatistics: (timeRange?: TimeRange): Promise<CostStatistics> =>
      ipcRenderer.invoke('cost:getStatistics', timeRange),

    // Get daily cost data
    getDailyCosts: (timeRange?: TimeRange): Promise<DailyCost[]> =>
      ipcRenderer.invoke('cost:getDailyCosts', timeRange),

    // Get cost breakdown by agent (Claude, Gemini, Cursor)
    getCostByAgent: (timeRange?: TimeRange): Promise<CostBreakdown[]> =>
      ipcRenderer.invoke('cost:getCostByAgent', timeRange),

    // Get cost breakdown by model
    getCostByModel: (timeRange?: TimeRange): Promise<CostBreakdown[]> =>
      ipcRenderer.invoke('cost:getCostByModel', timeRange),

    // Get cost breakdown by project
    getCostByProject: (timeRange?: TimeRange): Promise<CostBreakdown[]> =>
      ipcRenderer.invoke('cost:getCostByProject', timeRange),

    // Get cost for a specific session
    getSessionCost: (sessionId: string): Promise<SessionCost | null> =>
      ipcRenderer.invoke('cost:getSessionCost', sessionId),
  },

  // Integration settings (Slack/Discord Webhooks)
  integrations: {
    // Get integration settings
    getSettings: (): Promise<IntegrationSettings> =>
      ipcRenderer.invoke('integration:getSettings'),

    // Save integration settings (partial update)
    saveSettings: (settings: Partial<IntegrationSettings>): Promise<void> =>
      ipcRenderer.invoke('integration:saveSettings', settings),

    // Reset to default settings
    resetSettings: (): Promise<void> =>
      ipcRenderer.invoke('integration:resetSettings'),

    // Test Slack webhook
    testSlackWebhook: (webhookUrl: string): Promise<boolean> =>
      ipcRenderer.invoke('integration:testSlackWebhook', webhookUrl),

    // Test Discord webhook
    testDiscordWebhook: (webhookUrl: string): Promise<boolean> =>
      ipcRenderer.invoke('integration:testDiscordWebhook', webhookUrl),
  },

  // Configuration management
  config: {
    // Get renderer-safe config
    get: (): Promise<RendererEnvConfig> => ipcRenderer.invoke('config:get'),

    // Get feature flags
    getFeatureFlags: (): Promise<FeatureFlags> =>
      ipcRenderer.invoke('config:getFeatureFlags'),

    // Set feature flag override
    setFeatureFlag: (
      name: FeatureFlagName,
      value: boolean
    ): Promise<FeatureFlags> =>
      ipcRenderer.invoke('config:setFeatureFlag', name, value),

    // Remove feature flag override
    removeFeatureFlagOverride: (name: FeatureFlagName): Promise<FeatureFlags> =>
      ipcRenderer.invoke('config:removeFeatureFlagOverride', name),

    // Get feature flag overrides
    getFeatureFlagOverrides: (): Promise<
      Partial<Record<FeatureFlagName, boolean>>
    > => ipcRenderer.invoke('config:getFeatureFlagOverrides'),
  },
}

contextBridge.exposeInMainWorld('App', API)
