/**
 * Gemini Hook Installer
 *
 * Manages installation and uninstallation of the Plexus hook script
 * in ~/.gemini/hooks/ and updates ~/.gemini/settings.json
 */

import * as path from 'node:path'
import { execSync } from 'node:child_process'
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
  getGeminiDir,
  getHooksDir,
  getSettingsFile,
} from '../constants/hooks/gemini'
import { devLog } from '../lib/utils'

// Compute paths at module level for convenience
const GEMINI_DIR = getGeminiDir()
const HOOKS_DIR = getHooksDir()
const SETTINGS_FILE = getSettingsFile()

// Hook events to register (Gemini CLI event names)
// SessionStart matchers: startup, resume, clear
// SessionEnd matchers: exit, clear, logout, prompt_input_exit, other
// PreCompress matchers: manual, auto
// Notification matchers: ToolPermission
// BeforeTool/AfterTool matchers: tool name patterns or *
const HOOK_EVENTS = [
  // SessionStart - register for all session start types
  { name: 'SessionStart', config: 'withMatcher', matcher: 'startup' },
  { name: 'SessionStart', config: 'withMatcher', matcher: 'resume' },
  { name: 'SessionStart', config: 'withMatcher', matcher: 'clear' },
  // SessionEnd - register for all session end types
  { name: 'SessionEnd', config: 'withMatcher', matcher: 'exit' },
  { name: 'SessionEnd', config: 'withMatcher', matcher: 'clear' },
  { name: 'SessionEnd', config: 'withMatcher', matcher: 'logout' },
  { name: 'SessionEnd', config: 'withMatcher', matcher: 'prompt_input_exit' },
  { name: 'SessionEnd', config: 'withMatcher', matcher: 'other' },
  // Agent events - no matcher needed
  { name: 'BeforeAgent', config: 'withoutMatcher' },
  { name: 'AfterAgent', config: 'withoutMatcher' },
  // Model events - for detecting response completion
  { name: 'AfterModel', config: 'withoutMatcher' },
  // Tool events - use * for all tools
  { name: 'BeforeTool', config: 'withMatcher', matcher: '*' },
  { name: 'AfterTool', config: 'withMatcher', matcher: '*' },
  // PreCompress - register for both types
  { name: 'PreCompress', config: 'withMatcher', matcher: 'manual' },
  { name: 'PreCompress', config: 'withMatcher', matcher: 'auto' },
  // Notification - only tool permission
  {
    name: 'Notification',
    config: 'withMatcherAndTimeout',
    matcher: 'ToolPermission',
  },
] as const

type ConfigType = 'withMatcher' | 'withMatcherAndTimeout' | 'withoutMatcher'

interface HookEntry {
  name: string
  type: 'command'
  command: string
  description?: string
  timeout?: number
}

interface HookConfig {
  matcher?: string
  hooks: HookEntry[]
}

interface GeminiSettings {
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
  // Use absolute path instead of ~ for shell compatibility
  const scriptPath = getDestScriptPath()
  return `${nodePath} ${scriptPath}`
}

/**
 * Generate hook configuration for a given type
 */
function generateHookConfig(
  configType: ConfigType,
  command: string,
  matcher?: string
): HookConfig[] {
  const hookEntry: HookEntry = {
    name: 'plexus-tracker',
    type: 'command',
    command,
    description: 'Plexus agent tracking hook',
  }

  switch (configType) {
    case 'withMatcher':
      return [{ matcher: matcher || '*', hooks: [hookEntry] }]

    case 'withMatcherAndTimeout':
      return [
        {
          matcher: matcher || '*',
          hooks: [{ ...hookEntry, timeout: 86400000 }], // 24 hours in ms
        },
      ]

    case 'withoutMatcher':
      return [{ hooks: [hookEntry] }]
  }
}

/**
 * Read the current settings.json
 */
function readSettings(): GeminiSettings {
  return readJsonSettings<GeminiSettings>(SETTINGS_FILE, {})
}

/**
 * Write settings.json
 */
function writeSettings(settings: GeminiSettings): void {
  devLog.log(`[GeminiHookInstaller] Writing to ${SETTINGS_FILE}`)
  if (!writeJsonSettings(SETTINGS_FILE, settings)) {
    devLog.error('[GeminiHookInstaller] Failed to write settings')
  } else {
    devLog.log('[GeminiHookInstaller] Settings written successfully')
  }
}

/**
 * Check if our hook is already registered for an event
 */
function hasOurHook(configs: HookConfig[]): boolean {
  return configs.some(config =>
    config.hooks?.some(
      hook =>
        hook.command?.includes(HOOK_SCRIPT_NAME) ||
        hook.name === 'plexus-tracker'
    )
  )
}

/**
 * Check if our hook is already registered for a specific matcher
 */
function hasOurHookForMatcher(
  configs: HookConfig[],
  matcher: string | undefined
): boolean {
  return configs.some(
    config =>
      config.matcher === matcher &&
      config.hooks?.some(
        hook =>
          hook.command?.includes(HOOK_SCRIPT_NAME) ||
          hook.name === 'plexus-tracker'
      )
  )
}

/**
 * Check if Gemini CLI is installed
 */
export function isGeminiCliInstalled(): boolean {
  try {
    execSync('which gemini', { encoding: 'utf-8' })
    return true
  } catch {
    return false
  }
}

/**
 * Install the hook script and update settings
 */
export async function installIfNeeded(): Promise<void> {
  devLog.log('[GeminiHookInstaller] Checking hook installation...')

  // Check if Gemini CLI is installed
  if (!isGeminiCliInstalled()) {
    devLog.log('[GeminiHookInstaller] Gemini CLI not found, skipping')
    return
  }

  // Ensure directories exist
  ensureDirectory(GEMINI_DIR)
  ensureDirectory(HOOKS_DIR)

  // Copy the hook script
  const sourcePath = getSourceScriptPath()
  const destPath = getDestScriptPath()

  // Check if source exists
  if (!fileExists(sourcePath)) {
    devLog.warn(`[GeminiHookInstaller] Source script not found: ${sourcePath}`)
    devLog.warn(
      '[GeminiHookInstaller] Hook script will need to be installed manually'
    )
    return
  }

  // Copy script with executable permissions
  if (!copyScriptWithPermissions(sourcePath, destPath)) {
    devLog.error('[GeminiHookInstaller] Failed to install script')
    return
  }
  devLog.log(`[GeminiHookInstaller] Script installed: ${destPath}`)

  // Update settings.json
  const settings = readSettings()
  const hooks = settings.hooks || {}
  const command = getHookCommand()

  for (const hookEvent of HOOK_EVENTS) {
    const { name, config } = hookEvent
    const matcher = 'matcher' in hookEvent ? hookEvent.matcher : undefined
    const existingConfigs = hooks[name] as HookConfig[] | undefined

    if (existingConfigs) {
      // Check if our hook is already registered for this specific matcher
      if (!hasOurHookForMatcher(existingConfigs, matcher)) {
        // Add our hook to existing configs
        const newConfigs = generateHookConfig(config, command, matcher)
        hooks[name] = [...existingConfigs, ...newConfigs]
        devLog.log(
          `[GeminiHookInstaller] Added hook for ${name} (${matcher || 'no matcher'})`
        )
      }
    } else {
      // Create new hook entry
      hooks[name] = generateHookConfig(config, command, matcher)
      devLog.log(
        `[GeminiHookInstaller] Created hook for ${name} (${matcher || 'no matcher'})`
      )
    }
  }

  settings.hooks = hooks
  writeSettings(settings)
  devLog.log('[GeminiHookInstaller] Installation complete')
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
  devLog.log('[GeminiHookInstaller] Uninstalling hooks...')

  // Remove script
  const scriptPath = getDestScriptPath()
  if (removeFile(scriptPath)) {
    devLog.log(`[GeminiHookInstaller] Script removed: ${scriptPath}`)
  }

  // Update settings.json
  const settings = readSettings()
  const hooks = settings.hooks

  if (!hooks) {
    devLog.log('[GeminiHookInstaller] No hooks to remove')
    return
  }

  for (const { name } of HOOK_EVENTS) {
    const configs = hooks[name] as HookConfig[] | undefined

    if (configs) {
      // Remove our hook entries
      const filtered = configs.filter(
        config =>
          !config.hooks?.some(
            hook =>
              hook.command?.includes(HOOK_SCRIPT_NAME) ||
              hook.name === 'plexus-tracker'
          )
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
  devLog.log('[GeminiHookInstaller] Uninstallation complete')
}

// Export singleton interface
export const geminiHookInstaller = {
  installIfNeeded,
  isInstalled,
  uninstall,
  isGeminiCliInstalled,
}
