/**
 * Utility Constants
 *
 * Centralized timeout and configuration values for utility functions
 * in the main process (platform-focus, tmux, git-branch-detector, etc.)
 */

// ============================================================================
// Shell Execution Timeouts
// ============================================================================

/** Timeout for generic exec commands (5 seconds) */
export const EXEC_TIMEOUT_MS = 5000

/** Timeout for osascript (AppleScript) commands (3 seconds) */
export const OSASCRIPT_TIMEOUT_MS = 3000

/** Timeout for tmux commands (3 seconds) */
export const TMUX_COMMAND_TIMEOUT_MS = 3000

/** Timeout for git commands (3 seconds) */
export const GIT_COMMAND_TIMEOUT_MS = 3000

// ============================================================================
// Process Query Timeouts
// ============================================================================

/** Timeout for process tree queries via ps/pgrep (5 seconds) */
export const PROCESS_TREE_TIMEOUT_MS = 5000

/** Timeout for process info queries (3 seconds) */
export const PROCESS_INFO_TIMEOUT_MS = 3000
