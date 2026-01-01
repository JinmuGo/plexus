/**
 * Common Hook Constants
 */

/** Default stable Node.js paths to search */
export const DEFAULT_STABLE_PATHS = [
  '/opt/homebrew/bin/node', // Apple Silicon homebrew
  '/usr/local/bin/node', // Intel homebrew or manual install
] as const

/** Patterns to avoid when detecting Node.js path */
export const DEFAULT_AVOID_PATTERNS = ['fnm_multishells'] as const
