/**
 * useScopedShortcuts Hook
 *
 * Register shortcuts scoped to a specific view/component.
 * Shortcuts are automatically unregistered when the component unmounts.
 */

import { useEffect, useRef } from 'react'
import { useShortcutContext } from './shortcut-context'
import type {
  ShortcutScope,
  ShortcutRegistration,
  ShortcutDefinition,
} from './types'

/**
 * Register shortcuts for a specific scope
 *
 * @param scope - The scope where shortcuts should be active
 * @param shortcuts - Array of shortcut definitions (without scope, it's added automatically)
 *
 * @example
 * ```tsx
 * useScopedShortcuts('sessions', [
 *   { id: 'sessions.next', key: 'j', action: selectNext, description: 'Next session', category: 'list' },
 *   { id: 'sessions.prev', key: 'k', action: selectPrev, description: 'Previous session', category: 'list' },
 *   { id: 'sessions.approve', key: 'y', action: approve, description: 'Allow', category: 'permission' },
 * ])
 * ```
 */
export function useScopedShortcuts(
  scope: ShortcutScope,
  shortcuts: ShortcutRegistration[]
): void {
  const { registry } = useShortcutContext()
  const unregisterFns = useRef<Array<() => void>>([])

  useEffect(() => {
    // Unregister previous shortcuts
    for (const unregister of unregisterFns.current) {
      unregister()
    }
    unregisterFns.current = []

    // Register new shortcuts
    for (const shortcut of shortcuts) {
      const fullShortcut: ShortcutDefinition = {
        ...shortcut,
        scope,
      }
      const unregister = registry.register(fullShortcut)
      unregisterFns.current.push(unregister)
    }

    // Cleanup on unmount
    return () => {
      for (const unregister of unregisterFns.current) {
        unregister()
      }
      unregisterFns.current = []
    }
  }, [registry, scope, shortcuts])
}

/**
 * Register global shortcuts (always active regardless of scope)
 */
export function useGlobalShortcuts(shortcuts: ShortcutRegistration[]): void {
  useScopedShortcuts('global', shortcuts)
}

/**
 * Hook to set the active scope when a component mounts
 *
 * @param scope - The scope to activate
 *
 * @example
 * ```tsx
 * function SessionsView() {
 *   useActiveScope('sessions')
 *   // ...
 * }
 * ```
 */
export function useActiveScope(scope: ShortcutScope): void {
  const { setActiveScope } = useShortcutContext()

  useEffect(() => {
    setActiveScope(scope)
  }, [scope, setActiveScope])
}
