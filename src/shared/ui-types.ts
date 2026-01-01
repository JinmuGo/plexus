/**
 * UI Types
 *
 * Centralized type definitions for UI-related state and components.
 */

// ============================================================================
// View Modes
// ============================================================================

/**
 * Main dashboard view modes
 */
export type ViewMode = 'sessions' | 'history' | 'analytics' | 'settings'

/**
 * History view sub-modes
 */
export type HistoryViewMode = 'sessions' | 'insights'

/**
 * Analytics view sub-modes
 */
export type AnalyticsViewMode = 'cost' | 'statistics'

// ============================================================================
// Badge Variants
// ============================================================================

/**
 * Badge component variants
 */
export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'info'
  | 'approval'
  | 'error'
  | 'idle'

// ============================================================================
// Selection State
// ============================================================================

/**
 * Generic selection state for lists and grids
 */
export interface SelectionState {
  /** Currently selected item ID */
  selectedId: string | null
  /** Keyboard navigation index */
  keyboardIndex: number
}

// ============================================================================
// Panel State
// ============================================================================

/**
 * Side panel state
 */
export interface PanelState {
  /** Whether the panel is open */
  isOpen: boolean
  /** Selected item ID (if any) */
  selectedId: string | null
}

// ============================================================================
// Keyboard Shortcut Types
// ============================================================================

/**
 * Keyboard shortcut categories
 */
export type ShortcutCategory =
  | 'navigation'
  | 'actions'
  | 'permission'
  | 'list'
  | 'system'

/**
 * Platform modifier key
 */
export type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta'

/**
 * Keyboard shortcut definition
 */
export interface ShortcutDefinition {
  id: string
  key: string
  modifiers?: ModifierKey[]
  description: string
  category: ShortcutCategory
  when?: () => boolean
  action: () => void | Promise<void>
}

// ============================================================================
// Theme Types (re-export from theme-types for convenience)
// ============================================================================

export type { Theme, ResolvedTheme } from './theme-types'
