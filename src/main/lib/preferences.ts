/**
 * Preferences Store
 *
 * Simple key-value storage using electron-store.
 * Stores user preferences like window position, sidebar state, etc.
 */

import Store from 'electron-store'
import type { Rectangle } from 'electron'
import { logger } from './logger'

// Preference types
interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

interface Preferences {
  // Window state
  windowBounds: WindowBounds | null
  isMaximized: boolean

  // UI state
  sidebarCollapsed: boolean
  lastViewMode: 'sessions' | 'history' | 'analytics' | 'settings'

  // Behavior
  launchAtStartup: boolean
  showInDock: boolean
  showNotifications: boolean

  // History
  lastOpenedSessionId: string | null
}

// Default values
const defaults: Preferences = {
  windowBounds: null,
  isMaximized: false,
  sidebarCollapsed: false,
  lastViewMode: 'sessions',
  launchAtStartup: false,
  showInDock: true,
  showNotifications: true,
  lastOpenedSessionId: null,
}

// Create store instance
const store = new Store<Preferences>({
  name: 'preferences',
  defaults,
  // Store in ~/.plexus/config/
  cwd: process.env.HOME ? `${process.env.HOME}/.plexus/config` : undefined,
})

/**
 * Get a preference value
 */
export function getPreference<K extends keyof Preferences>(
  key: K
): Preferences[K] {
  return store.get(key)
}

/**
 * Set a preference value
 */
export function setPreference<K extends keyof Preferences>(
  key: K,
  value: Preferences[K]
): void {
  store.set(key, value)
  logger.store.debug(`Preference set: ${key}`)
}

/**
 * Get all preferences
 */
export function getAllPreferences(): Preferences {
  return store.store
}

/**
 * Reset a preference to default
 */
export function resetPreference<K extends keyof Preferences>(key: K): void {
  store.set(key, defaults[key])
  logger.store.debug(`Preference reset: ${key}`)
}

/**
 * Reset all preferences to defaults
 */
export function resetAllPreferences(): void {
  store.clear()
  Object.entries(defaults).forEach(([key, value]) => {
    store.set(key as keyof Preferences, value)
  })
  logger.store.info('All preferences reset to defaults')
}

// Window bounds helpers
export function saveWindowBounds(bounds: Rectangle): void {
  setPreference('windowBounds', bounds)
}

export function getWindowBounds(): WindowBounds | null {
  return getPreference('windowBounds')
}

export function saveMaximizedState(isMaximized: boolean): void {
  setPreference('isMaximized', isMaximized)
}

export function getMaximizedState(): boolean {
  return getPreference('isMaximized')
}

// Export store for advanced usage
export { store as preferencesStore }
export type { Preferences, WindowBounds }
