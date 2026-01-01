/**
 * Theme Store
 *
 * Manages theme preferences with persistence and system theme detection.
 * Uses Electron's nativeTheme for OS dark mode detection.
 */

import { app, nativeTheme, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Theme, ResolvedTheme } from 'shared/theme-types'

const DEFAULT_THEME: Theme = 'system'

/**
 * Path to theme settings file
 */
function getThemePath(): string {
  return join(app.getPath('home'), '.plexus', 'theme.json')
}

/**
 * Load theme from storage
 */
export function getTheme(): Theme {
  const path = getThemePath()
  if (!existsSync(path)) {
    return DEFAULT_THEME
  }
  try {
    const content = readFileSync(path, 'utf-8')
    const data = JSON.parse(content) as { theme?: Theme }
    if (
      data.theme === 'light' ||
      data.theme === 'dark' ||
      data.theme === 'system'
    ) {
      return data.theme
    }
    return DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * Save theme to storage and return resolved theme
 */
export function setTheme(theme: Theme): ResolvedTheme {
  const path = getThemePath()
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(path, JSON.stringify({ theme }, null, 2), { mode: 0o600 })

  // Return the resolved theme immediately
  if (theme === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
  return theme
}

/**
 * Get the resolved theme (system -> actual light/dark)
 */
export function getResolvedTheme(): ResolvedTheme {
  const theme = getTheme()
  if (theme === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
  return theme
}

/**
 * Subscribe to system theme changes
 * Returns unsubscribe function
 */
export function subscribeToSystemTheme(
  callback: (resolved: ResolvedTheme) => void
): () => void {
  const handler = () => {
    const theme = getTheme()
    if (theme === 'system') {
      callback(nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    }
  }

  nativeTheme.on('updated', handler)

  return () => {
    nativeTheme.off('updated', handler)
  }
}

/**
 * Notify renderer of theme change
 */
export function notifyThemeChange(mainWindow: BrowserWindow | null): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme:systemChanged', getResolvedTheme())
  }
}

export const themeStore = {
  getTheme,
  setTheme,
  getResolvedTheme,
  subscribeToSystemTheme,
  notifyThemeChange,
}
