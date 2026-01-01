/**
 * Vitest Test Setup
 *
 * Configures the test environment for React component testing.
 * Only applies browser mocks when running in jsdom environment.
 */

import { afterEach, vi } from 'vitest'

// Check if we're in a browser-like environment (jsdom)
const isBrowserEnv = typeof window !== 'undefined'

if (isBrowserEnv) {
  // Import jest-dom matchers only in browser environment
  await import('@testing-library/jest-dom/vitest')

  // Import cleanup for React Testing Library
  const { cleanup } = await import('@testing-library/react')

  // Cleanup after each test
  afterEach(() => {
    cleanup()
  })

  // Mock window.App (Electron IPC bridge)
  const mockApp = {
    history: {
      getSessions: vi.fn(),
      getSession: vi.fn(),
      deleteSession: vi.fn(),
      getFullContent: vi.fn(),
      parseJsonlForReplay: vi.fn(),
      getSessionWithMessages: vi.fn(),
      getEnhancedPrompts: vi.fn(),
      resync: vi.fn(),
      vacuum: vi.fn(),
    },
    claudeSessions: {
      getAll: vi.fn(),
      terminate: vi.fn(),
      remove: vi.fn(),
    },
    tmux: {
      focus: vi.fn(),
      interrupt: vi.fn(),
    },
    permissions: {
      respond: vi.fn(),
      getCapabilities: vi.fn(),
      getAutoAllowed: vi.fn(),
    },
    ai: {
      hasApiKey: vi.fn(),
      improvePrompt: vi.fn(),
      savePrompt: vi.fn(),
      deleteSavedPrompt: vi.fn(),
      getSavedPrompts: vi.fn(),
    },
    settings: {
      get: vi.fn(),
      set: vi.fn(),
    },
    theme: {
      get: vi.fn().mockResolvedValue('dark'),
      set: vi.fn().mockResolvedValue(undefined),
      onSystemChange: vi.fn().mockReturnValue(() => {}),
    },
  }

  vi.stubGlobal('App', mockApp)

  // Mock matchMedia for responsive tests
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}
