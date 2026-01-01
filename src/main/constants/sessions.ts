/**
 * Session and Store Constants
 */

// Re-export question tools from shared/hook-utils for backwards compatibility
// Canonical definitions are in shared/hook-utils.ts (used by both main and agent scripts)
export { QUESTION_TOOLS, isQuestionTool } from 'shared/hook-utils'

/** Session considered stale after this duration (30 seconds) */
export const STALE_THRESHOLD_MS = 30 * 1000

/**
 * Cursor session inactivity threshold (5 minutes)
 * Fix #8: Increased from 60s to 5min since Cursor sessions often idle longer
 */
export const CURSOR_INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000

/**
 * Compacting state timeout (90 seconds)
 * Fix #6: Context compaction can legitimately take longer than 30 seconds
 */
export const COMPACTING_TIMEOUT_MS = 90 * 1000

/** Cleanup interval for ended sessions (60 seconds) */
export const CLEANUP_INTERVAL_MS = 60 * 1000

/** Maximum age for ended sessions before removal (1 hour) */
export const ENDED_MAX_AGE_MS = 60 * 60 * 1000

/** Maximum activity log entries per session */
export const MAX_ENTRIES_PER_SESSION = 50

/** Database schema version */
export const SCHEMA_VERSION = 7
