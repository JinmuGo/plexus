/**
 * Notification Settings Store
 *
 * Manages notification preferences with persistence.
 * Follows the same pattern as theme.ts
 */

import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import {
  type NotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from 'shared/notification-types'

/**
 * Path to notification settings file
 */
function getSettingsPath(): string {
  return join(app.getPath('home'), '.plexus', 'notification-settings.json')
}

/**
 * Load notification settings from storage
 */
export function getSettings(): NotificationSettings {
  const path = getSettingsPath()
  if (!existsSync(path)) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }
  try {
    const content = readFileSync(path, 'utf-8')
    const data = JSON.parse(content) as Partial<NotificationSettings>
    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...data,
    }
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }
}

/**
 * Save notification settings to storage
 */
export function saveSettings(settings: Partial<NotificationSettings>): void {
  const current = getSettings()
  const updated = { ...current, ...settings }

  const path = getSettingsPath()
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(path, JSON.stringify(updated, null, 2), { mode: 0o600 })
}

/**
 * Reset settings to defaults
 */
export function resetSettings(): void {
  const path = getSettingsPath()
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(path, JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS, null, 2), {
    mode: 0o600,
  })
}

export const notificationSettingsStore = {
  getSettings,
  saveSettings,
  resetSettings,
}
