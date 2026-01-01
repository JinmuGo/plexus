/**
 * Slack Incoming Webhook
 *
 * Simple one-way notification via Slack webhook.
 * No OAuth, no API tokens - just POST to webhook URL.
 */

import type { ClaudeSession, PermissionContext } from 'shared/hook-types'

/**
 * Slack Block Kit block type
 */
interface SlackBlock {
  type: string
  text?: {
    type: 'plain_text' | 'mrkdwn'
    text: string
    emoji?: boolean
  }
  fields?: Array<{
    type: 'plain_text' | 'mrkdwn'
    text: string
  }>
  elements?: Array<{
    type: 'mrkdwn' | 'plain_text'
    text: string
  }>
}

/**
 * Get agent emoji
 */
function getAgentEmoji(agent: string): string {
  switch (agent) {
    case 'claude':
      return ':robot_face:'
    case 'cursor':
      return ':computer:'
    case 'gemini':
      return ':sparkles:'
    default:
      return ':gear:'
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
  if (str.length > 200) {
    return `\`\`\`${str.slice(0, 200)}...\`\`\``
  }
  return `\`\`\`${str}\`\`\``
}

/**
 * Build permission request message
 */
function buildPermissionRequestPayload(
  session: ClaudeSession,
  context: PermissionContext
): { text: string; blocks: SlackBlock[] } {
  const agentEmoji = getAgentEmoji(session.agent)
  const agentName = getAgentName(session.agent)
  const projectPath = formatProjectPath(session.cwd)
  const displayTitle = session.displayTitle || projectPath

  const text = `[Permission Request] ${agentName} in ${displayTitle} wants to use ${context.toolName}`

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🔐 Permission Request',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${agentEmoji} *${agentName}* is requesting permission`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Project:*\n${displayTitle}`,
        },
        {
          type: 'mrkdwn',
          text: `*Tool:*\n\`${context.toolName}\``,
        },
      ],
    },
  ]

  if (context.toolInput && Object.keys(context.toolInput).length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Input:*\n${formatToolInput(context.toolInput)}`,
      },
    })
  }

  blocks.push({ type: 'divider' } as SlackBlock, {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: ':bulb: Open Plexus to approve or deny this request',
      },
    ],
  })

  return { text, blocks }
}

/**
 * Build session ended message
 */
function buildSessionEndedPayload(session: ClaudeSession): {
  text: string
  blocks: SlackBlock[]
} {
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

  const text = `[Session Ended] ${agentName} session in ${displayTitle} has ended`

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${agentEmoji} *${agentName}* session ended`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Project:*\n${displayTitle}`,
        },
        {
          type: 'mrkdwn',
          text: `*Duration:*\n${durationText}`,
        },
      ],
    },
  ]

  return { text, blocks }
}

/**
 * Send notification to Slack webhook
 */
export async function sendSlackNotification(
  webhookUrl: string,
  payload: { text: string; blocks?: SlackBlock[] }
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
    throw new Error(`Slack webhook failed: ${response.status} - ${errorText}`)
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
  await sendSlackNotification(webhookUrl, payload)
}

/**
 * Send session ended notification
 */
export async function sendSessionEnded(
  webhookUrl: string,
  session: ClaudeSession
): Promise<void> {
  const payload = buildSessionEndedPayload(session)
  await sendSlackNotification(webhookUrl, payload)
}

/**
 * Test webhook connection
 */
export async function testWebhook(webhookUrl: string): Promise<boolean> {
  try {
    await sendSlackNotification(webhookUrl, {
      text: '✅ Plexus webhook test successful!',
    })
    return true
  } catch {
    return false
  }
}

export const slackWebhook = {
  sendPermissionRequest,
  sendSessionEnded,
  testWebhook,
}
