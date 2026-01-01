/**
 * Main Process Constants
 *
 * Centralized constants for the Electron main process.
 * Import specific modules or use namespace imports for organized access.
 *
 * @example
 * // Import specific constants
 * import { STALE_THRESHOLD_MS, SCHEMA_VERSION } from 'main/constants/sessions'
 *
 * // Import namespace
 * import * as hooks from 'main/constants/hooks'
 * hooks.claude.HOOK_SCRIPT_NAME
 */

// Re-export all modules
export * from './sessions'
export * from './windows'
export * from './ipc'
export * from './webhooks'

// Namespace exports for organized access
export * as hooks from './hooks'
export * as cost from './cost'
export * as ai from './ai'
export * as utils from './utils'
