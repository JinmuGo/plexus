/**
 * Shortcut Context
 *
 * React Context Provider for the keyboard shortcut system.
 * Handles global keydown events and dispatches to registered shortcuts.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type {
  ShortcutContextValue,
  ShortcutScope,
  ShortcutRegistry,
  KeySequenceState,
} from './types'
import {
  createShortcutRegistry,
  matchesShortcut,
  isInputElement,
  sortByPriority,
} from './shortcut-registry'

const ShortcutContext = createContext<ShortcutContextValue | null>(null)

const KEY_SEQUENCE_TIMEOUT = 500 // ms to wait for next key in sequence

interface ShortcutProviderProps {
  children: ReactNode
  initialScope?: ShortcutScope
}

export function ShortcutProvider({
  children,
  initialScope = 'sessions',
}: ShortcutProviderProps) {
  const registryRef = useRef<ShortcutRegistry | null>(null)
  if (!registryRef.current) {
    registryRef.current = createShortcutRegistry()
  }
  const registry = registryRef.current

  const [activeScope, setActiveScopeState] =
    useState<ShortcutScope>(initialScope)
  const [showCheatsheet, setShowCheatsheet] = useState(false)

  // Key sequence state for handling 'gg', etc.
  const sequenceState = useRef<KeySequenceState>({
    buffer: [],
    timeoutId: null,
    lastKeyTime: 0,
  })

  const setActiveScope = useCallback(
    (scope: ShortcutScope) => {
      setActiveScopeState(scope)
      registry.setActiveScope(scope)
    },
    [registry]
  )

  const toggleCheatsheet = useCallback(() => {
    setShowCheatsheet(prev => !prev)
  }, [])

  const openCheatsheet = useCallback(() => {
    setShowCheatsheet(true)
  }, [])

  const closeCheatsheet = useCallback(() => {
    setShowCheatsheet(false)
  }, [])

  // Handle keydown events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input field
      if (isInputElement(event.target)) return

      const now = Date.now()
      const state = sequenceState.current

      // Clear buffer if too much time has passed
      if (now - state.lastKeyTime > KEY_SEQUENCE_TIMEOUT) {
        state.buffer = []
      }

      // Add key to buffer (for sequences like 'gg')
      if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        state.buffer.push(event.key)
        state.lastKeyTime = now

        // Clear previous timeout
        if (state.timeoutId) {
          clearTimeout(state.timeoutId)
        }

        // Set new timeout to clear buffer
        state.timeoutId = setTimeout(() => {
          state.buffer = []
        }, KEY_SEQUENCE_TIMEOUT)
      }

      // Get shortcuts for current scope
      const scopeShortcuts = registry.getByScope(activeScope)
      const sortedShortcuts = sortByPriority(scopeShortcuts)

      // Find matching shortcut
      for (const shortcut of sortedShortcuts) {
        // Check if enabled (scope + condition)
        if (!registry.isEnabled(shortcut.id)) continue

        if (matchesShortcut(event, shortcut, state.buffer)) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault()
          }
          shortcut.action()

          // Clear buffer after successful match
          state.buffer = []
          if (state.timeoutId) {
            clearTimeout(state.timeoutId)
            state.timeoutId = null
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      // Clear timeout on unmount
      if (sequenceState.current.timeoutId) {
        clearTimeout(sequenceState.current.timeoutId)
      }
    }
  }, [registry, activeScope])

  // Set initial scope
  useEffect(() => {
    registry.setActiveScope(initialScope)
  }, [registry, initialScope])

  const value = useMemo<ShortcutContextValue>(
    () => ({
      registry,
      activeScope,
      setActiveScope,
      showCheatsheet,
      toggleCheatsheet,
      openCheatsheet,
      closeCheatsheet,
    }),
    [
      registry,
      activeScope,
      setActiveScope,
      showCheatsheet,
      toggleCheatsheet,
      openCheatsheet,
      closeCheatsheet,
    ]
  )

  return (
    <ShortcutContext.Provider value={value}>
      {children}
    </ShortcutContext.Provider>
  )
}

export function useShortcutContext(): ShortcutContextValue {
  const context = useContext(ShortcutContext)
  if (!context) {
    throw new Error('useShortcutContext must be used within a ShortcutProvider')
  }
  return context
}
