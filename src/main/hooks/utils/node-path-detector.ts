/**
 * Node Path Detector
 *
 * Detects the Node.js executable path, preferring stable paths
 * over temporary version manager paths (e.g., fnm multishells).
 */

import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import {
  DEFAULT_STABLE_PATHS,
  DEFAULT_AVOID_PATTERNS,
} from '../../constants/hooks/common'

export interface DetectNodePathOptions {
  /** Additional stable paths to check first */
  additionalStablePaths?: string[]
  /** Patterns to avoid in PATH resolution */
  avoidPatterns?: string[]
}

/**
 * Detect the Node.js executable path
 * Prefer stable paths over temporary version manager paths
 */
export function detectNodePath(options: DetectNodePathOptions = {}): string {
  const stablePaths = [
    ...(options.additionalStablePaths || []),
    ...DEFAULT_STABLE_PATHS,
  ]
  const avoidPatterns = options.avoidPatterns || DEFAULT_AVOID_PATTERNS

  // Try stable paths first
  for (const p of stablePaths) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return p
      }
    } catch {
      // Continue to next path
    }
  }

  // Try to find node in PATH, avoiding certain patterns
  try {
    const nodePath = execSync('which node', { encoding: 'utf-8' }).trim()
    if (nodePath) {
      const shouldAvoid = avoidPatterns.some(pattern =>
        nodePath.includes(pattern)
      )
      if (!shouldAvoid) {
        return nodePath
      }
    }
  } catch {
    // Ignore errors
  }

  // Fallback to 'node' and let the shell resolve it
  return 'node'
}
