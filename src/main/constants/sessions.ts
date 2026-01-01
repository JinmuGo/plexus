/**
 * Session and Store Constants
 */

/** Tools that indicate the agent is asking a question */
export const QUESTION_TOOLS = new Set([
  'AskUserQuestion',
  'AskFollowupQuestion',
])

/** Session considered stale after this duration (30 seconds) */
export const STALE_THRESHOLD_MS = 30 * 1000

/** Cursor session inactivity threshold (60 seconds) - used when PID is unavailable */
export const CURSOR_INACTIVITY_THRESHOLD_MS = 60 * 1000

/** Cleanup interval for ended sessions (60 seconds) */
export const CLEANUP_INTERVAL_MS = 60 * 1000

/** Maximum age for ended sessions before removal (1 hour) */
export const ENDED_MAX_AGE_MS = 60 * 60 * 1000

/** Maximum activity log entries per session */
export const MAX_ENTRIES_PER_SESSION = 50

/** Database schema version */
export const SCHEMA_VERSION = 6
