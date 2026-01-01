/**
 * Process Tree Builder
 *
 * Builds and queries process trees using ps command.
 * Used for mapping Claude PIDs to terminal windows and tmux panes.
 */

import { execSync } from 'node:child_process'

/**
 * Information about a process
 */
export interface ProcessInfo {
  pid: number
  ppid: number
  command: string
  tty?: string
}

/**
 * Process tree mapping PID -> ProcessInfo
 */
export type ProcessTree = Map<number, ProcessInfo>

/**
 * Build a process tree from ps command output
 */
export function buildProcessTree(): ProcessTree {
  const tree: ProcessTree = new Map()

  try {
    const output = execSync('/bin/ps -eo pid,ppid,tty,comm', {
      encoding: 'utf-8',
      timeout: 5000,
    })

    const lines = output.split('\n')

    for (const line of lines) {
      const parts = line
        .trim()
        .split(/\s+/)
        .filter(p => p)

      if (parts.length < 4) continue

      const pid = Number.parseInt(parts[0], 10)
      const ppid = Number.parseInt(parts[1], 10)

      if (Number.isNaN(pid) || Number.isNaN(ppid)) continue

      const tty = parts[2] === '??' ? undefined : parts[2]
      const command = parts.slice(3).join(' ')

      tree.set(pid, { pid, ppid, command, tty })
    }
  } catch (error) {
    console.error('[ProcessTree] Failed to build tree:', error)
  }

  return tree
}

/**
 * Check if a process has tmux in its parent chain
 */
export function isInTmux(pid: number, tree: ProcessTree): boolean {
  let current = pid
  let depth = 0

  while (current > 1 && depth < 20) {
    const info = tree.get(current)
    if (!info) break

    if (info.command.toLowerCase().includes('tmux')) {
      return true
    }

    current = info.ppid
    depth++
  }

  return false
}

/**
 * Check if targetPid is a descendant of ancestorPid
 */
export function isDescendant(
  targetPid: number,
  ancestorPid: number,
  tree: ProcessTree
): boolean {
  let current = targetPid
  let depth = 0

  while (current > 1 && depth < 50) {
    if (current === ancestorPid) {
      return true
    }

    const info = tree.get(current)
    if (!info) break

    current = info.ppid
    depth++
  }

  return false
}

/**
 * Find all descendant PIDs of a given process
 */
export function findDescendants(pid: number, tree: ProcessTree): Set<number> {
  const descendants = new Set<number>()
  const queue = [pid]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break

    for (const [childPid, info] of tree) {
      if (info.ppid === current && !descendants.has(childPid)) {
        descendants.add(childPid)
        queue.push(childPid)
      }
    }
  }

  return descendants
}

/**
 * Walk up the process tree to find process matching a condition
 */
export function findAncestor(
  pid: number,
  tree: ProcessTree,
  predicate: (info: ProcessInfo) => boolean
): ProcessInfo | undefined {
  let current = pid
  let depth = 0

  while (current > 1 && depth < 20) {
    const info = tree.get(current)
    if (!info) break

    if (predicate(info)) {
      return info
    }

    current = info.ppid
    depth++
  }

  return undefined
}

/**
 * Get working directory for a process using lsof
 */
export function getWorkingDirectory(pid: number): string | undefined {
  try {
    const output = execSync(`/usr/sbin/lsof -p ${pid} -Fn`, {
      encoding: 'utf-8',
      timeout: 5000,
    })

    let foundCwd = false
    for (const line of output.split('\n')) {
      if (line === 'fcwd') {
        foundCwd = true
      } else if (foundCwd && line.startsWith('n')) {
        return line.slice(1)
      }
    }
  } catch {
    // Ignore errors
  }

  return undefined
}

// Singleton-like interface
export const processTree = {
  buildTree: buildProcessTree,
  isInTmux,
  isDescendant,
  findDescendants,
  findAncestor,
  getWorkingDirectory,
}
