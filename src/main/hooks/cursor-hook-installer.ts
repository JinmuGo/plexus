/**
 * Cursor Hook Installer
 *
 * Manages installation and uninstallation of the Plexus hook script
 * in ~/.cursor/hooks/ and updates ~/.cursor/hooks.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  detectNodePath,
  ensureDirectory,
  copyScriptWithPermissions,
  readJsonSettings,
  writeJsonSettings,
  getHookSourcePath,
  fileExists,
  removeFile,
} from './utils'
import {
  HOOK_SCRIPT_NAME,
  getCursorDir,
  getHooksDir,
  getHooksConfigFile,
} from '../constants/hooks/cursor'

// Compute paths at module level for convenience
const CURSOR_DIR = getCursorDir()
const HOOKS_DIR = getHooksDir()
const HOOKS_CONFIG_FILE = getHooksConfigFile()

// Agent hook events to register (not Tab hooks per user preference)
const HOOK_EVENTS = [
  'beforeShellExecution',
  'afterShellExecution',
  'beforeMCPExecution',
  'afterMCPExecution',
  'beforeReadFile',
  'afterFileEdit',
  'beforeSubmitPrompt',
  'afterAgentResponse',
  'afterAgentThought',
  'stop',
] as const

interface HookCommand {
  command: string
}

interface CursorHooksConfig {
  version: 1
  hooks: Record<string, HookCommand[]>
}

/**
 * Check if Cursor is installed
 */
export function isCursorInstalled(): boolean {
  try {
    // Check if ~/.cursor directory exists
    return fs.existsSync(CURSOR_DIR) && fs.statSync(CURSOR_DIR).isDirectory()
  } catch {
    return false
  }
}

/**
 * Get the source path of the hook script (bundled with app)
 */
function getSourceScriptPath(): string {
  return getHookSourcePath(HOOK_SCRIPT_NAME)
}

/**
 * Get the destination path for the hook script
 */
function getDestScriptPath(): string {
  return path.join(HOOKS_DIR, HOOK_SCRIPT_NAME)
}

/**
 * Generate the hook command
 */
function getHookCommand(): string {
  const nodePath = detectNodePath()
  const scriptPath = getDestScriptPath()
  return `${nodePath} ${scriptPath}`
}

/**
 * Read hooks.json file
 */
function readHooksConfig(): CursorHooksConfig {
  return readJsonSettings<CursorHooksConfig>(HOOKS_CONFIG_FILE, {
    version: 1,
    hooks: {},
  })
}

/**
 * Write hooks.json file
 */
function writeHooksConfig(config: CursorHooksConfig): boolean {
  return writeJsonSettings(HOOKS_CONFIG_FILE, config)
}

/**
 * Check if our hook is registered for a given event
 */
function hasOurHook(config: CursorHooksConfig, eventName: string): boolean {
  const hooks = config.hooks[eventName]
  if (!hooks || hooks.length === 0) return false

  const hookCommand = getHookCommand()
  const destPath = getDestScriptPath()

  return hooks.some(
    hook =>
      hook.command === hookCommand ||
      hook.command.includes(HOOK_SCRIPT_NAME) ||
      hook.command.includes(destPath)
  )
}

/**
 * Add our hook to the config for a given event
 */
function addOurHook(config: CursorHooksConfig, eventName: string): void {
  // Initialize hooks array if it doesn't exist
  if (!config.hooks[eventName]) {
    config.hooks[eventName] = []
  }

  // Check if our hook is already registered
  if (hasOurHook(config, eventName)) {
    return // Already registered
  }

  // Add our hook command
  const hookCommand = getHookCommand()
  config.hooks[eventName].push({ command: hookCommand })
}

/**
 * Remove our hook from the config for a given event
 */
function removeOurHook(config: CursorHooksConfig, eventName: string): void {
  const hooks = config.hooks[eventName]
  if (!hooks) return

  const destPath = getDestScriptPath()

  config.hooks[eventName] = hooks.filter(
    hook =>
      !hook.command.includes(HOOK_SCRIPT_NAME) &&
      !hook.command.includes(destPath)
  )

  // Clean up empty arrays
  if (config.hooks[eventName].length === 0) {
    delete config.hooks[eventName]
  }
}

/**
 * Check if the hook is installed
 */
export function isInstalled(): boolean {
  try {
    // Check if script exists
    const destPath = getDestScriptPath()
    if (!fileExists(destPath)) {
      return false
    }

    // Check if at least one hook is registered
    const config = readHooksConfig()
    for (const eventName of HOOK_EVENTS) {
      if (hasOurHook(config, eventName)) {
        return true
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * Install the hook if needed
 */
export async function installIfNeeded(): Promise<boolean> {
  try {
    // Check if Cursor is installed
    if (!isCursorInstalled()) {
      console.log('[Cursor] Cursor not found, skipping hook installation')
      return false
    }

    // Create hooks directory if it doesn't exist
    ensureDirectory(HOOKS_DIR)

    // Copy hook script
    const sourcePath = getSourceScriptPath()
    const destPath = getDestScriptPath()

    if (!fileExists(sourcePath)) {
      console.error('[Cursor] Source hook script not found:', sourcePath)
      return false
    }

    // Copy the script with executable permissions
    if (!copyScriptWithPermissions(sourcePath, destPath)) {
      console.error('[Cursor] Failed to install hook script')
      return false
    }

    console.log(`[Cursor] Hook script installed to ${destPath}`)

    // Read existing hooks.json
    const config = readHooksConfig()

    // Add our hooks for all events
    for (const eventName of HOOK_EVENTS) {
      addOurHook(config, eventName)
    }

    // Write updated config
    if (!writeHooksConfig(config)) {
      return false
    }

    console.log('[Cursor] Hooks registered in hooks.json')
    return true
  } catch (error) {
    console.error('[Cursor] Failed to install hooks:', error)
    return false
  }
}

/**
 * Uninstall the hook
 */
export async function uninstall(): Promise<boolean> {
  try {
    // Remove hook script
    const destPath = getDestScriptPath()
    if (removeFile(destPath)) {
      console.log('[Cursor] Hook script removed')
    }

    // Remove from hooks.json
    if (fileExists(HOOKS_CONFIG_FILE)) {
      const config = readHooksConfig()

      // Remove our hooks from all events
      for (const eventName of HOOK_EVENTS) {
        removeOurHook(config, eventName)
      }

      // Write updated config
      writeHooksConfig(config)
      console.log('[Cursor] Hooks removed from hooks.json')
    }

    return true
  } catch (error) {
    console.error('[Cursor] Failed to uninstall hooks:', error)
    return false
  }
}
