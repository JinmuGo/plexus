/**
 * Tmux Target Finder
 *
 * Finds tmux session/window/pane targets for Claude processes.
 */

import { execSync, exec } from 'node:child_process'
import type { TmuxTarget } from 'shared/hook-types'
import { buildProcessTree, isDescendant } from './process-tree'

/**
 * Find the tmux executable path
 */
function findTmuxPath(): string | undefined {
  // Common paths
  const paths = [
    '/opt/homebrew/bin/tmux',
    '/usr/local/bin/tmux',
    '/usr/bin/tmux',
  ]

  for (const p of paths) {
    try {
      execSync(`test -x ${p}`, { encoding: 'utf-8' })
      return p
    } catch {}
  }

  // Try which
  try {
    const result = execSync('which tmux', { encoding: 'utf-8' }).trim()
    if (result) return result
  } catch {
    // Ignore
  }

  return undefined
}

// Cached tmux path
let cachedTmuxPath: string | undefined

/**
 * Get the tmux path (cached)
 */
function getTmuxPath(): string | undefined {
  if (cachedTmuxPath === undefined) {
    cachedTmuxPath = findTmuxPath() || ''
  }
  return cachedTmuxPath || undefined
}

/**
 * Run a tmux command asynchronously
 */
function runTmuxCommandAsync(args: string[]): Promise<string | undefined> {
  return new Promise(resolve => {
    const tmuxPath = getTmuxPath()
    if (!tmuxPath) {
      resolve(undefined)
      return
    }

    exec(
      `${tmuxPath} ${args.join(' ')}`,
      { timeout: 5000 },
      (error, stdout) => {
        if (error) {
          resolve(undefined)
        } else {
          resolve(stdout)
        }
      }
    )
  })
}

/**
 * Parse a tmux target string like "session:1.0" into TmuxTarget
 */
function parseTargetString(targetString: string): TmuxTarget | undefined {
  // Format: session_name:window_index.pane_index
  const match = targetString.match(/^(.+):(\d+)\.(\d+)$/)
  if (!match) return undefined

  return {
    session: match[1],
    window: match[2],
    pane: match[3],
  }
}

/**
 * Find the tmux target for a given Claude PID
 */
export async function findTargetByPid(
  claudePid: number
): Promise<TmuxTarget | undefined> {
  // Note: Format string must be single-quoted to prevent shell from interpreting #{}
  const output = await runTmuxCommandAsync([
    'list-panes',
    '-a',
    '-F',
    "'#{session_name}:#{window_index}.#{pane_index} #{pane_pid}'",
  ])

  if (!output) return undefined

  const tree = buildProcessTree()

  for (const line of output.split('\n')) {
    const parts = line.split(' ')
    if (parts.length !== 2) continue

    const targetString = parts[0]
    const panePid = Number.parseInt(parts[1], 10)

    if (Number.isNaN(panePid)) continue

    if (isDescendant(claudePid, panePid, tree)) {
      return parseTargetString(targetString)
    }
  }

  return undefined
}

/**
 * Find the tmux target for a given working directory
 */
export async function findTargetByWorkingDir(
  workingDir: string
): Promise<TmuxTarget | undefined> {
  const output = await runTmuxCommandAsync([
    'list-panes',
    '-a',
    '-F',
    "'#{session_name}:#{window_index}.#{pane_index} #{pane_current_path}'",
  ])

  if (!output) return undefined

  for (const line of output.split('\n')) {
    const parts = line.split(' ')
    if (parts.length !== 2) continue

    const targetString = parts[0]
    const panePath = parts[1]

    if (panePath === workingDir) {
      return parseTargetString(targetString)
    }
  }

  return undefined
}

/**
 * Check if a session's tmux pane is currently the active pane
 */
export async function isSessionPaneActive(claudePid: number): Promise<boolean> {
  const sessionTarget = await findTargetByPid(claudePid)
  if (!sessionTarget) return false

  const output = await runTmuxCommandAsync([
    'display-message',
    '-p',
    "'#{session_name}:#{window_index}.#{pane_index}'",
  ])

  if (!output) return false

  const activeTarget = output.trim()
  const sessionTargetString = `${sessionTarget.session}:${sessionTarget.window}.${sessionTarget.pane}`

  return sessionTargetString === activeTarget
}

/**
 * Send keys to a tmux pane
 */
export async function sendKeys(
  target: TmuxTarget,
  keys: string
): Promise<boolean> {
  const targetString = `${target.session}:${target.window}.${target.pane}`
  const output = await runTmuxCommandAsync([
    'send-keys',
    '-t',
    targetString,
    keys,
  ])
  return output !== undefined
}

/**
 * Find the app that owns a TTY by walking up the process tree
 * Returns the app name (e.g., "WezTerm", "Cursor", "Code")
 */
export async function findAppFromTty(tty: string): Promise<string | undefined> {
  return new Promise(resolve => {
    const ttyName = tty.replace('/dev/', '')

    // Get the shell process PID for this TTY
    exec(
      `ps -t "${ttyName}" -o pid= 2>/dev/null | head -1`,
      { timeout: 3000 },
      (error, pidOutput) => {
        if (error || !pidOutput.trim()) {
          resolve(undefined)
          return
        }

        const shellPid = pidOutput.trim()

        // Walk up the process tree to find the app
        exec(
          `
          CURRENT_PID=${shellPid}
          for i in {1..10}; do
            PARENT_PID=$(ps -p $CURRENT_PID -o ppid= 2>/dev/null | tr -d ' ')
            if [ -z "$PARENT_PID" ] || [ "$PARENT_PID" = "1" ]; then
              break
            fi
            PARENT_COMM=$(ps -p $PARENT_PID -o comm= 2>/dev/null)
            # Check if this is an app
            if echo "$PARENT_COMM" | grep -q "\\.app/"; then
              echo "$PARENT_COMM"
              exit 0
            fi
            CURRENT_PID=$PARENT_PID
          done
          `,
          { timeout: 3000, shell: '/bin/bash' },
          (error2, appOutput) => {
            if (error2 || !appOutput.trim()) {
              resolve(undefined)
              return
            }

            // Extract app name from path like /Applications/Cursor.app/Contents/...
            const processPath = appOutput.trim()
            const appMatch = processPath.match(/\/([^/]+)\.app\//)
            if (appMatch) {
              resolve(appMatch[1])
            } else {
              resolve(undefined)
            }
          }
        )
      }
    )
  })
}

/**
 * Find the terminal app that owns the tmux client
 * Returns the process name of the terminal app
 */
async function findTerminalAppFromTmux(): Promise<string | undefined> {
  const tmuxPath = getTmuxPath()
  if (!tmuxPath) return undefined

  return new Promise(resolve => {
    // Get the TTY of the tmux client
    exec(
      `${tmuxPath} list-clients -F '#{client_tty}' | head -1`,
      { timeout: 3000 },
      (error, ttyOutput) => {
        if (error || !ttyOutput.trim()) {
          resolve(undefined)
          return
        }

        const tty = ttyOutput.trim()
        resolve(findAppFromTty(tty))
      }
    )
  })
}

/**
 * Activate the terminal application (macOS only)
 * First tries to find the terminal running tmux, then falls back to common terminals
 */
export async function activateTerminalApp(): Promise<boolean> {
  // First, try to find the terminal app that's running tmux
  const detectedApp = await findTerminalAppFromTmux()

  return new Promise(resolve => {
    let script: string

    if (detectedApp) {
      // Activate the detected terminal app
      script = `
        tell application "${detectedApp}" to activate
        return "${detectedApp}"
      `
    } else {
      // Fallback: check for various terminal apps
      script = `
        tell application "System Events"
          set terminalApps to {"WezTerm", "iTerm2", "iTerm", "kitty", "Alacritty", "Hyper", "Tabby", "Terminal"}
          repeat with appName in terminalApps
            if exists (process appName) then
              tell application appName to activate
              return appName as string
            end if
          end repeat
          return "none"
        end tell
      `
    }

    exec(`osascript -e '${script}'`, { timeout: 3000 }, (error, stdout) => {
      if (error) {
        resolve(false)
      } else {
        resolve(stdout.trim() !== 'none')
      }
    })
  })
}

/**
 * Focus a tmux pane (switch client to session, select window/pane, bring terminal to foreground)
 */
export async function focusPane(target: TmuxTarget): Promise<boolean> {
  const paneTarget = `${target.session}:${target.window}.${target.pane}`

  // Use switch-client to switch the current tmux client to the target session/window/pane
  const switchResult = await runTmuxCommandAsync([
    'switch-client',
    '-t',
    paneTarget,
  ])

  if (switchResult === undefined) {
    // switch-client may fail if there's no attached client, try select-window/pane as fallback
    const windowTarget = `${target.session}:${target.window}`

    const windowResult = await runTmuxCommandAsync([
      'select-window',
      '-t',
      windowTarget,
    ])
    if (windowResult === undefined) return false

    const paneResult = await runTmuxCommandAsync([
      'select-pane',
      '-t',
      paneTarget,
    ])
    if (paneResult === undefined) return false
  }

  // Activate the terminal app to bring it to foreground
  await activateTerminalApp()

  return true
}

/**
 * Send interrupt (Ctrl+C) to a tmux pane
 */
export async function sendInterrupt(target: TmuxTarget): Promise<boolean> {
  return sendKeys(target, 'C-c')
}

/**
 * Kill a tmux pane
 */
export async function killPane(target: TmuxTarget): Promise<boolean> {
  const targetString = `${target.session}:${target.window}.${target.pane}`
  const output = await runTmuxCommandAsync(['kill-pane', '-t', targetString])
  return output !== undefined
}

/**
 * Check if tmux is available
 */
export function isTmuxAvailable(): boolean {
  return getTmuxPath() !== undefined
}

/**
 * List all tmux sessions
 */
export async function listSessions(): Promise<string[]> {
  const output = await runTmuxCommandAsync([
    'list-sessions',
    '-F',
    '#{session_name}',
  ])
  if (!output) return []
  return output.split('\n').filter(s => s.trim())
}

/**
 * Activate an app by name using AppleScript
 */
async function activateApp(appName: string): Promise<boolean> {
  return new Promise(resolve => {
    const script = `tell application "${appName}" to activate`
    exec(`osascript -e '${script}'`, { timeout: 3000 }, error => {
      resolve(!error)
    })
  })
}

/**
 * Focus a session by its TTY (for non-tmux sessions)
 * Works with VSCode, Cursor, iTerm, Terminal.app, and other terminal apps
 */
export async function focusByTty(tty: string): Promise<boolean> {
  const appName = await findAppFromTty(tty)
  if (!appName) return false
  return activateApp(appName)
}

/**
 * Focus Cursor IDE by opening the workspace folder
 * Uses the `cursor` CLI to open or focus the folder
 */
export async function focusCursor(cwd: string): Promise<boolean> {
  return new Promise(resolve => {
    // Use cursor CLI to open the folder - this will focus existing window if already open
    exec(`cursor "${cwd}"`, { timeout: 5000 }, error => {
      if (error) {
        // Fallback: just activate Cursor app
        activateApp('Cursor').then(resolve)
      } else {
        resolve(true)
      }
    })
  })
}

// Singleton-like interface
export const tmuxTargetFinder = {
  findTargetByPid,
  findTargetByWorkingDir,
  isSessionPaneActive,
  sendKeys,
  focusPane,
  focusByTty,
  focusCursor,
  sendInterrupt,
  killPane,
  isTmuxAvailable,
  listSessions,
  findAppFromTty,
  activateTerminalApp,
}
