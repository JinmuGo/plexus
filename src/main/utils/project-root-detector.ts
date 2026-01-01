/**
 * Project Root Detector
 *
 * Detects project root directories by scanning for common project markers
 * like .git, package.json, Cargo.toml, etc.
 */

import { existsSync } from 'node:fs'
import { dirname, join, basename, resolve } from 'node:path'
import { PROJECT_MARKERS, MAX_SCAN_DEPTH } from '../constants/utils'

/** Result of project root detection */
export interface ProjectRootResult {
  /** Detected project root path (or cwd if no marker found) */
  projectRoot: string
  /** Display name (last directory component) */
  projectName: string
  /** Which marker was found (null if fallback to cwd) */
  marker: string | null
  /** True if cwd was used as fallback (no marker found) */
  isFallback: boolean
}

/**
 * LRU Cache for project root detection results
 * Avoids repeated filesystem scans for the same paths
 */
class ProjectRootCache {
  private cache = new Map<string, ProjectRootResult>()
  private maxSize: number

  constructor(maxSize = 100) {
    this.maxSize = maxSize
  }

  get(cwd: string): ProjectRootResult | undefined {
    const result = this.cache.get(cwd)
    if (result) {
      // Move to end (most recently used)
      this.cache.delete(cwd)
      this.cache.set(cwd, result)
    }
    return result
  }

  set(cwd: string, result: ProjectRootResult): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value
      if (oldest) {
        this.cache.delete(oldest)
      }
    }
    this.cache.set(cwd, result)
  }

  clear(): void {
    this.cache.clear()
  }
}

const cache = new ProjectRootCache()

/**
 * Extract project name from project root path
 */
export function getProjectName(projectRoot: string): string {
  const name = basename(projectRoot)
  return name || projectRoot
}

/**
 * Detect project root by scanning upward from cwd
 *
 * @param cwd - Current working directory to start from
 * @returns Project root result with path, name, and marker info
 */
export function detectProjectRoot(cwd: string): ProjectRootResult {
  // Normalize path
  const normalizedCwd = resolve(cwd)

  // Check cache first
  const cached = cache.get(normalizedCwd)
  if (cached) {
    return cached
  }

  let currentDir = normalizedCwd
  let depth = 0

  while (depth < MAX_SCAN_DEPTH) {
    // Check each marker in priority order
    for (const marker of PROJECT_MARKERS) {
      const markerPath = join(currentDir, marker)
      try {
        if (existsSync(markerPath)) {
          const result: ProjectRootResult = {
            projectRoot: currentDir,
            projectName: getProjectName(currentDir),
            marker,
            isFallback: false,
          }
          cache.set(normalizedCwd, result)
          return result
        }
      } catch {
        // Ignore permission errors, continue scanning
      }
    }

    // Move to parent directory
    const parentDir = dirname(currentDir)

    // Stop if we've reached the root
    if (parentDir === currentDir) {
      break
    }

    currentDir = parentDir
    depth++
  }

  // No marker found, use cwd as fallback
  const fallbackResult: ProjectRootResult = {
    projectRoot: normalizedCwd,
    projectName: getProjectName(normalizedCwd),
    marker: null,
    isFallback: true,
  }
  cache.set(normalizedCwd, fallbackResult)
  return fallbackResult
}

/**
 * Clear the project root cache
 * Useful for testing or when filesystem changes
 */
export function clearProjectRootCache(): void {
  cache.clear()
}

/**
 * Singleton-like interface for project root detection
 */
export const projectRootDetector = {
  detectProjectRoot,
  getProjectName,
  clearCache: clearProjectRootCache,
}
