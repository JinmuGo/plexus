/**
 * Notification Settings Types
 *
 * Types for configuring OS notification behavior.
 */

/**
 * Notification settings that users can configure
 */
export interface NotificationSettings {
  /**
   * Show notification when permission is required
   * @default true
   */
  permissionRequest: boolean

  /**
   * Show notification when session ends
   * @default true
   */
  sessionEnded: boolean

  /**
   * Show notifications even when window is focused
   * @default false
   */
  showWhenFocused: boolean

  /**
   * Play sound with notifications
   * @default true
   */
  sound: boolean
}

/**
 * Default notification settings
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  permissionRequest: true,
  sessionEnded: true,
  showWhenFocused: false,
  sound: true,
}
