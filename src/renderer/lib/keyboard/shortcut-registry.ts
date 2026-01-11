/**
 * Shortcut Registry
 *
 * Central registry for managing keyboard shortcuts.
 * Handles registration, scope management, and conflict resolution.
 */

import type {
  ShortcutDefinition,
  ShortcutRegistry,
  ShortcutScope,
  ShortcutCategory,
} from './types'
import { devLog } from '../logger'

export function createShortcutRegistry(): ShortcutRegistry {
  const shortcuts = new Map<string, ShortcutDefinition>()
  let activeScope: ShortcutScope = 'sessions'

  const register = (shortcut: ShortcutDefinition): (() => void) => {
    if (shortcuts.has(shortcut.id)) {
      devLog.warn(
        `[ShortcutRegistry] Shortcut with id "${shortcut.id}" already registered. Overwriting.`
      )
    }
    shortcuts.set(shortcut.id, shortcut)
    return () => unregister(shortcut.id)
  }

  const unregister = (id: string): void => {
    shortcuts.delete(id)
  }

  const getByScope = (scope: ShortcutScope): ShortcutDefinition[] => {
    return Array.from(shortcuts.values()).filter(
      s => s.scope === scope || s.scope === 'global'
    )
  }

  const getByCategory = (category: ShortcutCategory): ShortcutDefinition[] => {
    return Array.from(shortcuts.values()).filter(s => s.category === category)
  }

  const getAll = (): ShortcutDefinition[] => {
    return Array.from(shortcuts.values())
  }

  const setActiveScope = (scope: ShortcutScope): void => {
    activeScope = scope
  }

  const getActiveScope = (): ShortcutScope => {
    return activeScope
  }

  const isEnabled = (id: string): boolean => {
    const shortcut = shortcuts.get(id)
    if (!shortcut) return false

    // Check scope
    if (shortcut.scope !== 'global' && shortcut.scope !== activeScope) {
      return false
    }

    // Check condition
    if (shortcut.when && !shortcut.when()) {
      return false
    }

    return true
  }

  return {
    register,
    unregister,
    getByScope,
    getByCategory,
    getAll,
    setActiveScope,
    getActiveScope,
    isEnabled,
  }
}

/**
 * Match a keyboard event against a shortcut definition
 */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutDefinition,
  keyBuffer: string[]
): boolean {
  const { key, modifiers = [] } = shortcut

  // Handle key sequences (e.g., 'gg')
  if (
    key.length > 1 &&
    !key.startsWith('Arrow') &&
    key !== 'Enter' &&
    key !== 'Escape' &&
    key !== 'Tab'
  ) {
    // Check if buffer ends with the sequence
    const sequence = key.toLowerCase()
    const bufferStr = keyBuffer.join('').toLowerCase()
    return bufferStr.endsWith(sequence)
  }

  // Special characters that require shift (like ?, !, @, etc.)
  // For these, we match event.key directly since it already includes the shift transformation
  const shiftSymbols = [
    '?',
    '!',
    '@',
    '#',
    '$',
    '%',
    '^',
    '&',
    '*',
    '(',
    ')',
    '_',
    '+',
    '{',
    '}',
    '|',
    ':',
    '"',
    '<',
    '>',
    '~',
  ]
  const isShiftSymbol = shiftSymbols.includes(key)

  // Check key match
  // For shift symbols, match event.key directly (e.g., '?' when user presses Shift+/)
  // For letters, do case-insensitive matching
  const eventKey = event.key
  const keyMatches =
    eventKey === key ||
    eventKey.toLowerCase() === key.toLowerCase() ||
    (key === 'ArrowDown' && event.key === 'ArrowDown') ||
    (key === 'ArrowUp' && event.key === 'ArrowUp') ||
    (key === 'ArrowLeft' && event.key === 'ArrowLeft') ||
    (key === 'ArrowRight' && event.key === 'ArrowRight') ||
    (key === 'Enter' && event.key === 'Enter') ||
    (key === 'Escape' && event.key === 'Escape') ||
    (key === ' ' && event.key === ' ') ||
    (key === 'Tab' && event.key === 'Tab')

  if (!keyMatches) return false

  // Check modifiers
  const requiresCtrl = modifiers.includes('ctrl')
  const requiresMeta = modifiers.includes('meta')
  const requiresAlt = modifiers.includes('alt')
  const requiresShift = modifiers.includes('shift')

  // For shortcuts without modifiers, ensure no modifiers are pressed
  // Exception 1: shift for uppercase letters like 'G'
  // Exception 2: shift for symbols like '?' (Shift+/)
  if (modifiers.length === 0) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false

    if (event.shiftKey) {
      // Allow shift for uppercase letters (G, N, etc.)
      const isUppercaseLetter =
        key.length === 1 &&
        key === key.toUpperCase() &&
        key !== key.toLowerCase()
      // Allow shift for symbols that require it (?, !, etc.)
      if (!isUppercaseLetter && !isShiftSymbol) {
        return false
      }
    }
  } else {
    if (requiresCtrl !== event.ctrlKey) return false
    if (requiresMeta !== event.metaKey) return false
    if (requiresAlt !== event.altKey) return false
    if (requiresShift !== event.shiftKey) return false
  }

  return true
}

/**
 * Check if the event target is an input element
 */
export function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false
  if (target instanceof HTMLInputElement) return true
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLElement) {
    // Check both isContentEditable and contentEditable attribute
    // (jsdom doesn't fully support isContentEditable, so we check the attribute as fallback)
    if (target.isContentEditable || target.contentEditable === 'true')
      return true
  }
  return false
}

/**
 * Sort shortcuts by priority (higher first)
 */
export function sortByPriority(
  shortcuts: ShortcutDefinition[]
): ShortcutDefinition[] {
  return [...shortcuts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}
