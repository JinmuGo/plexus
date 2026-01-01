/**
 * Git Branch Detector
 *
 * Detects the current git branch for a given directory.
 * Uses LRU caching with TTL to avoid repeated git operations.
 */

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { GIT_COMMAND_TIMEOUT_MS } from '../constants/utils'

/** Result of git branch detection */
export interface GitBranchResult {
  /** Current branch name (null if not a git repo or error) */
  branch: string | null
  /** True if the directory is within a git repository */
  isGitRepo: boolean
}

/** Cache entry with timestamp for TTL */
interface CacheEntry {
  result: GitBranchResult
  timestamp: number
}

/**
 * LRU Cache with TTL for git branch detection results
 * Git branches can change, so we use a short TTL
 */
class GitBranchCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize: number
  private ttlMs: number

  constructor(maxSize = 50, ttlMs = 30000) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
  }

  get(cwd: string): GitBranchResult | undefined {
    const entry = this.cache.get(cwd)
    if (!entry) return undefined

    // Check if cache entry has expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(cwd)
      return undefined
    }

    // Move to end (most recently used)
    this.cache.delete(cwd)
    this.cache.set(cwd, entry)
    return entry.result
  }

  set(cwd: string, result: GitBranchResult): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value
      if (oldest) {
        this.cache.delete(oldest)
      }
    }
    this.cache.set(cwd, { result, timestamp: Date.now() })
  }

  clear(): void {
    this.cache.clear()
  }
}

const cache = new GitBranchCache()

/**
 * Detect git branch for a directory
 *
 * @param cwd - Working directory to check
 * @returns GitBranchResult with branch name or null if not a git repo
 */
export function detectGitBranch(cwd: string): GitBranchResult {
  // Normalize path
  const normalizedCwd = resolve(cwd)

  // Check cache first
  const cached = cache.get(normalizedCwd)
  if (cached) return cached

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: normalizedCwd,
      encoding: 'utf-8',
      timeout: GIT_COMMAND_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'], // Suppress stderr
    }).trim()

    const result: GitBranchResult = {
      branch: branch || null,
      isGitRepo: true,
    }
    cache.set(normalizedCwd, result)
    return result
  } catch {
    // Not a git repo or git command failed
    const result: GitBranchResult = {
      branch: null,
      isGitRepo: false,
    }
    cache.set(normalizedCwd, result)
    return result
  }
}

/**
 * Clear the git branch cache
 * Useful for testing or when git state might have changed
 */
export function clearGitBranchCache(): void {
  cache.clear()
}

/**
 * Singleton-like interface for git branch detection
 */
export const gitBranchDetector = {
  detectGitBranch,
  clearCache: clearGitBranchCache,
}
