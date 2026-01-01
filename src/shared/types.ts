import type { BrowserWindow, IpcMainInvokeEvent, Tray } from 'electron'

import type { registerRoute } from 'renderer/lib/electron-router-dom'
import type { AgentType as HookAgentType } from './hook-types'

export type BrowserWindowOrNull = Electron.BrowserWindow | null

type Route = Parameters<typeof registerRoute>[0]

export interface WindowProps extends Electron.BrowserWindowConstructorOptions {
  id: Route['id']
  query?: Route['query']
}

export interface WindowCreationByIPC {
  channel: string
  window(): BrowserWindowOrNull
  callback(window: BrowserWindow, event: IpcMainInvokeEvent): void
}

// Session Source Types
export type SessionSource = 'cli' | 'cursor' | 'windsurf' | 'vscode'

// Agent Type (the AI being tracked)
export type AgentType = 'claude-code' | 'cursor-agent' | 'windsurf-agent'

// Agent Status Types
export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'awaiting'
  | 'tool_use'
  | 'error'

// IDE Event Types
export type IDEEventType =
  | 'state_change'
  | 'file_edit'
  | 'chat_message'
  | 'command_execute'

// IDE Context Information
export interface IDEContext {
  file?: string
  selection?: {
    startLine: number
    startColumn: number
    endLine: number
    endColumn: number
  }
  chatId?: string
  commandId?: string
}

// Tray Status (aggregate of all sessions)
export type TrayStatus = AgentStatus | 'none'

// Tray Manager Types
export interface TrayManagerProps {
  window: BrowserWindow
  iconPath: string
}

export interface TrayManager {
  tray: Tray
  updateContextMenu: () => void
  setStatus: (status: TrayStatus) => void
  destroy: () => void
}

// App Notification Types
export type NotificationType = 'awaiting' | 'error' | 'exit' | 'batch'

export interface AppNotification {
  id: string
  type: NotificationType
  sessionId: string | null // null for batch notifications
  title: string
  body: string
  timestamp: number
  read: boolean
  count?: number // for batched notifications
  sessionIds?: string[] // for batch notifications - list of affected sessions
  agent?: HookAgentType // which agent type (claude, gemini, cursor)
  toolName?: string // tool requesting permission
}

// Note: Action Queue types removed - they were never used in the codebase
