import { useEffect, useCallback } from 'react'

type Modifier = 'ctrl' | 'meta' | 'alt' | 'shift'

export interface ShortcutConfig {
  /** Key to match (case-insensitive for letters) */
  key: string
  /** Modifier keys required */
  modifiers?: Modifier[]
  /** Action to execute */
  action: () => void
  /** Description for help/accessibility */
  description: string
  /** Whether to prevent default browser behavior */
  preventDefault?: boolean
}

function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutConfig
): boolean {
  const { key, modifiers = [] } = shortcut

  // Check key match (case-insensitive for letters)
  const eventKey = event.key.toLowerCase()
  const targetKey = key.toLowerCase()

  // Handle special keys
  const keyMatches =
    eventKey === targetKey ||
    (key === 'ArrowDown' && event.key === 'ArrowDown') ||
    (key === 'ArrowUp' && event.key === 'ArrowUp') ||
    (key === 'Enter' && event.key === 'Enter') ||
    (key === 'Escape' && event.key === 'Escape')

  if (!keyMatches) return false

  // Check modifiers
  const requiresCtrl = modifiers.includes('ctrl')
  const requiresMeta = modifiers.includes('meta')
  const requiresAlt = modifiers.includes('alt')
  const requiresShift = modifiers.includes('shift')

  // For shortcuts without modifiers, ensure no modifiers are pressed
  if (modifiers.length === 0) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false
  } else {
    if (requiresCtrl !== event.ctrlKey) return false
    if (requiresMeta !== event.metaKey) return false
    if (requiresAlt !== event.altKey) return false
    if (requiresShift !== event.shiftKey) return false
  }

  return true
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false
  if (target instanceof HTMLInputElement) return true
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if user is typing in an input field
      if (isInputElement(event.target)) return

      for (const shortcut of shortcuts) {
        if (matchesShortcut(event, shortcut)) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault()
          }
          shortcut.action()
          break
        }
      }
    },
    [shortcuts]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

/** Detect if running on macOS */
export const isMac =
  typeof navigator !== 'undefined' &&
  navigator.platform.toUpperCase().includes('MAC')

/** Get the appropriate modifier for the platform (Cmd on Mac, Ctrl on others) */
export const platformModifier: Modifier = isMac ? 'meta' : 'ctrl'
