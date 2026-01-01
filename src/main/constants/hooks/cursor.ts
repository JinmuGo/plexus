/**
 * Cursor Hook Constants
 */
import { join } from 'node:path'

/** Cursor hook script filename */
export const HOOK_SCRIPT_NAME = 'plexus-cursor-hook.js'

/** Get Cursor configuration directory */
export function getCursorDir(): string {
  return join(process.env.HOME || '', '.cursor')
}

/** Get Cursor hooks directory */
export function getHooksDir(): string {
  return join(getCursorDir(), 'hooks')
}

/** Get Cursor hooks configuration file */
export function getHooksConfigFile(): string {
  return join(getCursorDir(), 'hooks.json')
}
