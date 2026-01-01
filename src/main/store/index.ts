/**
 * Store Index
 *
 * Central export for all main process stores.
 */

// Main stores
export { sessionStore } from './sessions'
export { historyStore } from './history'
export { costStore } from './cost-store'
export { activityLogStore } from './activity-log'
export { autoAllowStore } from './auto-allow-store'

// Settings stores
export { themeStore } from './theme'
export { notificationSettingsStore } from './notification-settings'
export { integrationSettingsStore } from './integration-settings'

// Prompt utilities
export { groupPrompts, selectSmartGroupingMode } from './prompt-normalizer'
