import { Notification, type BrowserWindow } from 'electron'
import type { ClaudeSession, PermissionContext } from 'shared/hook-types'
import { notificationSettingsStore } from '../store/notification-settings'
import { integrationSettingsStore } from '../store/integration-settings'
import { sessionStore } from '../store/sessions'
import {
  notifyPermissionRequest as webhookNotifyPermission,
  notifySessionEnded as webhookNotifySessionEnded,
} from '../webhooks'
import { jumpToAgent } from '../utils/jump-to-agent'

interface NotificationManagerOptions {
  mainWindow: BrowserWindow
}

interface NotificationManager {
  notifyPermissionRequest: (
    session: ClaudeSession,
    context: PermissionContext
  ) => void
  notifySessionEnded: (session: ClaudeSession) => void
}

export function createNotificationManager({
  mainWindow,
}: NotificationManagerOptions): NotificationManager {
  /**
   * Show OS notification based on settings
   * @param title - Notification title
   * @param body - Notification body
   * @param sessionId - Optional session ID to jump to agent on click
   */
  const showOsNotification = (
    title: string,
    body: string,
    sessionId?: string
  ): void => {
    const settings = notificationSettingsStore.getSettings()

    // Check if window is visible/focused (unless showWhenFocused is enabled)
    if (!settings.showWhenFocused) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        return
      }
    }

    if (!Notification.isSupported()) {
      return
    }

    const notification = new Notification({
      title,
      body,
      silent: !settings.sound,
    })

    notification.on('click', async () => {
      // If sessionId is provided, try to jump to the agent first
      if (sessionId) {
        const session = sessionStore.get(sessionId)
        if (session && session.phase !== 'ended') {
          const result = await jumpToAgent(session)
          if (result.success) {
            console.log(
              `[Notification] Jumped to agent via ${result.method} for session ${sessionId.slice(0, 8)}`
            )
            return
          }
          console.warn(`[Notification] Jump to agent failed: ${result.error}`)
        }
      }

      // Fallback: show Plexus main window
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    })

    notification.show()
  }

  // Helper to summarize tool input for notification body
  const summarizeToolInput = (input?: Record<string, unknown>): string => {
    if (!input) return ''

    // Bash, shell commands
    if (input.command) return String(input.command).slice(0, 60)

    // File operations (Read, Write, Edit)
    if (input.file_path) return String(input.file_path)

    // Search operations (Grep, WebSearch)
    if (input.query) return String(input.query).slice(0, 60)

    // Pattern matching (Glob, Grep)
    if (input.pattern) return String(input.pattern).slice(0, 60)

    // Web operations
    if (input.url) return String(input.url).slice(0, 60)

    // Task agent
    if (input.prompt) return String(input.prompt).slice(0, 60)

    // Skill invocation
    if (input.skill) return String(input.skill)

    // Notebook operations
    if (input.notebook_path) return String(input.notebook_path)

    return ''
  }

  // Notify permission request (OS notification + webhooks)
  const notifyPermissionRequest = (
    session: ClaudeSession,
    context: PermissionContext
  ): void => {
    const settings = notificationSettingsStore.getSettings()

    // Check if permission request notifications are enabled
    if (!settings.permissionRequest) {
      console.log(
        `[Notification] Permission request skipped (disabled): ${context.toolName} for session ${session.id.slice(0, 8)}`
      )
      return
    }

    const inputSummary = summarizeToolInput(context.toolInput)
    const body = inputSummary
      ? `${context.toolName}: ${inputSummary}`
      : context.toolName

    // Send native OS notification with sessionId for jump-to-agent on click
    showOsNotification('Permission Required', body, session.id)
    console.log(
      `[Notification] Permission request: ${context.toolName} for session ${session.id.slice(0, 8)}`
    )

    // Send to webhooks (Slack, Discord)
    const integrationSettings = integrationSettingsStore.getSettings()
    webhookNotifyPermission(integrationSettings, session, context).catch(
      error => {
        console.error('[Notification] Failed to send to webhooks:', error)
      }
    )
  }

  // Notify session ended (OS notification + webhooks)
  const notifySessionEnded = (session: ClaudeSession): void => {
    const settings = notificationSettingsStore.getSettings()

    // Check if session ended notifications are enabled
    if (!settings.sessionEnded) {
      console.log(
        `[Notification] Session ended skipped (disabled): ${session.id.slice(0, 8)}`
      )
      return
    }

    const displayName = session.displayTitle || `${session.agent} session`
    showOsNotification('Session Ended', displayName)

    // Send to webhooks (Slack, Discord)
    const integrationSettings = integrationSettingsStore.getSettings()
    webhookNotifySessionEnded(integrationSettings, session).catch(error => {
      console.error('[Notification] Failed to send to webhooks:', error)
    })
  }

  return {
    notifyPermissionRequest,
    notifySessionEnded,
  }
}

export type { NotificationManager }
