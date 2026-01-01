/**
 * Store Provider
 *
 * Centralized store initialization and lifecycle management.
 * Wraps the app to ensure stores are properly initialized and cleaned up.
 */

import { useEffect, type ReactNode } from 'react'
import { useSessionStore } from 'renderer/stores'

interface StoreProviderProps {
  children: ReactNode
}

/**
 * Initializes and manages Zustand stores lifecycle.
 *
 * Handles:
 * - Session store initialization with IPC subscription
 * - Cleanup on unmount
 */
export function StoreProvider({ children }: StoreProviderProps) {
  const initialize = useSessionStore(state => state.initialize)
  const cleanup = useSessionStore(state => state.cleanup)

  useEffect(() => {
    initialize()
    return cleanup
  }, [initialize, cleanup])

  return <>{children}</>
}
