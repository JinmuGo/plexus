/**
 * Keyboard Shortcut System Types
 *
 * Central type definitions for the keyboard shortcut system.
 * Supports scoped shortcuts, key sequences (gg, G), and platform-aware modifiers.
 */

export type Modifier = 'ctrl' | 'meta' | 'alt' | 'shift'

export type ShortcutScope =
  | 'global' // Always active
  | 'sessions' // Sessions View
  | 'history' // History View
  | 'analytics' // Analytics View
  | 'settings' // Settings View
  | 'replay' // Replay Player
  | 'popover' // Popover Window

export type ShortcutCategory =
  | 'navigation' // View switching (1, 2, 3, 4)
  | 'list' // List navigation (j, k, gg, G)
  | 'permission' // Allow/Deny (y, n, a)
  | 'actions' // General actions (Enter, Escape, /)
  | 'playback' // Replay controls (Space, arrows)
  | 'system' // System shortcuts (?, Cmd+,)

export interface ShortcutDefinition {
  /** Unique identifier (e.g., 'sessions.approve', 'global.cheatsheet') */
  id: string
  /** Key to match (case-insensitive for letters, supports 'gg' for sequences) */
  key: string
  /** Modifier keys required */
  modifiers?: Modifier[]
  /** Action to execute */
  action: () => void
  /** Description for Cheatsheet and accessibility */
  description: string
  /** Category for grouping in Cheatsheet */
  category: ShortcutCategory
  /** Scope where this shortcut is active */
  scope: ShortcutScope
  /** Condition function - shortcut only active when returns true */
  when?: () => boolean
  /** Priority for conflict resolution (higher = more priority, default: 0) */
  priority?: number
  /** Whether to prevent default browser behavior (default: true) */
  preventDefault?: boolean
  /** Override key display in cheatsheet (e.g., 'gg' for key sequence) */
  displayKey?: string
}

export interface ShortcutRegistration
  extends Omit<ShortcutDefinition, 'scope'> {}

export interface ShortcutRegistry {
  /** Register a shortcut, returns unregister function */
  register(shortcut: ShortcutDefinition): () => void
  /** Unregister a shortcut by ID */
  unregister(id: string): void
  /** Get all shortcuts for a specific scope */
  getByScope(scope: ShortcutScope): ShortcutDefinition[]
  /** Get all shortcuts for a specific category */
  getByCategory(category: ShortcutCategory): ShortcutDefinition[]
  /** Get all registered shortcuts */
  getAll(): ShortcutDefinition[]
  /** Set the currently active scope */
  setActiveScope(scope: ShortcutScope): void
  /** Get the currently active scope */
  getActiveScope(): ShortcutScope
  /** Check if a shortcut is currently enabled */
  isEnabled(id: string): boolean
}

export interface ShortcutContextValue {
  /** The shortcut registry instance */
  registry: ShortcutRegistry
  /** Currently active scope */
  activeScope: ShortcutScope
  /** Set the active scope */
  setActiveScope: (scope: ShortcutScope) => void
  /** Whether the cheatsheet is visible */
  showCheatsheet: boolean
  /** Toggle cheatsheet visibility */
  toggleCheatsheet: () => void
  /** Open cheatsheet */
  openCheatsheet: () => void
  /** Close cheatsheet */
  closeCheatsheet: () => void
}

/** Key sequence state for handling multi-key shortcuts like 'gg' */
export interface KeySequenceState {
  /** Buffer of recently pressed keys */
  buffer: string[]
  /** Timeout ID for clearing buffer */
  timeoutId: ReturnType<typeof setTimeout> | null
  /** Timestamp of last key press */
  lastKeyTime: number
}

/** Platform detection helpers */
export const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().includes('MAC')

/** Get the platform-specific modifier (Cmd on Mac, Ctrl on others) */
export const platformModifier: Modifier = isMac ? 'meta' : 'ctrl'

/** Format a shortcut for display (e.g., 'Cmd+B' on Mac, 'Ctrl+B' on Windows) */
export function formatShortcut(key: string, modifiers?: Modifier[]): string {
  const parts: string[] = []

  if (modifiers) {
    for (const mod of modifiers) {
      if (mod === 'meta') {
        parts.push(isMac ? '\u2318' : 'Ctrl')
      } else if (mod === 'ctrl') {
        parts.push(isMac ? '\u2303' : 'Ctrl')
      } else if (mod === 'alt') {
        parts.push(isMac ? '\u2325' : 'Alt')
      } else if (mod === 'shift') {
        parts.push(isMac ? '\u21E7' : 'Shift')
      }
    }
  }

  // Format special keys
  let displayKey = key
  if (key === 'ArrowUp') displayKey = '\u2191'
  else if (key === 'ArrowDown') displayKey = '\u2193'
  else if (key === 'ArrowLeft') displayKey = '\u2190'
  else if (key === 'ArrowRight') displayKey = '\u2192'
  else if (key === 'Enter') displayKey = '\u21B5'
  else if (key === 'Escape') displayKey = 'Esc'
  else if (key === ' ') displayKey = 'Space'
  else if (key.length === 1) displayKey = key.toUpperCase()

  parts.push(displayKey)

  return parts.join(isMac ? '' : '+')
}
