/**
 * Keyboard Shortcut System
 *
 * A comprehensive keyboard shortcut system with:
 * - Scoped shortcuts (per view)
 * - Key sequences (gg, G)
 * - Platform-aware modifiers
 * - Cheatsheet UI support
 */

export { ShortcutProvider, useShortcutContext } from './shortcut-context'
export {
  useScopedShortcuts,
  useGlobalShortcuts,
  useActiveScope,
} from './use-scoped-shortcuts'
export {
  createShortcutRegistry,
  matchesShortcut,
  isInputElement,
} from './shortcut-registry'
export {
  formatShortcut,
  isMac,
  platformModifier,
} from './types'
export type {
  Modifier,
  ShortcutScope,
  ShortcutCategory,
  ShortcutDefinition,
  ShortcutRegistration,
  ShortcutRegistry,
  ShortcutContextValue,
} from './types'
