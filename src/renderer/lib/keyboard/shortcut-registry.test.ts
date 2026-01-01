/**
 * Shortcut Registry Tests
 *
 * @vitest-environment jsdom
 *
 * Tests for keyboard shortcut registration, matching, and utility functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createShortcutRegistry,
  matchesShortcut,
  isInputElement,
  sortByPriority,
} from './shortcut-registry'
import type { ShortcutDefinition } from './types'

// ============================================================================
// Test Fixtures
// ============================================================================

const createShortcut = (
  overrides: Partial<ShortcutDefinition> = {}
): ShortcutDefinition => ({
  id: `test-${Math.random().toString(36).slice(2, 8)}`,
  key: 'a',
  action: vi.fn(),
  description: 'Test shortcut',
  category: 'actions',
  scope: 'global',
  ...overrides,
})

const createKeyboardEvent = (
  key: string,
  options: Partial<KeyboardEventInit> = {}
): KeyboardEvent => {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...options,
  })
}

// ============================================================================
// createShortcutRegistry Tests
// ============================================================================

describe('createShortcutRegistry', () => {
  let registry: ReturnType<typeof createShortcutRegistry>

  beforeEach(() => {
    registry = createShortcutRegistry()
  })

  describe('register', () => {
    it('should register a shortcut', () => {
      const shortcut = createShortcut({ id: 'test.action' })
      registry.register(shortcut)

      const all = registry.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe('test.action')
    })

    it('should return unregister function', () => {
      const shortcut = createShortcut({ id: 'test.action' })
      const unregister = registry.register(shortcut)

      expect(registry.getAll()).toHaveLength(1)

      unregister()

      expect(registry.getAll()).toHaveLength(0)
    })

    it('should overwrite existing shortcut with same id', () => {
      const shortcut1 = createShortcut({ id: 'test.action', key: 'a' })
      const shortcut2 = createShortcut({ id: 'test.action', key: 'b' })

      registry.register(shortcut1)
      registry.register(shortcut2)

      const all = registry.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].key).toBe('b')
    })
  })

  describe('unregister', () => {
    it('should remove a registered shortcut', () => {
      const shortcut = createShortcut({ id: 'test.action' })
      registry.register(shortcut)
      registry.unregister('test.action')

      expect(registry.getAll()).toHaveLength(0)
    })

    it('should handle unregistering non-existent shortcut', () => {
      expect(() => registry.unregister('non-existent')).not.toThrow()
    })
  })

  describe('getByScope', () => {
    it('should return shortcuts for specific scope', () => {
      registry.register(createShortcut({ id: 'a', scope: 'sessions' }))
      registry.register(createShortcut({ id: 'b', scope: 'history' }))
      registry.register(createShortcut({ id: 'c', scope: 'sessions' }))

      const sessionShortcuts = registry.getByScope('sessions')
      expect(sessionShortcuts).toHaveLength(2)
    })

    it('should include global shortcuts in all scopes', () => {
      registry.register(createShortcut({ id: 'a', scope: 'sessions' }))
      registry.register(createShortcut({ id: 'b', scope: 'global' }))

      const sessionShortcuts = registry.getByScope('sessions')
      expect(sessionShortcuts).toHaveLength(2)

      const historyShortcuts = registry.getByScope('history')
      expect(historyShortcuts).toHaveLength(1) // Only global
      expect(historyShortcuts[0].id).toBe('b')
    })
  })

  describe('getByCategory', () => {
    it('should return shortcuts for specific category', () => {
      registry.register(createShortcut({ id: 'a', category: 'navigation' }))
      registry.register(createShortcut({ id: 'b', category: 'actions' }))
      registry.register(createShortcut({ id: 'c', category: 'navigation' }))

      const navShortcuts = registry.getByCategory('navigation')
      expect(navShortcuts).toHaveLength(2)
    })
  })

  describe('scope management', () => {
    it('should default to sessions scope', () => {
      expect(registry.getActiveScope()).toBe('sessions')
    })

    it('should update active scope', () => {
      registry.setActiveScope('history')
      expect(registry.getActiveScope()).toBe('history')
    })
  })

  describe('isEnabled', () => {
    it('should return true for global shortcut', () => {
      const shortcut = createShortcut({ id: 'global.action', scope: 'global' })
      registry.register(shortcut)

      expect(registry.isEnabled('global.action')).toBe(true)
    })

    it('should return true for shortcut in active scope', () => {
      const shortcut = createShortcut({
        id: 'sessions.action',
        scope: 'sessions',
      })
      registry.register(shortcut)
      registry.setActiveScope('sessions')

      expect(registry.isEnabled('sessions.action')).toBe(true)
    })

    it('should return false for shortcut in different scope', () => {
      const shortcut = createShortcut({
        id: 'history.action',
        scope: 'history',
      })
      registry.register(shortcut)
      registry.setActiveScope('sessions')

      expect(registry.isEnabled('history.action')).toBe(false)
    })

    it('should check when condition', () => {
      let condition = false
      const shortcut = createShortcut({
        id: 'conditional',
        scope: 'global',
        when: () => condition,
      })
      registry.register(shortcut)

      expect(registry.isEnabled('conditional')).toBe(false)

      condition = true
      expect(registry.isEnabled('conditional')).toBe(true)
    })

    it('should return false for non-existent shortcut', () => {
      expect(registry.isEnabled('non-existent')).toBe(false)
    })
  })
})

// ============================================================================
// matchesShortcut Tests
// ============================================================================

describe('matchesShortcut', () => {
  describe('simple key matching', () => {
    it('should match lowercase letter', () => {
      const shortcut = createShortcut({ key: 'a' })
      const event = createKeyboardEvent('a')

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should not match lowercase shortcut when shift produces uppercase', () => {
      // When shortcut is defined with lowercase 'a', pressing Shift+A should NOT match
      // because shift is only allowed for uppercase letter shortcuts (like 'G')
      const shortcut = createShortcut({ key: 'a' })
      const event = createKeyboardEvent('A', { shiftKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(false)
    })

    it('should match uppercase letter (G)', () => {
      const shortcut = createShortcut({ key: 'G' })
      const event = createKeyboardEvent('G', { shiftKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })
  })

  describe('special keys', () => {
    it('should match Enter', () => {
      const shortcut = createShortcut({ key: 'Enter' })
      const event = createKeyboardEvent('Enter')

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should match Escape', () => {
      const shortcut = createShortcut({ key: 'Escape' })
      const event = createKeyboardEvent('Escape')

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should match Arrow keys', () => {
      const shortcut = createShortcut({ key: 'ArrowDown' })
      const event = createKeyboardEvent('ArrowDown')

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should match Space', () => {
      const shortcut = createShortcut({ key: ' ' })
      const event = createKeyboardEvent(' ')

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should match Tab as special key', () => {
      const shortcut = createShortcut({ key: 'Tab' })
      const event = createKeyboardEvent('Tab')

      // Tab is handled as a special key, matches directly
      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })
  })

  describe('shift symbols', () => {
    it('should match ? (Shift+/)', () => {
      const shortcut = createShortcut({ key: '?' })
      const event = createKeyboardEvent('?', { shiftKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should match ! (Shift+1)', () => {
      const shortcut = createShortcut({ key: '!' })
      const event = createKeyboardEvent('!', { shiftKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })
  })

  describe('modifier keys', () => {
    it('should match with ctrl modifier', () => {
      const shortcut = createShortcut({ key: 'b', modifiers: ['ctrl'] })
      const event = createKeyboardEvent('b', { ctrlKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should match with meta modifier', () => {
      const shortcut = createShortcut({ key: 'b', modifiers: ['meta'] })
      const event = createKeyboardEvent('b', { metaKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should match with alt modifier', () => {
      const shortcut = createShortcut({ key: 'b', modifiers: ['alt'] })
      const event = createKeyboardEvent('b', { altKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should match with shift modifier', () => {
      const shortcut = createShortcut({ key: 'b', modifiers: ['shift'] })
      const event = createKeyboardEvent('B', { shiftKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should match with multiple modifiers', () => {
      const shortcut = createShortcut({
        key: 'b',
        modifiers: ['ctrl', 'shift'],
      })
      const event = createKeyboardEvent('B', { ctrlKey: true, shiftKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(true)
    })

    it('should not match when modifier is missing', () => {
      const shortcut = createShortcut({ key: 'b', modifiers: ['ctrl'] })
      const event = createKeyboardEvent('b') // No ctrl

      expect(matchesShortcut(event, shortcut, [])).toBe(false)
    })

    it('should not match when extra modifier is pressed', () => {
      const shortcut = createShortcut({ key: 'b' }) // No modifiers
      const event = createKeyboardEvent('b', { ctrlKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(false)
    })
  })

  describe('key sequences', () => {
    it('should match gg sequence', () => {
      const shortcut = createShortcut({ key: 'gg' })
      const event = createKeyboardEvent('g')

      expect(matchesShortcut(event, shortcut, ['g', 'g'])).toBe(true)
    })

    it('should not match partial sequence', () => {
      const shortcut = createShortcut({ key: 'gg' })
      const event = createKeyboardEvent('g')

      expect(matchesShortcut(event, shortcut, ['g'])).toBe(false)
    })

    it('should match sequence at end of buffer', () => {
      const shortcut = createShortcut({ key: 'gg' })
      const event = createKeyboardEvent('g')

      expect(matchesShortcut(event, shortcut, ['x', 'y', 'g', 'g'])).toBe(true)
    })
  })

  describe('non-matching cases', () => {
    it('should not match different key', () => {
      const shortcut = createShortcut({ key: 'a' })
      const event = createKeyboardEvent('b')

      expect(matchesShortcut(event, shortcut, [])).toBe(false)
    })

    it('should not match when wrong modifier', () => {
      const shortcut = createShortcut({ key: 'b', modifiers: ['ctrl'] })
      const event = createKeyboardEvent('b', { metaKey: true })

      expect(matchesShortcut(event, shortcut, [])).toBe(false)
    })
  })
})

// ============================================================================
// isInputElement Tests
// ============================================================================

describe('isInputElement', () => {
  it('should return true for input element', () => {
    const input = document.createElement('input')
    expect(isInputElement(input)).toBe(true)
  })

  it('should return true for textarea element', () => {
    const textarea = document.createElement('textarea')
    expect(isInputElement(textarea)).toBe(true)
  })

  it('should return true for contentEditable element', () => {
    const div = document.createElement('div')
    div.contentEditable = 'true'
    document.body.appendChild(div)
    try {
      expect(isInputElement(div)).toBe(true)
    } finally {
      document.body.removeChild(div)
    }
  })

  it('should verify contentEditable property is set correctly', () => {
    // Test that the contentEditable property can be set
    // The actual isContentEditable check doesn't work in jsdom
    const div = document.createElement('div')
    div.contentEditable = 'true'

    // Verify the property is set (even if jsdom doesn't reflect it correctly)
    expect(div.contentEditable).toBe('true')

    // Note: In a real browser, isInputElement(div) would return true
    // but jsdom doesn't fully implement isContentEditable
  })

  it('should return false for regular div', () => {
    const div = document.createElement('div')
    expect(isInputElement(div)).toBe(false)
  })

  it('should return false for button', () => {
    const button = document.createElement('button')
    expect(isInputElement(button)).toBe(false)
  })

  it('should return false for null', () => {
    expect(isInputElement(null)).toBe(false)
  })
})

// ============================================================================
// sortByPriority Tests
// ============================================================================

describe('sortByPriority', () => {
  it('should sort by priority descending (higher first)', () => {
    const shortcuts = [
      createShortcut({ id: 'low', priority: 1 }),
      createShortcut({ id: 'high', priority: 10 }),
      createShortcut({ id: 'mid', priority: 5 }),
    ]

    const sorted = sortByPriority(shortcuts)

    expect(sorted[0].id).toBe('high')
    expect(sorted[1].id).toBe('mid')
    expect(sorted[2].id).toBe('low')
  })

  it('should treat undefined priority as 0', () => {
    const shortcuts = [
      createShortcut({ id: 'none' }), // No priority
      createShortcut({ id: 'positive', priority: 5 }),
      createShortcut({ id: 'zero', priority: 0 }),
    ]

    const sorted = sortByPriority(shortcuts)

    expect(sorted[0].id).toBe('positive')
    // none and zero both have effective priority 0, order depends on stability
  })

  it('should not mutate original array', () => {
    const shortcuts = [
      createShortcut({ id: 'b', priority: 1 }),
      createShortcut({ id: 'a', priority: 10 }),
    ]

    const sorted = sortByPriority(shortcuts)

    expect(shortcuts[0].id).toBe('b')
    expect(sorted[0].id).toBe('a')
  })

  it('should handle empty array', () => {
    expect(sortByPriority([])).toEqual([])
  })

  it('should handle single item', () => {
    const shortcuts = [createShortcut({ id: 'only' })]
    const sorted = sortByPriority(shortcuts)

    expect(sorted).toHaveLength(1)
    expect(sorted[0].id).toBe('only')
  })
})
