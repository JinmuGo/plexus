/**
 * Discord Webhook
 *
 * Simple one-way notification via Discord webhook.
 * No OAuth, no bot token - just POST to webhook URL.
 */

import type { ClaudeSession, PermissionContext } from 'shared/hook-types'
import { DISCORD_COLORS } from '../constants/webhooks'

/**
 * Discord embed type
 */
interface DiscordEmbed {
  title?: string
  description?: string
  color?: number
  fields?: Array<{
    name: string
    value: string
    inline?: boolean
  }>
  footer?: {
    text: string
  }
  timestamp?: string
}

/**
 * Discord webhook payload
 */
interface DiscordPayload {
  content?: string
  embeds?: DiscordEmbed[]
  username?: string
  avatar_url?: string
}

/**
 * Get agent emoji
 */
function getAgentEmoji(agent: string): string {
  switch (agent) {
    case 'claude':
      return '🤖'
    case 'cursor':
      return '💻'
    case 'gemini':
      return '✨'
    default:
      return '⚙️'
  }
}

/**
 * Get agent display name
 */
function getAgentName(agent: string): string {
  switch (agent) {
    case 'claude':
      return 'Claude Code'
    case 'cursor':
      return 'Cursor'
    case 'gemini':
      return 'Gemini CLI'
    default:
      return agent
  }
}

/**
 * Format project path for display
 */
function formatProjectPath(cwd: string): string {
  const parts = cwd.split('/')
  if (parts.length <= 3) {
    return cwd
  }
  return `.../${parts.slice(-2).join('/')}`
}

/**
 * Truncate tool input for display
 */
function formatToolInput(input: Record<string, unknown> | undefined): string {
  if (!input) {
    return '_No input_'
  }
  const str = JSON.stringify(input, null, 2)
  if (str.length > 300) {
    return `\`\`\`json\n${str.slice(0, 300)}...\n\`\`\``
  }
  return `\`\`\`json\n${str}\n\`\`\``
}

/**
 * Build permission request embed
 */
function buildPermissionRequestPayload(
  session: ClaudeSession,
  context: PermissionContext
): DiscordPayload {
  const agentName = getAgentName(session.agent)
  const projectPath = formatProjectPath(session.cwd)
  const displayTitle = session.displayTitle || projectPath

  const fields = [
    {
      name: 'Project',
      value: displayTitle,
      inline: true,
    },
    {
      name: 'Tool',
      value: `\`${context.toolName}\``,
      inline: true,
    },
  ]

  if (context.toolInput && Object.keys(context.toolInput).length > 0) {
    fields.push({
      name: 'Input',
      value: formatToolInput(context.toolInput),
      inline: false,
    })
  }

  return {
    username: 'Plexus',
    embeds: [
      {
        title: '🔐 Permission Request',
        description: `**${agentName}** is requesting permission`,
        color: DISCORD_COLORS.ORANGE,
        fields,
        footer: {
          text: 'Open Plexus to approve or deny this request',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

/**
 * Build session ended embed
 */
function buildSessionEndedPayload(session: ClaudeSession): DiscordPayload {
  const agentEmoji = getAgentEmoji(session.agent)
  const agentName = getAgentName(session.agent)
  const projectPath = formatProjectPath(session.cwd)
  const displayTitle = session.displayTitle || projectPath

  const duration = Date.now() - session.startedAt
  const minutes = Math.floor(duration / 60000)
  const durationText =
    minutes > 0
      ? `${minutes} minute${minutes === 1 ? '' : 's'}`
      : 'Less than a minute'

  return {
    username: 'Plexus',
    embeds: [
      {
        title: `${agentEmoji} Session Ended`,
        description: `**${agentName}** session has ended`,
        color: DISCORD_COLORS.GRAY,
        fields: [
          {
            name: 'Project',
            value: displayTitle,
            inline: true,
          },
          {
            name: 'Duration',
            value: durationText,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

/**
 * Send notification to Discord webhook
 */
export async function sendDiscordNotification(
  webhookUrl: string,
  payload: DiscordPayload
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Discord webhook failed: ${response.status} - ${errorText}`)
  }
}

/**
 * Send permission request notification
 */
export async function sendPermissionRequest(
  webhookUrl: string,
  session: ClaudeSession,
  context: PermissionContext
): Promise<void> {
  const payload = buildPermissionRequestPayload(session, context)
  await sendDiscordNotification(webhookUrl, payload)
}

/**
 * Send session ended notification
 */
export async function sendSessionEnded(
  webhookUrl: string,
  session: ClaudeSession
): Promise<void> {
  const payload = buildSessionEndedPayload(session)
  await sendDiscordNotification(webhookUrl, payload)
}

/**
 * Test webhook connection
 */
export async function testWebhook(webhookUrl: string): Promise<boolean> {
  try {
    await sendDiscordNotification(webhookUrl, {
      username: 'Plexus',
      embeds: [
        {
          title: '✅ Webhook Test',
          description: 'Plexus webhook connection successful!',
          color: DISCORD_COLORS.GREEN,
          timestamp: new Date().toISOString(),
        },
      ],
    })
    return true
  } catch {
    return false
  }
}

export const discordWebhook = {
  sendPermissionRequest,
  sendSessionEnded,
  testWebhook,
}
