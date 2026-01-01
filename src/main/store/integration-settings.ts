/**
 * Integration Settings Store
 *
 * Simple settings storage for webhook URLs.
 * No OAuth, no token encryption - just webhook URLs in JSON.
 */

import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import {
  type IntegrationSettings,
  type SlackWebhookConfig,
  type DiscordWebhookConfig,
  DEFAULT_INTEGRATION_SETTINGS,
  DEFAULT_SLACK_CONFIG,
  DEFAULT_DISCORD_CONFIG,
} from 'shared/integration-types'

/**
 * Path to integration settings file
 */
function getSettingsPath(): string {
  return join(app.getPath('home'), '.plexus', 'integration-settings.json')
}

/**
 * Load integration settings from storage
 */
export function getSettings(): IntegrationSettings {
  const path = getSettingsPath()
  if (!existsSync(path)) {
    return { ...DEFAULT_INTEGRATION_SETTINGS }
  }
  try {
    const content = readFileSync(path, 'utf-8')
    const data = JSON.parse(content) as Partial<IntegrationSettings>

    // Deep merge with defaults
    return {
      slack: { ...DEFAULT_SLACK_CONFIG, ...data.slack },
      discord: { ...DEFAULT_DISCORD_CONFIG, ...data.discord },
    }
  } catch {
    return { ...DEFAULT_INTEGRATION_SETTINGS }
  }
}

/**
 * Save integration settings to storage
 */
export function saveSettings(settings: Partial<IntegrationSettings>): void {
  const current = getSettings()

  const updated: IntegrationSettings = {
    slack: { ...current.slack, ...settings.slack },
    discord: { ...current.discord, ...settings.discord },
  }

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
  writeFileSync(path, JSON.stringify(DEFAULT_INTEGRATION_SETTINGS, null, 2), {
    mode: 0o600,
  })
}

/**
 * Update Slack configuration
 */
export function updateSlackConfig(config: Partial<SlackWebhookConfig>): void {
  const settings = getSettings()
  saveSettings({
    slack: { ...settings.slack, ...config },
  })
}

/**
 * Update Discord configuration
 */
export function updateDiscordConfig(
  config: Partial<DiscordWebhookConfig>
): void {
  const settings = getSettings()
  saveSettings({
    discord: { ...settings.discord, ...config },
  })
}

/**
 * Check if Slack is configured
 */
export function isSlackConfigured(): boolean {
  const settings = getSettings()
  return settings.slack.enabled && !!settings.slack.webhookUrl
}

/**
 * Check if Discord is configured
 */
export function isDiscordConfigured(): boolean {
  const settings = getSettings()
  return settings.discord.enabled && !!settings.discord.webhookUrl
}

export const integrationSettingsStore = {
  getSettings,
  saveSettings,
  resetSettings,
  updateSlackConfig,
  updateDiscordConfig,
  isSlackConfigured,
  isDiscordConfigured,
}
