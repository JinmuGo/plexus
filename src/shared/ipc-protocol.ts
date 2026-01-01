import type {
  AgentStatus,
  AgentType,
  IDEContext,
  IDEEventType,
  SessionSource,
} from './types'

// Agent session information
export interface AgentSession {
  id: string
  pid: number | null // null for IDE sessions without PID
  command: string
  args: string[]
  cwd: string
  status: AgentStatus
  startedAt: number
  source: SessionSource
  agentType: AgentType
  // IDE-specific fields
  ideContext?: IDEContext
}

// IPC Message Types
export type IpcMessageType =
  // Common messages
  | 'session:register'
  | 'session:update'
  | 'session:output'
  | 'session:exit'
  | 'session:stdin'
  | 'session:resize'
  | 'session:kill'
  | 'app:status'
  // IDE-specific messages
  | 'ide:event'
  | 'ide:context'

// Base message structure
export interface IpcMessageBase {
  type: IpcMessageType
  sessionId: string
  timestamp: number
}

// Session registration (CLI/IDE → App)
export interface SessionRegisterMessage extends IpcMessageBase {
  type: 'session:register'
  payload: {
    pid: number | null // null for IDE sessions
    command: string
    args: string[]
    cwd: string
    source: SessionSource
    agentType: AgentType
  }
}

// Session status update (CLI → App)
export interface SessionUpdateMessage extends IpcMessageBase {
  type: 'session:update'
  payload: {
    status: AgentStatus
  }
}

// Session output (CLI → App)
export interface SessionOutputMessage extends IpcMessageBase {
  type: 'session:output'
  payload: {
    data: string
    stream: 'stdout' | 'stderr'
  }
}

// Session exit (CLI → App)
export interface SessionExitMessage extends IpcMessageBase {
  type: 'session:exit'
  payload: {
    exitCode: number | null
    signal: string | null
  }
}

// Session stdin input (App → CLI)
export interface SessionStdinMessage extends IpcMessageBase {
  type: 'session:stdin'
  payload: {
    data: string
    raw?: boolean // If true, send as raw keystrokes (for Ctrl+C, etc.)
  }
}

// Session resize (App → CLI)
export interface SessionResizeMessage extends IpcMessageBase {
  type: 'session:resize'
  payload: {
    cols: number
    rows: number
  }
}

// Session kill (App → CLI)
export interface SessionKillMessage extends IpcMessageBase {
  type: 'session:kill'
  payload: {
    signal: 'SIGTERM' | 'SIGKILL' // SIGTERM for graceful, SIGKILL for force
  }
}

// App status response (App → CLI/IDE)
export interface AppStatusMessage extends IpcMessageBase {
  type: 'app:status'
  payload: {
    connected: boolean
    sessionsCount: number
  }
}

// IDE event (IDE → App)
export interface IDEEventMessage extends IpcMessageBase {
  type: 'ide:event'
  payload: {
    eventType: IDEEventType
    status?: AgentStatus
    context?: IDEContext
    data?: string // Additional event-specific data
  }
}

// IDE context update (IDE → App)
export interface IDEContextMessage extends IpcMessageBase {
  type: 'ide:context'
  payload: {
    context: IDEContext
  }
}

// Union type for all messages
export type IpcMessage =
  | SessionRegisterMessage
  | SessionUpdateMessage
  | SessionOutputMessage
  | SessionExitMessage
  | SessionStdinMessage
  | SessionResizeMessage
  | SessionKillMessage
  | AppStatusMessage
  | IDEEventMessage
  | IDEContextMessage

// Socket path for Unix Domain Socket
export const getSocketPath = (): string => {
  const tmpDir =
    process.platform === 'win32'
      ? process.env.TEMP || 'C:\\Windows\\Temp'
      : '/tmp'
  return `${tmpDir}/plexus.sock`
}

// Helper to create messages
export function createIpcMessage<T extends IpcMessage>(
  type: T['type'],
  sessionId: string,
  payload: T['payload']
): T {
  return {
    type,
    sessionId,
    timestamp: Date.now(),
    payload,
  } as T
}
