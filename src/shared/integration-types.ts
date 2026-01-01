/**
 * Integration Types for Slack/Discord Webhooks
 *
 * Simple webhook-based notification channels.
 * No OAuth, no API tokens - just webhook URLs.
 */

/**
 * Supported notification channel types
 */
export type NotificationChannelType = 'native' | 'slack' | 'discord'

/**
 * Webhook configuration for Slack
 */
export interface SlackWebhookConfig {
  /**
   * Whether Slack notifications are enabled
   */
  enabled: boolean

  /**
   * Incoming Webhook URL
   * Format: https://hooks.slack.com/services/T00/B00/xxx
   */
  webhookUrl?: string

  /**
   * Optional label for this webhook (e.g., "#dev-alerts")
   */
  label?: string

  /**
   * Last error message if notification failed
   */
  lastError?: string

  /**
   * Timestamp of last successful notification
   */
  lastSuccessAt?: number
}

/**
 * Webhook configuration for Discord
 */
export interface DiscordWebhookConfig {
  /**
   * Whether Discord notifications are enabled
   */
  enabled: boolean

  /**
   * Discord Webhook URL
   * Format: https://discord.com/api/webhooks/xxx/yyy
   */
  webhookUrl?: string

  /**
   * Optional label for this webhook (e.g., "#alerts")
   */
  label?: string

  /**
   * Last error message if notification failed
   */
  lastError?: string

  /**
   * Timestamp of last successful notification
   */
  lastSuccessAt?: number
}

/**
 * Complete integration settings
 */
export interface IntegrationSettings {
  /**
   * Slack webhook configuration
   */
  slack: SlackWebhookConfig

  /**
   * Discord webhook configuration
   */
  discord: DiscordWebhookConfig
}

/**
 * Default Slack configuration
 */
export const DEFAULT_SLACK_CONFIG: SlackWebhookConfig = {
  enabled: false,
}

/**
 * Default Discord configuration
 */
export const DEFAULT_DISCORD_CONFIG: DiscordWebhookConfig = {
  enabled: false,
}

/**
 * Default integration settings
 */
export const DEFAULT_INTEGRATION_SETTINGS: IntegrationSettings = {
  slack: DEFAULT_SLACK_CONFIG,
  discord: DEFAULT_DISCORD_CONFIG,
}

/**
 * Validate Slack webhook URL format
 */
export function isValidSlackWebhookUrl(url: string): boolean {
  return url.startsWith('https://hooks.slack.com/services/')
}

/**
 * Validate Discord webhook URL format
 */
export function isValidDiscordWebhookUrl(url: string): boolean {
  return url.startsWith('https://discord.com/api/webhooks/')
}
