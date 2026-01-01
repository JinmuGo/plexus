/**
 * Gemini Hook Constants
 */
import { join } from 'node:path'

/** Gemini hook script filename */
export const HOOK_SCRIPT_NAME = 'plexus-gemini-hook.js'

/** Get Gemini configuration directory */
export function getGeminiDir(): string {
  return join(process.env.HOME || '', '.gemini')
}

/** Get Gemini hooks directory */
export function getHooksDir(): string {
  return join(getGeminiDir(), 'hooks')
}

/** Get Gemini settings file path */
export function getSettingsFile(): string {
  return join(getGeminiDir(), 'settings.json')
}
