#!/usr/bin/env npx tsx
/**
 * Hook Installation Script
 *
 * Standalone script to install Plexus hooks for all supported AI agents.
 * Run during postinstall or manually via `pnpm install:hooks`
 *
 * Supports:
 * - Claude Code (~/.claude/hooks/)
 * - Gemini CLI (~/.gemini/hooks/)
 * - Cursor IDE (~/.cursor/hooks/)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

// ============================================================================
// Utilities
// ============================================================================

const HOME = process.env.HOME || ''

function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

function copyScriptWithPermissions(
  sourcePath: string,
  destPath: string
): boolean {
  try {
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath)
    }
    fs.copyFileSync(sourcePath, destPath)
    fs.chmodSync(destPath, 0o755)
    return true
  } catch (error) {
    console.error(`Failed to copy script: ${error}`)
    return false
  }
}

function readJsonFile<T extends object>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as T
    }
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error)
  }
  return defaultValue
}

function writeJsonFile<T extends object>(filePath: string, data: T): boolean {
  try {
    const content = JSON.stringify(data, null, 2)
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (error) {
    console.error(`Failed to write ${filePath}:`, error)
    return false
  }
}

function detectNodePath(): string {
  // Try common node paths
  const candidates = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
    path.join(HOME, '.local/share/fnm/aliases/default/bin/node'),
    path.join(HOME, '.nvm/versions/node/v22.0.0/bin/node'),
  ]

  for (const nodePath of candidates) {
    if (fs.existsSync(nodePath)) {
      return nodePath
    }
  }

  // Fallback to which
  try {
    return execSync('which node', { encoding: 'utf-8' }).trim()
  } catch {
    return 'node'
  }
}

function getHooksSourceDir(): string {
  // In development/postinstall, hooks are compiled to node_modules/.dev/hooks/
  return path.join(__dirname, '..', 'node_modules', '.dev', 'hooks')
}

// ============================================================================
// Claude Code Hook Installer
// ============================================================================

interface ClaudeHookConfig {
  matcher?: string
  hooks: Array<{ type: 'command'; command: string; timeout?: number }>
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookConfig[]>
  [key: string]: unknown
}

const CLAUDE_HOOK_EVENTS = [
  { name: 'UserPromptSubmit', config: 'withoutMatcher' },
  { name: 'PreToolUse', config: 'withMatcher' },
  { name: 'PostToolUse', config: 'withMatcher' },
  { name: 'PermissionRequest', config: 'withMatcherAndTimeout' },
  { name: 'Notification', config: 'withMatcher' },
  { name: 'Stop', config: 'withoutMatcher' },
  { name: 'SubagentStop', config: 'withoutMatcher' },
  { name: 'SessionStart', config: 'withoutMatcher' },
  { name: 'SessionEnd', config: 'withoutMatcher' },
  { name: 'PreCompact', config: 'preCompact' },
] as const

function installClaudeHooks(): boolean {
  const claudeDir = path.join(HOME, '.claude')
  const hooksDir = path.join(claudeDir, 'hooks')
  const settingsFile = path.join(claudeDir, 'settings.json')
  const scriptName = 'plexus-hook.js'

  // Check if Claude Code is installed
  if (!fs.existsSync(claudeDir)) {
    console.log('[Claude] Claude Code not found, skipping')
    return false
  }

  console.log('[Claude] Installing hooks...')

  // Ensure hooks directory exists
  ensureDirectory(hooksDir)

  // Copy hook script
  const sourcePath = path.join(getHooksSourceDir(), scriptName)
  const destPath = path.join(hooksDir, scriptName)

  if (!fileExists(sourcePath)) {
    console.warn(`[Claude] Source script not found: ${sourcePath}`)
    return false
  }

  if (!copyScriptWithPermissions(sourcePath, destPath)) {
    console.error('[Claude] Failed to install script')
    return false
  }

  console.log(`[Claude] Script installed: ${destPath}`)

  // Update settings.json
  const settings = readJsonFile<ClaudeSettings>(settingsFile, {})
  const hooks = settings.hooks || {}
  const nodePath = detectNodePath()
  const command = `${nodePath} ~/.claude/hooks/${scriptName}`

  for (const { name, config } of CLAUDE_HOOK_EVENTS) {
    const existingConfigs = hooks[name] as ClaudeHookConfig[] | undefined
    const hasOurHook = existingConfigs?.some(c =>
      c.hooks?.some(h => h.command?.includes(scriptName))
    )

    if (!hasOurHook) {
      const hookEntry = { type: 'command' as const, command }
      let newConfigs: ClaudeHookConfig[]

      switch (config) {
        case 'withMatcher':
          newConfigs = [{ matcher: '*', hooks: [hookEntry] }]
          break
        case 'withMatcherAndTimeout':
          newConfigs = [
            { matcher: '*', hooks: [{ ...hookEntry, timeout: 86400 }] },
          ]
          break
        case 'preCompact':
          newConfigs = [
            { matcher: 'auto', hooks: [hookEntry] },
            { matcher: 'manual', hooks: [hookEntry] },
          ]
          break
        default:
          newConfigs = [{ hooks: [hookEntry] }]
      }

      hooks[name] = existingConfigs
        ? [...existingConfigs, ...newConfigs]
        : newConfigs
    }
  }

  settings.hooks = hooks
  writeJsonFile(settingsFile, settings)
  console.log('[Claude] Hooks registered')
  return true
}

// ============================================================================
// Gemini CLI Hook Installer
// ============================================================================

interface GeminiHookConfig {
  matcher?: string
  hooks: Array<{
    name: string
    type: 'command'
    command: string
    description?: string
    timeout?: number
  }>
}

interface GeminiSettings {
  hooks?: Record<string, GeminiHookConfig[]>
  [key: string]: unknown
}

const GEMINI_HOOK_EVENTS = [
  { name: 'SessionStart', matcher: 'startup' },
  { name: 'SessionStart', matcher: 'resume' },
  { name: 'SessionStart', matcher: 'clear' },
  { name: 'SessionEnd', matcher: 'exit' },
  { name: 'SessionEnd', matcher: 'clear' },
  { name: 'SessionEnd', matcher: 'logout' },
  { name: 'SessionEnd', matcher: 'prompt_input_exit' },
  { name: 'SessionEnd', matcher: 'other' },
  { name: 'BeforeAgent', matcher: undefined },
  { name: 'AfterAgent', matcher: undefined },
  { name: 'AfterModel', matcher: undefined },
  { name: 'BeforeTool', matcher: '*' },
  { name: 'AfterTool', matcher: '*' },
  { name: 'PreCompress', matcher: 'manual' },
  { name: 'PreCompress', matcher: 'auto' },
  { name: 'Notification', matcher: 'ToolPermission', timeout: 86400000 },
] as const

function isGeminiInstalled(): boolean {
  try {
    execSync('which gemini', { encoding: 'utf-8' })
    return true
  } catch {
    return false
  }
}

function installGeminiHooks(): boolean {
  if (!isGeminiInstalled()) {
    console.log('[Gemini] Gemini CLI not found, skipping')
    return false
  }

  const geminiDir = path.join(HOME, '.gemini')
  const hooksDir = path.join(geminiDir, 'hooks')
  const settingsFile = path.join(geminiDir, 'settings.json')
  const scriptName = 'plexus-gemini-hook.js'

  console.log('[Gemini] Installing hooks...')

  // Ensure directories exist
  ensureDirectory(geminiDir)
  ensureDirectory(hooksDir)

  // Copy hook script
  const sourcePath = path.join(getHooksSourceDir(), scriptName)
  const destPath = path.join(hooksDir, scriptName)

  if (!fileExists(sourcePath)) {
    console.warn(`[Gemini] Source script not found: ${sourcePath}`)
    return false
  }

  if (!copyScriptWithPermissions(sourcePath, destPath)) {
    console.error('[Gemini] Failed to install script')
    return false
  }

  console.log(`[Gemini] Script installed: ${destPath}`)

  // Update settings.json
  const settings = readJsonFile<GeminiSettings>(settingsFile, {})
  const hooks = settings.hooks || {}
  const nodePath = detectNodePath()
  const command = `${nodePath} ${destPath}`

  for (const event of GEMINI_HOOK_EVENTS) {
    const { name, matcher } = event
    const timeout = 'timeout' in event ? event.timeout : undefined
    const existingConfigs = hooks[name] as GeminiHookConfig[] | undefined

    const hasOurHookForMatcher = existingConfigs?.some(
      c =>
        c.matcher === matcher &&
        c.hooks?.some(
          h => h.command?.includes(scriptName) || h.name === 'plexus-tracker'
        )
    )

    if (!hasOurHookForMatcher) {
      const hookEntry = {
        name: 'plexus-tracker',
        type: 'command' as const,
        command,
        description: 'Plexus agent tracking hook',
        ...(timeout && { timeout }),
      }

      const newConfig: GeminiHookConfig =
        matcher !== undefined
          ? { matcher, hooks: [hookEntry] }
          : { hooks: [hookEntry] }

      hooks[name] = existingConfigs
        ? [...existingConfigs, newConfig]
        : [newConfig]
    }
  }

  settings.hooks = hooks
  writeJsonFile(settingsFile, settings)
  console.log('[Gemini] Hooks registered')
  return true
}

// ============================================================================
// Cursor IDE Hook Installer
// ============================================================================

interface CursorHooksConfig {
  version: 1
  hooks: Record<string, Array<{ command: string }>>
}

const CURSOR_HOOK_EVENTS = [
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

function installCursorHooks(): boolean {
  const cursorDir = path.join(HOME, '.cursor')
  const hooksDir = path.join(cursorDir, 'hooks')
  const hooksConfigFile = path.join(cursorDir, 'hooks.json')
  const scriptName = 'plexus-cursor-hook.js'

  // Check if Cursor is installed
  if (!fs.existsSync(cursorDir)) {
    console.log('[Cursor] Cursor IDE not found, skipping')
    return false
  }

  console.log('[Cursor] Installing hooks...')

  // Ensure hooks directory exists
  ensureDirectory(hooksDir)

  // Copy hook script
  const sourcePath = path.join(getHooksSourceDir(), scriptName)
  const destPath = path.join(hooksDir, scriptName)

  if (!fileExists(sourcePath)) {
    console.warn(`[Cursor] Source script not found: ${sourcePath}`)
    return false
  }

  if (!copyScriptWithPermissions(sourcePath, destPath)) {
    console.error('[Cursor] Failed to install script')
    return false
  }

  console.log(`[Cursor] Script installed: ${destPath}`)

  // Update hooks.json
  const config = readJsonFile<CursorHooksConfig>(hooksConfigFile, {
    version: 1,
    hooks: {},
  })
  const nodePath = detectNodePath()
  const command = `${nodePath} ${destPath}`

  for (const eventName of CURSOR_HOOK_EVENTS) {
    if (!config.hooks[eventName]) {
      config.hooks[eventName] = []
    }

    const hasOurHook = config.hooks[eventName].some(
      h => h.command === command || h.command.includes(scriptName)
    )

    if (!hasOurHook) {
      config.hooks[eventName].push({ command })
    }
  }

  writeJsonFile(hooksConfigFile, config)
  console.log('[Cursor] Hooks registered')
  return true
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  console.log('╭─────────────────────────────────────╮')
  console.log('│  Plexus Hook Installation           │')
  console.log('╰─────────────────────────────────────╯')
  console.log('')

  const results = {
    claude: installClaudeHooks(),
    gemini: installGeminiHooks(),
    cursor: installCursorHooks(),
  }

  console.log('')
  console.log('Installation Summary:')
  console.log(`  Claude Code: ${results.claude ? '✓ Installed' : '○ Skipped'}`)
  console.log(`  Gemini CLI:  ${results.gemini ? '✓ Installed' : '○ Skipped'}`)
  console.log(`  Cursor IDE:  ${results.cursor ? '✓ Installed' : '○ Skipped'}`)

  if (!results.claude && !results.gemini && !results.cursor) {
    console.log('')
    console.log('No AI agents found. Hooks will be installed when you run Plexus.')
  }
}

main()
