/**
 * UI Store Tests
 *
 * @vitest-environment jsdom
 *
 * Tests for Zustand UI state management.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from './ui-store'

// ============================================================================
// Setup
// ============================================================================

// Reset store before each test
beforeEach(() => {
  useUIStore.setState({
    viewMode: 'sessions',
    selectedSessionId: null,
    isPanelOpen: false,
    selectedAttentionIndex: 0,
  })
})

// ============================================================================
// Initial State Tests
// ============================================================================

describe('initial state', () => {
  it('should have default view mode as sessions', () => {
    expect(useUIStore.getState().viewMode).toBe('sessions')
  })

  it('should have no selected session', () => {
    expect(useUIStore.getState().selectedSessionId).toBeNull()
  })

  it('should have panel closed', () => {
    expect(useUIStore.getState().isPanelOpen).toBe(false)
  })

  it('should have attention index at 0', () => {
    expect(useUIStore.getState().selectedAttentionIndex).toBe(0)
  })
})

// ============================================================================
// View Mode Tests
// ============================================================================

describe('setViewMode', () => {
  it('should change view mode', () => {
    useUIStore.getState().setViewMode('history')
    expect(useUIStore.getState().viewMode).toBe('history')
  })

  it('should allow all view modes', () => {
    const modes = ['sessions', 'history', 'analytics', 'settings'] as const
    for (const mode of modes) {
      useUIStore.getState().setViewMode(mode)
      expect(useUIStore.getState().viewMode).toBe(mode)
    }
  })
})

// ============================================================================
// Session Selection Tests
// ============================================================================

describe('selectSession', () => {
  it('should select a session and open panel', () => {
    useUIStore.getState().selectSession('session-123')

    const state = useUIStore.getState()
    expect(state.selectedSessionId).toBe('session-123')
    expect(state.isPanelOpen).toBe(true)
  })

  it('should deselect and close panel when null', () => {
    // First select something
    useUIStore.getState().selectSession('session-123')
    // Then deselect
    useUIStore.getState().selectSession(null)

    const state = useUIStore.getState()
    expect(state.selectedSessionId).toBeNull()
    expect(state.isPanelOpen).toBe(false)
  })
})

describe('highlightSession', () => {
  it('should set selected session without opening panel', () => {
    useUIStore.getState().highlightSession('session-456')

    const state = useUIStore.getState()
    expect(state.selectedSessionId).toBe('session-456')
    expect(state.isPanelOpen).toBe(false)
  })

  it('should allow highlighting null', () => {
    useUIStore.getState().highlightSession('session-456')
    useUIStore.getState().highlightSession(null)

    expect(useUIStore.getState().selectedSessionId).toBeNull()
  })
})

describe('toggleSessionPanel', () => {
  it('should open panel for new session', () => {
    useUIStore.getState().toggleSessionPanel('session-new')

    const state = useUIStore.getState()
    expect(state.selectedSessionId).toBe('session-new')
    expect(state.isPanelOpen).toBe(true)
  })

  it('should toggle panel for same session', () => {
    // Open panel
    useUIStore.getState().toggleSessionPanel('session-same')
    expect(useUIStore.getState().isPanelOpen).toBe(true)

    // Toggle closed
    useUIStore.getState().toggleSessionPanel('session-same')
    expect(useUIStore.getState().isPanelOpen).toBe(false)

    // Toggle open again
    useUIStore.getState().toggleSessionPanel('session-same')
    expect(useUIStore.getState().isPanelOpen).toBe(true)
  })

  it('should switch to new session and open panel', () => {
    // Start with one session
    useUIStore.getState().toggleSessionPanel('session-first')
    expect(useUIStore.getState().isPanelOpen).toBe(true)

    // Close panel
    useUIStore.getState().toggleSessionPanel('session-first')
    expect(useUIStore.getState().isPanelOpen).toBe(false)

    // Switch to different session - should open
    useUIStore.getState().toggleSessionPanel('session-second')
    expect(useUIStore.getState().selectedSessionId).toBe('session-second')
    expect(useUIStore.getState().isPanelOpen).toBe(true)
  })
})

describe('closePanel', () => {
  it('should close panel without clearing selection', () => {
    useUIStore.getState().selectSession('session-123')
    useUIStore.getState().closePanel()

    const state = useUIStore.getState()
    expect(state.isPanelOpen).toBe(false)
    expect(state.selectedSessionId).toBe('session-123')
  })

  it('should do nothing if panel already closed', () => {
    useUIStore.getState().closePanel()
    expect(useUIStore.getState().isPanelOpen).toBe(false)
  })
})

// ============================================================================
// Keyboard Navigation Tests
// ============================================================================

describe('setSelectedAttentionIndex', () => {
  it('should set attention index directly', () => {
    useUIStore.getState().setSelectedAttentionIndex(5)
    expect(useUIStore.getState().selectedAttentionIndex).toBe(5)
  })

  it('should allow setting to 0', () => {
    useUIStore.getState().setSelectedAttentionIndex(10)
    useUIStore.getState().setSelectedAttentionIndex(0)
    expect(useUIStore.getState().selectedAttentionIndex).toBe(0)
  })
})

describe('selectNextAttention', () => {
  it('should increment index within bounds', () => {
    useUIStore.getState().setSelectedAttentionIndex(0)
    useUIStore.getState().selectNextAttention(5) // maxIndex = 5

    expect(useUIStore.getState().selectedAttentionIndex).toBe(1)
  })

  it('should not exceed maxIndex - 1', () => {
    useUIStore.getState().setSelectedAttentionIndex(4)
    useUIStore.getState().selectNextAttention(5) // maxIndex = 5

    // Already at last index (4), should stay
    expect(useUIStore.getState().selectedAttentionIndex).toBe(4)
  })

  it('should do nothing when maxIndex is 0', () => {
    useUIStore.getState().setSelectedAttentionIndex(0)
    useUIStore.getState().selectNextAttention(0)

    expect(useUIStore.getState().selectedAttentionIndex).toBe(0)
  })

  it('should do nothing when maxIndex is negative', () => {
    useUIStore.getState().setSelectedAttentionIndex(0)
    useUIStore.getState().selectNextAttention(-1)

    expect(useUIStore.getState().selectedAttentionIndex).toBe(0)
  })

  it('should work through multiple increments', () => {
    useUIStore.getState().setSelectedAttentionIndex(0)

    useUIStore.getState().selectNextAttention(10)
    expect(useUIStore.getState().selectedAttentionIndex).toBe(1)

    useUIStore.getState().selectNextAttention(10)
    expect(useUIStore.getState().selectedAttentionIndex).toBe(2)

    useUIStore.getState().selectNextAttention(10)
    expect(useUIStore.getState().selectedAttentionIndex).toBe(3)
  })
})

describe('selectPrevAttention', () => {
  it('should decrement index within bounds', () => {
    useUIStore.getState().setSelectedAttentionIndex(3)
    useUIStore.getState().selectPrevAttention()

    expect(useUIStore.getState().selectedAttentionIndex).toBe(2)
  })

  it('should not go below 0', () => {
    useUIStore.getState().setSelectedAttentionIndex(0)
    useUIStore.getState().selectPrevAttention()

    expect(useUIStore.getState().selectedAttentionIndex).toBe(0)
  })

  it('should work through multiple decrements', () => {
    useUIStore.getState().setSelectedAttentionIndex(5)

    useUIStore.getState().selectPrevAttention()
    expect(useUIStore.getState().selectedAttentionIndex).toBe(4)

    useUIStore.getState().selectPrevAttention()
    expect(useUIStore.getState().selectedAttentionIndex).toBe(3)

    useUIStore.getState().selectPrevAttention()
    expect(useUIStore.getState().selectedAttentionIndex).toBe(2)
  })
})

describe('clampAttentionIndex', () => {
  it('should reset to 0 when maxIndex is 0', () => {
    useUIStore.getState().setSelectedAttentionIndex(5)
    useUIStore.getState().clampAttentionIndex(0)

    expect(useUIStore.getState().selectedAttentionIndex).toBe(0)
  })

  it('should clamp to maxIndex - 1 when index exceeds', () => {
    useUIStore.getState().setSelectedAttentionIndex(10)
    useUIStore.getState().clampAttentionIndex(5) // maxIndex = 5

    expect(useUIStore.getState().selectedAttentionIndex).toBe(4) // 5 - 1
  })

  it('should not change valid index', () => {
    useUIStore.getState().setSelectedAttentionIndex(3)
    useUIStore.getState().clampAttentionIndex(10)

    expect(useUIStore.getState().selectedAttentionIndex).toBe(3)
  })

  it('should handle edge case at maxIndex boundary', () => {
    useUIStore.getState().setSelectedAttentionIndex(5)
    useUIStore.getState().clampAttentionIndex(5) // index 5 is out of bounds (0-4 valid)

    expect(useUIStore.getState().selectedAttentionIndex).toBe(4)
  })
})

// ============================================================================
// Session Removal Tests
// ============================================================================

describe('handleSessionRemoved', () => {
  it('should clear selection and close panel when selected session is removed', () => {
    useUIStore.getState().selectSession('session-123')

    useUIStore.getState().handleSessionRemoved('session-123')

    const state = useUIStore.getState()
    expect(state.selectedSessionId).toBeNull()
    expect(state.isPanelOpen).toBe(false)
  })

  it('should do nothing when different session is removed', () => {
    useUIStore.getState().selectSession('session-123')

    useUIStore.getState().handleSessionRemoved('session-other')

    const state = useUIStore.getState()
    expect(state.selectedSessionId).toBe('session-123')
    expect(state.isPanelOpen).toBe(true)
  })

  it('should do nothing when no session is selected', () => {
    useUIStore.getState().handleSessionRemoved('session-123')

    const state = useUIStore.getState()
    expect(state.selectedSessionId).toBeNull()
    expect(state.isPanelOpen).toBe(false)
  })
})
