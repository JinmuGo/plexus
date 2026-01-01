/**
 * Main Process Library
 *
 * Re-exports all main process utilities.
 */

export { logger, log, logWithSession } from './logger'
export { setupErrorHandling } from './error-handler'
export { generateId, formatToolInput } from './utils'
export {
  getPreference,
  setPreference,
  getAllPreferences,
  resetPreference,
  resetAllPreferences,
  saveWindowBounds,
  getWindowBounds,
  saveMaximizedState,
  getMaximizedState,
  preferencesStore,
  type Preferences,
  type WindowBounds,
} from './preferences'
