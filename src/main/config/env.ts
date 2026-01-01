/**
 * Main Process Environment Validation
 *
 * Validates and types environment variables available in main process.
 */

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
type LogLevel = (typeof LOG_LEVELS)[number]

export interface MainEnvVars {
  logLevel: LogLevel
  enableDevTools: boolean
  apiTimeout: number
}

function parseLogLevel(
  value: string | undefined,
  fallback: LogLevel
): LogLevel {
  if (!value) return fallback
  const lower = value.toLowerCase() as LogLevel
  return LOG_LEVELS.includes(lower) ? lower : fallback
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return value === 'true' || value === '1'
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const num = Number.parseInt(value, 10)
  return Number.isNaN(num) ? fallback : num
}

/**
 * Validates main process environment variables
 */
export function validateMainEnv(isDev: boolean): MainEnvVars {
  // Environment variables from .env files via electron-vite
  const env = import.meta.env || {}

  return {
    logLevel: parseLogLevel(
      env.MAIN_VITE_LOG_LEVEL ?? process.env.PLEXUS_LOG_LEVEL,
      isDev ? 'debug' : 'info'
    ),
    enableDevTools: parseBoolean(env.RENDERER_VITE_ENABLE_DEVTOOLS, isDev),
    apiTimeout: parseNumber(env.RENDERER_VITE_API_TIMEOUT, 30000),
  }
}
