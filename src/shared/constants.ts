import { createEnvConfig } from './config/env'

// Use new config system for environment detection
const envConfig = createEnvConfig()

export const ENVIRONMENT = {
  IS_DEV: envConfig.isDev,
  IS_PROD: envConfig.isProd,
  ENV: envConfig.env,
  APP_NAME: envConfig.appName,
  APP_VERSION: envConfig.appVersion,
} as const

export const PLATFORM = {
  IS_MAC:
    typeof process !== 'undefined' ? process.platform === 'darwin' : false,
  IS_WINDOWS:
    typeof process !== 'undefined' ? process.platform === 'win32' : false,
  IS_LINUX:
    typeof process !== 'undefined' ? process.platform === 'linux' : false,
} as const

export const AGENT_STATUS_COLORS = {
  idle: '#22C55E', // Green
  thinking: '#3B82F6', // Blue
  awaiting: '#F97316', // Orange
  tool_use: '#A855F7', // Purple
  error: '#EF4444', // Red
} as const

export const TRAY_STATUS_COLORS = {
  ...AGENT_STATUS_COLORS,
  none: '#6B7280', // Gray
} as const

export const TRAY_STATUS_LABELS = {
  none: 'No active agents',
  idle: 'Agents idle',
  thinking: 'Agent thinking...',
  awaiting: 'Input needed',
  tool_use: 'Agent working...',
  error: 'Error occurred',
} as const
