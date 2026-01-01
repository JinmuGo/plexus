/**
 * Logger
 *
 * Structured logging using electron-log.
 * Provides scoped loggers for different parts of the application.
 */

import log from 'electron-log'
import { app } from 'electron'

// Configure log file location
log.transports.file.resolvePathFn = () => {
  return `${app.getPath('home')}/.plexus/logs/plexus.log`
}

// Configure log levels
log.transports.file.level = 'info'
log.transports.console.level =
  process.env.NODE_ENV === 'development' ? 'debug' : 'info'

// Configure log format
log.transports.file.format =
  '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope} {text}'
log.transports.console.format = '[{level}] {scope} {text}'

// Set max log file size (10MB)
log.transports.file.maxSize = 10 * 1024 * 1024

// Scoped loggers for different parts of the application
export const logger = {
  // Core application
  main: log.scope('main'),
  app: log.scope('app'),

  // IPC and communication
  ipc: log.scope('ipc'),
  socket: log.scope('socket'),

  // Session management
  session: log.scope('session'),
  monitor: log.scope('monitor'),

  // Hooks
  hook: log.scope('hook'),
  claude: log.scope('claude'),
  gemini: log.scope('gemini'),
  cursor: log.scope('cursor'),

  // Data storage
  history: log.scope('history'),
  cost: log.scope('cost'),
  store: log.scope('store'),

  // UI and windows
  window: log.scope('window'),
  tray: log.scope('tray'),
  notification: log.scope('notification'),

  // AI services
  ai: log.scope('ai'),

  // Webhooks
  webhook: log.scope('webhook'),
}

// Export the base log instance for advanced usage
export { log }

// Helper to log with session ID prefix
export function logWithSession(
  scope: keyof typeof logger,
  level: 'info' | 'warn' | 'error' | 'debug',
  sessionId: string,
  message: string,
  ...args: unknown[]
) {
  const shortId = sessionId.slice(0, 8)
  logger[scope][level](`[${shortId}] ${message}`, ...args)
}
