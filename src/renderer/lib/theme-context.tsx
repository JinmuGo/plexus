import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import type { Theme, ResolvedTheme } from 'shared/theme-types'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ThemeProviderProps {
  children: ReactNode
}

// Transition duration in ms (should match CSS)
const THEME_TRANSITION_DURATION = 120

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark')
  const [isLoaded, setIsLoaded] = useState(false)

  // Track if we're in a user-initiated theme change to prevent duplicate updates
  const isUserActionRef = useRef(false)

  // Load initial theme from main process
  useEffect(() => {
    const load = async () => {
      try {
        const stored = await window.App.theme.get()
        const resolved = await window.App.theme.getResolved()
        setThemeState(stored)
        setResolvedTheme(resolved)
      } catch (error) {
        console.error('[ThemeProvider] Failed to load theme:', error)
      } finally {
        setIsLoaded(true)
      }
    }
    load()
  }, [])

  // Subscribe to system theme changes (OS dark mode toggle)
  useEffect(() => {
    return window.App.theme.onSystemChange(resolved => {
      // Skip if this is triggered by our own user action
      if (!isUserActionRef.current) {
        setResolvedTheme(resolved)
      }
    })
  }, [])

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement
    if (resolvedTheme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [resolvedTheme])

  const setTheme = useCallback(async (newTheme: Theme) => {
    const root = document.documentElement

    // Mark as user action to prevent duplicate updates from system listener
    isUserActionRef.current = true

    // Enable transition for smooth theme switching
    root.classList.add('theme-transitioning')

    setThemeState(newTheme)

    try {
      // set() now returns resolved theme - single IPC call instead of two
      const resolved = await window.App.theme.set(newTheme)
      setResolvedTheme(resolved)
    } catch (error) {
      console.error('[ThemeProvider] Failed to set theme:', error)
    } finally {
      // Remove transition class after animation completes
      requestAnimationFrame(() => {
        setTimeout(() => {
          root.classList.remove('theme-transitioning')
          isUserActionRef.current = false
        }, THEME_TRANSITION_DURATION)
      })
    }
  }, [])

  // Prevent flash of wrong theme
  if (!isLoaded) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
