/**
 * Webhook Notifications
 *
 * Simple webhook-based notifications for Slack and Discord.
 */

import type { ClaudeSession, PermissionContext } from 'shared/hook-types'
import type { IntegrationSettings } from 'shared/integration-types'
import { slackWebhook } from './slack-webhook'
import { discordWebhook } from './discord-webhook'

export { slackWebhook } from './slack-webhook'
export { discordWebhook } from './discord-webhook'

/**
 * Send permission request to all enabled webhooks
 */
export async function notifyPermissionRequest(
  settings: IntegrationSettings,
  session: ClaudeSession,
  context: PermissionContext
): Promise<void> {
  const promises: Promise<void>[] = []

  // Slack
  if (settings.slack.enabled && settings.slack.webhookUrl) {
    promises.push(
      slackWebhook
        .sendPermissionRequest(settings.slack.webhookUrl, session, context)
        .catch(err => {
          console.error('[Webhook] Slack notification failed:', err.message)
        })
    )
  }

  // Discord
  if (settings.discord.enabled && settings.discord.webhookUrl) {
    promises.push(
      discordWebhook
        .sendPermissionRequest(settings.discord.webhookUrl, session, context)
        .catch(err => {
          console.error('[Webhook] Discord notification failed:', err.message)
        })
    )
  }

  await Promise.all(promises)
}

/**
 * Send session ended to all enabled webhooks
 */
export async function notifySessionEnded(
  settings: IntegrationSettings,
  session: ClaudeSession
): Promise<void> {
  const promises: Promise<void>[] = []

  // Slack
  if (settings.slack.enabled && settings.slack.webhookUrl) {
    promises.push(
      slackWebhook
        .sendSessionEnded(settings.slack.webhookUrl, session)
        .catch(err => {
          console.error('[Webhook] Slack notification failed:', err.message)
        })
    )
  }

  // Discord
  if (settings.discord.enabled && settings.discord.webhookUrl) {
    promises.push(
      discordWebhook
        .sendSessionEnded(settings.discord.webhookUrl, session)
        .catch(err => {
          console.error('[Webhook] Discord notification failed:', err.message)
        })
    )
  }

  await Promise.all(promises)
}
