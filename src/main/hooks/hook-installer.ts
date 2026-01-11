/**
 * Hook Installer
 *
 * Manages installation and uninstallation of the Plexus hook script
 * in ~/.claude/hooks/ and updates ~/.claude/settings.json
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
  getClaudeDir,
  getHooksDir,
  getSettingsFile,
} from '../constants/hooks/claude'
import { devLog } from '../lib/utils'

// Compute paths at module level for convenience
const CLAUDE_DIR = getClaudeDir()
const HOOKS_DIR = getHooksDir()
const SETTINGS_FILE = getSettingsFile()

/**
 * Check if Claude Code is installed
 * Checks if ~/.claude directory exists (created when Claude Code is first run)
 */
export function isClaudeCodeInstalled(): boolean {
  try {
    return fs.existsSync(CLAUDE_DIR) && fs.statSync(CLAUDE_DIR).isDirectory()
  } catch {
    return false
  }
}

// Hook events to register
const HOOK_EVENTS = [
  { name: 'UserPromptSubmit', config: 'withoutMatcher' },
  { name: 'PreToolUse', config: 'withMatcher' },
  { name: 'PostToolUse', config: 'withMatcher' },
  { name: 'PostToolUseFailure', config: 'withMatcher' }, // Tool execution failure tracking
  { name: 'PermissionRequest', config: 'withMatcherAndTimeout' },
  { name: 'Notification', config: 'withMatcher' },
  { name: 'Stop', config: 'withoutMatcher' },
  { name: 'SubagentStop', config: 'withoutMatcher' },
  { name: 'SessionStart', config: 'withoutMatcher' },
  { name: 'SessionEnd', config: 'withoutMatcher' },
  { name: 'PreCompact', config: 'preCompact' },
] as const

type ConfigType =
  | 'withMatcher'
  | 'withMatcherAndTimeout'
  | 'withoutMatcher'
  | 'preCompact'

interface HookEntry {
  type: 'command'
  command: string
  timeout?: number
}

interface HookConfig {
  matcher?: string
  hooks: HookEntry[]
}

interface ClaudeSettings {
  hooks?: Record<string, HookConfig[]>
  [key: string]: unknown
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
  const scriptPath = `~/.claude/hooks/${HOOK_SCRIPT_NAME}`
  return `${nodePath} ${scriptPath}`
}

/**
 * Generate hook configuration for a given type
 */
function generateHookConfig(
  configType: ConfigType,
  command: string
): HookConfig[] {
  const hookEntry: HookEntry = { type: 'command', command }

  switch (configType) {
    case 'withMatcher':
      return [{ matcher: '*', hooks: [hookEntry] }]

    case 'withMatcherAndTimeout':
      return [
        { matcher: '*', hooks: [{ ...hookEntry, timeout: 86400 }] }, // 24 hours
      ]

    case 'withoutMatcher':
      return [{ hooks: [hookEntry] }]

    case 'preCompact':
      return [
        { matcher: 'auto', hooks: [hookEntry] },
        { matcher: 'manual', hooks: [hookEntry] },
      ]
  }
}

/**
 * Read the current settings.json
 */
function readSettings(): ClaudeSettings {
  return readJsonSettings<ClaudeSettings>(SETTINGS_FILE, {})
}

/**
 * Write settings.json
 */
function writeSettings(settings: ClaudeSettings): void {
  if (!writeJsonSettings(SETTINGS_FILE, settings)) {
    devLog.error('[HookInstaller] Failed to write settings')
  }
}

/**
 * Check if our hook is already registered for an event
 */
function hasOurHook(configs: HookConfig[]): boolean {
  return configs.some(config =>
    config.hooks?.some(hook => hook.command?.includes(HOOK_SCRIPT_NAME))
  )
}

/**
 * Install the hook script and update settings
 */
export async function installIfNeeded(): Promise<void> {
  devLog.log('[HookInstaller] Checking hook installation...')

  // Ensure directories exist
  ensureDirectory(CLAUDE_DIR)
  ensureDirectory(HOOKS_DIR)

  // Copy the hook script
  const sourcePath = getSourceScriptPath()
  const destPath = getDestScriptPath()

  // Check if source exists
  if (!fileExists(sourcePath)) {
    devLog.warn(`[HookInstaller] Source script not found: ${sourcePath}`)
    devLog.warn(
      '[HookInstaller] Hook script will need to be installed manually'
    )
    return
  }

  // Copy script with executable permissions
  if (!copyScriptWithPermissions(sourcePath, destPath)) {
    devLog.error('[HookInstaller] Failed to install script')
    return
  }
  devLog.log(`[HookInstaller] Script installed: ${destPath}`)

  // Update settings.json
  const settings = readSettings()
  const hooks = settings.hooks || {}
  const command = getHookCommand()

  for (const { name, config } of HOOK_EVENTS) {
    const existingConfigs = hooks[name] as HookConfig[] | undefined

    if (existingConfigs) {
      // Check if our hook is already registered
      if (!hasOurHook(existingConfigs)) {
        // Add our hook to existing configs
        const newConfigs = generateHookConfig(config, command)
        hooks[name] = [...existingConfigs, ...newConfigs]
        devLog.log(`[HookInstaller] Added hook for ${name}`)
      }
    } else {
      // Create new hook entry
      hooks[name] = generateHookConfig(config, command)
      devLog.log(`[HookInstaller] Created hook for ${name}`)
    }
  }

  settings.hooks = hooks
  writeSettings(settings)
  devLog.log('[HookInstaller] Installation complete')
}

/**
 * Check if hooks are currently installed
 */
export function isInstalled(): boolean {
  // Check if script exists
  if (!fileExists(getDestScriptPath())) {
    return false
  }

  // Check if at least one hook is registered
  const settings = readSettings()
  const hooks = settings.hooks

  if (!hooks) {
    return false
  }

  for (const { name } of HOOK_EVENTS) {
    const configs = hooks[name] as HookConfig[] | undefined
    if (configs && hasOurHook(configs)) {
      return true
    }
  }

  return false
}

/**
 * Uninstall hooks from settings.json and remove script
 */
export async function uninstall(): Promise<void> {
  devLog.log('[HookInstaller] Uninstalling hooks...')

  // Remove script
  const scriptPath = getDestScriptPath()
  if (removeFile(scriptPath)) {
    devLog.log(`[HookInstaller] Script removed: ${scriptPath}`)
  }

  // Update settings.json
  const settings = readSettings()
  const hooks = settings.hooks

  if (!hooks) {
    devLog.log('[HookInstaller] No hooks to remove')
    return
  }

  for (const { name } of HOOK_EVENTS) {
    const configs = hooks[name] as HookConfig[] | undefined

    if (configs) {
      // Remove our hook entries
      const filtered = configs.filter(
        config =>
          !config.hooks?.some(hook => hook.command?.includes(HOOK_SCRIPT_NAME))
      )

      if (filtered.length === 0) {
        delete hooks[name]
      } else {
        hooks[name] = filtered
      }
    }
  }

  // Remove hooks key if empty
  if (Object.keys(hooks).length === 0) {
    delete settings.hooks
  } else {
    settings.hooks = hooks
  }

  writeSettings(settings)
  devLog.log('[HookInstaller] Uninstallation complete')
}

// Export for testing (backward compatibility)
export const _internal = {
  detectNodePath,
  getSourceScriptPath,
  getDestScriptPath,
  getHookCommand,
  readSettings,
  writeSettings,
}
