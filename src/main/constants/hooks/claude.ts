/**
 * Claude Hook Constants
 */
import { join } from 'node:path'

/** Claude hook script filename */
export const HOOK_SCRIPT_NAME = 'plexus-hook.js'

/** Get Claude configuration directory */
export function getClaudeDir(): string {
  return join(process.env.HOME || '', '.claude')
}

/** Get Claude hooks directory */
export function getHooksDir(): string {
  return join(getClaudeDir(), 'hooks')
}

/** Get Claude settings file path */
export function getSettingsFile(): string {
  return join(getClaudeDir(), 'settings.json')
}
