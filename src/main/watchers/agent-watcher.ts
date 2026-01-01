/**
 * Agent File Watcher
 *
 * Watches agent JSONL files for real-time subagent tool updates.
 * Each Task tool gets its own watcher for its agent file.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { SubagentToolInfo } from 'shared/hook-types'
import { jsonlParser } from './jsonl-parser'

// Callback type for agent tool updates
export type AgentToolsHandler = (
  sessionId: string,
  taskToolId: string,
  tools: SubagentToolInfo[]
) => void

/**
 * Single agent file watcher
 */
class AgentFileWatcher {
  private sessionId: string
  private taskToolId: string
  private agentId: string
  private cwd: string
  private filePath: string
  private watcher: fs.FSWatcher | null = null
  private pollInterval: NodeJS.Timeout | null = null
  private seenToolIds: Set<string> = new Set()
  private onUpdate: AgentToolsHandler

  constructor(
    sessionId: string,
    taskToolId: string,
    agentId: string,
    cwd: string,
    onUpdate: AgentToolsHandler
  ) {
    this.sessionId = sessionId
    this.taskToolId = taskToolId
    this.agentId = agentId
    this.cwd = cwd
    this.onUpdate = onUpdate

    const projectDir = cwd.replace(/\//g, '-').replace(/\./g, '-')
    this.filePath = path.join(
      os.homedir(),
      '.claude',
      'projects',
      projectDir,
      `agent-${agentId}.jsonl`
    )
  }

  /**
   * Start watching the agent file
   */
  start(): void {
    this.stop()

    if (!fs.existsSync(this.filePath)) {
      console.log(
        `[AgentWatcher] File not found, waiting for creation: agent-${this.agentId.slice(0, 8)}`
      )
      this.waitForFile()
      return
    }

    this.startWatching()
  }

  /**
   * Wait for file to be created
   */
  private waitForFile(): void {
    const checkInterval = setInterval(() => {
      if (fs.existsSync(this.filePath)) {
        clearInterval(checkInterval)
        this.startWatching()
      }
    }, 500)

    this.pollInterval = checkInterval
  }

  /**
   * Start the actual file watching
   */
  private startWatching(): void {
    // Initial parse
    this.parseTools()

    try {
      this.watcher = fs.watch(this.filePath, eventType => {
        if (eventType === 'change') {
          this.parseTools()
        }
      })

      this.watcher.on('error', error => {
        console.error(
          `[AgentWatcher] Watcher error for agent-${this.agentId.slice(0, 8)}:`,
          error
        )
      })

      console.log(
        `[AgentWatcher] Started watching agent-${this.agentId.slice(0, 8)} for task ${this.taskToolId.slice(0, 12)}`
      )
    } catch (error) {
      console.error(
        `[AgentWatcher] Failed to start watching agent-${this.agentId.slice(0, 8)}:`,
        error
      )
    }
  }

  /**
   * Parse tools from the agent file
   */
  private parseTools(): void {
    const tools = jsonlParser.parseSubagentTools(this.agentId, this.cwd)

    // Check if there are any changes
    const newTools = tools.filter(t => !this.seenToolIds.has(t.id))
    const hasChanges =
      newTools.length > 0 || tools.length !== this.seenToolIds.size

    if (!hasChanges) return

    this.seenToolIds = new Set(tools.map(t => t.id))
    console.log(
      `[AgentWatcher] Agent ${this.agentId.slice(0, 8)} has ${tools.length} tools`
    )

    this.onUpdate(this.sessionId, this.taskToolId, tools)
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
      console.log(
        `[AgentWatcher] Stopped watching agent-${this.agentId.slice(0, 8)}`
      )
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }
}

/**
 * Agent Watcher Manager
 *
 * Manages agent file watchers for active Task tools.
 */
class AgentWatcherManager {
  private watchers: Map<string, AgentFileWatcher> = new Map()
  private handler: AgentToolsHandler | null = null

  /**
   * Generate key for watcher map
   */
  private makeKey(sessionId: string, taskToolId: string): string {
    return `${sessionId}-${taskToolId}`
  }

  /**
   * Set the update handler
   */
  setHandler(handler: AgentToolsHandler): void {
    this.handler = handler
  }

  /**
   * Start watching an agent file for a Task tool
   */
  start(
    sessionId: string,
    taskToolId: string,
    agentId: string,
    cwd: string
  ): void {
    const key = this.makeKey(sessionId, taskToolId)

    if (this.watchers.has(key)) {
      return
    }

    if (!this.handler) {
      console.warn('[AgentWatcher] No handler set, skipping watcher')
      return
    }

    const watcher = new AgentFileWatcher(
      sessionId,
      taskToolId,
      agentId,
      cwd,
      this.handler
    )
    watcher.start()
    this.watchers.set(key, watcher)

    console.log(
      `[AgentWatcher] Started watcher for task ${taskToolId.slice(0, 12)}`
    )
  }

  /**
   * Stop watching a specific Task's agent file
   */
  stop(sessionId: string, taskToolId: string): void {
    const key = this.makeKey(sessionId, taskToolId)
    const watcher = this.watchers.get(key)

    if (watcher) {
      watcher.stop()
      this.watchers.delete(key)
    }
  }

  /**
   * Stop all watchers for a session
   */
  stopSession(sessionId: string): void {
    const keysToRemove: string[] = []

    for (const key of this.watchers.keys()) {
      if (key.startsWith(sessionId)) {
        keysToRemove.push(key)
      }
    }

    for (const key of keysToRemove) {
      const watcher = this.watchers.get(key)
      if (watcher) {
        watcher.stop()
        this.watchers.delete(key)
      }
    }

    if (keysToRemove.length > 0) {
      console.log(
        `[AgentWatcher] Stopped ${keysToRemove.length} watchers for session ${sessionId.slice(0, 8)}`
      )
    }
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const watcher of this.watchers.values()) {
      watcher.stop()
    }
    this.watchers.clear()
    console.log('[AgentWatcher] Stopped all watchers')
  }

  /**
   * Check if a Task's agent file is being watched
   */
  isWatching(sessionId: string, taskToolId: string): boolean {
    const key = this.makeKey(sessionId, taskToolId)
    return this.watchers.has(key)
  }

  /**
   * Get count of active watchers
   */
  getCount(): number {
    return this.watchers.size
  }
}

// Singleton instance
export const agentWatcher = new AgentWatcherManager()
