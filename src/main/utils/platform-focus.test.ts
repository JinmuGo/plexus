/**
 * Platform Focus Tests
 *
 * Tests for cross-platform window activation utilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Store original exec for restoration
const _originalExec = vi.fn()

// Mock child_process before importing
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}))

// We'll dynamically mock PLATFORM per test
vi.mock('shared/constants', () => ({
  PLATFORM: {
    IS_MAC: true,
    IS_WINDOWS: false,
    IS_LINUX: false,
  },
}))

import { exec } from 'node:child_process'
import { PLATFORM } from 'shared/constants'

// ============================================================================
// Helper to reset platform mock
// ============================================================================

function mockPlatform(platform: 'mac' | 'windows' | 'linux') {
  Object.assign(PLATFORM, {
    IS_MAC: platform === 'mac',
    IS_WINDOWS: platform === 'windows',
    IS_LINUX: platform === 'linux',
  })
}

// ============================================================================
// activateAppMac Tests
// ============================================================================

describe('activateAppMac', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockPlatform('mac')
  })

  it('should return false on non-Mac platforms', async () => {
    mockPlatform('windows')
    const { activateAppMac } = await import('./platform-focus')

    const result = await activateAppMac('Terminal')

    expect(result).toBe(false)
    expect(exec).not.toHaveBeenCalled()
  })

  it('should execute osascript with correct AppleScript command', async () => {
    mockPlatform('mac')
    vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(null, '', '')
      }
      return {} as ReturnType<typeof exec>
    })

    // Re-import to get fresh module with new mocks
    vi.resetModules()
    vi.doMock('shared/constants', () => ({
      PLATFORM: { IS_MAC: true, IS_WINDOWS: false, IS_LINUX: false },
    }))
    const { activateAppMac } = await import('./platform-focus')

    const result = await activateAppMac('WezTerm')

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('osascript'),
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    )
    expect(result).toBe(true)
  })

  it('should return false on exec error', async () => {
    mockPlatform('mac')
    vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(new Error('App not found'), '', '')
      }
      return {} as ReturnType<typeof exec>
    })

    vi.resetModules()
    vi.doMock('shared/constants', () => ({
      PLATFORM: { IS_MAC: true, IS_WINDOWS: false, IS_LINUX: false },
    }))
    const { activateAppMac } = await import('./platform-focus')

    const result = await activateAppMac('NonExistentApp')

    expect(result).toBe(false)
  })
})

// ============================================================================
// activateAppWindows Tests
// ============================================================================

describe('activateAppWindows', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should return false on non-Windows platforms', async () => {
    vi.resetModules()
    vi.doMock('shared/constants', () => ({
      PLATFORM: { IS_MAC: true, IS_WINDOWS: false, IS_LINUX: false },
    }))
    const { activateAppWindows } = await import('./platform-focus')

    const result = await activateAppWindows('notepad')

    expect(result).toBe(false)
  })

  it('should execute PowerShell script with correct process name', async () => {
    vi.resetModules()
    vi.doMock('shared/constants', () => ({
      PLATFORM: { IS_MAC: false, IS_WINDOWS: true, IS_LINUX: false },
    }))
    vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(null, 'success', '')
      }
      return {} as ReturnType<typeof exec>
    })
    const { activateAppWindows } = await import('./platform-focus')

    const result = await activateAppWindows('Cursor')

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('powershell'),
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    )
    expect(result).toBe(true)
  })

  it('should return true when stdout is "success"', async () => {
    vi.resetModules()
    vi.doMock('shared/constants', () => ({
      PLATFORM: { IS_MAC: false, IS_WINDOWS: true, IS_LINUX: false },
    }))
    vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(null, 'success\n', '')
      }
      return {} as ReturnType<typeof exec>
    })
    const { activateAppWindows } = await import('./platform-focus')

    const result = await activateAppWindows('notepad')

    expect(result).toBe(true)
  })

  it('should return false when process not found', async () => {
    vi.resetModules()
    vi.doMock('shared/constants', () => ({
      PLATFORM: { IS_MAC: false, IS_WINDOWS: true, IS_LINUX: false },
    }))
    vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(null, 'not_found\n', '')
      }
      return {} as ReturnType<typeof exec>
    })
    const { activateAppWindows } = await import('./platform-focus')

    const result = await activateAppWindows('nonexistent')

    expect(result).toBe(false)
  })

  it('should return false on exec error', async () => {
    vi.resetModules()
    vi.doMock('shared/constants', () => ({
      PLATFORM: { IS_MAC: false, IS_WINDOWS: true, IS_LINUX: false },
    }))
    vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(new Error('PowerShell error'), '', '')
      }
      return {} as ReturnType<typeof exec>
    })
    const { activateAppWindows } = await import('./platform-focus')

    const result = await activateAppWindows('notepad')

    expect(result).toBe(false)
  })
})

// ============================================================================
// activateTerminalApp Tests
// ============================================================================

describe('activateTerminalApp', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('on macOS', () => {
    it('should try common terminal apps and return true when found', async () => {
      vi.resetModules()
      vi.doMock('shared/constants', () => ({
        PLATFORM: { IS_MAC: true, IS_WINDOWS: false, IS_LINUX: false },
      }))
      vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'WezTerm', '')
        }
        return {} as ReturnType<typeof exec>
      })
      const { activateTerminalApp } = await import('./platform-focus')

      const result = await activateTerminalApp()

      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('osascript'),
        expect.any(Object),
        expect.any(Function)
      )
      expect(result).toBe(true)
    })

    it('should return false when no terminal app is running', async () => {
      vi.resetModules()
      vi.doMock('shared/constants', () => ({
        PLATFORM: { IS_MAC: true, IS_WINDOWS: false, IS_LINUX: false },
      }))
      vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'none', '')
        }
        return {} as ReturnType<typeof exec>
      })
      const { activateTerminalApp } = await import('./platform-focus')

      const result = await activateTerminalApp()

      expect(result).toBe(false)
    })

    it('should return false on AppleScript error', async () => {
      vi.resetModules()
      vi.doMock('shared/constants', () => ({
        PLATFORM: { IS_MAC: true, IS_WINDOWS: false, IS_LINUX: false },
      }))
      vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('AppleScript error'), '', '')
        }
        return {} as ReturnType<typeof exec>
      })
      const { activateTerminalApp } = await import('./platform-focus')

      const result = await activateTerminalApp()

      expect(result).toBe(false)
    })
  })

  describe('on Windows', () => {
    it('should try WindowsTerminal first', async () => {
      vi.resetModules()
      vi.doMock('shared/constants', () => ({
        PLATFORM: { IS_MAC: false, IS_WINDOWS: true, IS_LINUX: false },
      }))
      vi.mocked(exec).mockImplementation((cmd, _opts, callback) => {
        if (typeof callback === 'function') {
          // Return success for WindowsTerminal
          if (cmd.includes('WindowsTerminal')) {
            callback(null, 'success', '')
          } else {
            callback(null, 'not_found', '')
          }
        }
        return {} as ReturnType<typeof exec>
      })
      const { activateTerminalApp } = await import('./platform-focus')

      const result = await activateTerminalApp()

      expect(result).toBe(true)
    })

    it('should fallback to cmd if WindowsTerminal not found', async () => {
      vi.resetModules()
      vi.doMock('shared/constants', () => ({
        PLATFORM: { IS_MAC: false, IS_WINDOWS: true, IS_LINUX: false },
      }))
      let callCount = 0
      vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
        if (typeof callback === 'function') {
          callCount++
          // First call (WindowsTerminal) fails, second call (cmd) succeeds
          if (callCount === 1) {
            callback(null, 'not_found', '')
          } else {
            callback(null, 'success', '')
          }
        }
        return {} as ReturnType<typeof exec>
      })
      const { activateTerminalApp } = await import('./platform-focus')

      const result = await activateTerminalApp()

      expect(result).toBe(true)
    })
  })

  describe('on Linux', () => {
    it('should return false', async () => {
      vi.resetModules()
      vi.doMock('shared/constants', () => ({
        PLATFORM: { IS_MAC: false, IS_WINDOWS: false, IS_LINUX: true },
      }))
      const { activateTerminalApp } = await import('./platform-focus')

      const result = await activateTerminalApp()

      expect(result).toBe(false)
    })
  })
})

// ============================================================================
// activateWindowByProcess Tests
// ============================================================================

describe('activateWindowByProcess', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should use activateAppMac on macOS', async () => {
    vi.resetModules()
    vi.doMock('shared/constants', () => ({
      PLATFORM: { IS_MAC: true, IS_WINDOWS: false, IS_LINUX: false },
    }))
    vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(null, '', '')
      }
      return {} as ReturnType<typeof exec>
    })
    const { activateWindowByProcess } = await import('./platform-focus')

    const result = await activateWindowByProcess('Cursor')

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('osascript'),
      expect.any(Object),
      expect.any(Function)
    )
    expect(result).toBe(true)
  })

  it('should use activateAppWindows on Windows', async () => {
    vi.resetModules()
    vi.doMock('shared/constants', () => ({
      PLATFORM: { IS_MAC: false, IS_WINDOWS: true, IS_LINUX: false },
    }))
    vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
      if (typeof callback === 'function') {
        callback(null, 'success', '')
      }
      return {} as ReturnType<typeof exec>
    })
    const { activateWindowByProcess } = await import('./platform-focus')

    const result = await activateWindowByProcess('notepad')

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('powershell'),
      expect.any(Object),
      expect.any(Function)
    )
    expect(result).toBe(true)
  })

  it('should return false on Linux', async () => {
    vi.resetModules()
    vi.doMock('shared/constants', () => ({
      PLATFORM: { IS_MAC: false, IS_WINDOWS: false, IS_LINUX: true },
    }))
    const { activateWindowByProcess } = await import('./platform-focus')

    const result = await activateWindowByProcess('process')

    expect(result).toBe(false)
  })
})

// ============================================================================
// focusCursorCrossplatform Tests
// ============================================================================

describe('focusCursorCrossplatform', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('on macOS', () => {
    it('should use cursor CLI to open folder', async () => {
      vi.resetModules()
      vi.doMock('shared/constants', () => ({
        PLATFORM: { IS_MAC: true, IS_WINDOWS: false, IS_LINUX: false },
      }))
      vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
        if (typeof callback === 'function') {
          callback(null, '', '')
        }
        return {} as ReturnType<typeof exec>
      })
      const { focusCursorCrossplatform } = await import('./platform-focus')

      const result = await focusCursorCrossplatform('/Users/test/project')

      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('cursor'),
        expect.any(Object),
        expect.any(Function)
      )
      expect(result).toBe(true)
    })

    it('should fallback to activateAppMac when cursor CLI fails', async () => {
      vi.resetModules()
      vi.doMock('shared/constants', () => ({
        PLATFORM: { IS_MAC: true, IS_WINDOWS: false, IS_LINUX: false },
      }))
      let callCount = 0
      vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
        if (typeof callback === 'function') {
          callCount++
          if (callCount === 1) {
            // First call (cursor CLI) fails
            callback(new Error('cursor not found'), '', '')
          } else {
            // Fallback (activateAppMac) succeeds
            callback(null, '', '')
          }
        }
        return {} as ReturnType<typeof exec>
      })
      const { focusCursorCrossplatform } = await import('./platform-focus')

      const result = await focusCursorCrossplatform('/Users/test/project')

      expect(callCount).toBe(2)
      expect(result).toBe(true)
    })
  })

  describe('on Windows', () => {
    it('should use activateAppWindows', async () => {
      vi.resetModules()
      vi.doMock('shared/constants', () => ({
        PLATFORM: { IS_MAC: false, IS_WINDOWS: true, IS_LINUX: false },
      }))
      vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'success', '')
        }
        return {} as ReturnType<typeof exec>
      })
      const { focusCursorCrossplatform } = await import('./platform-focus')

      const result = await focusCursorCrossplatform('C:\\Users\\test\\project')

      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('Cursor'),
        expect.any(Object),
        expect.any(Function)
      )
      expect(result).toBe(true)
    })
  })

  describe('on Linux', () => {
    it('should return false', async () => {
      vi.resetModules()
      vi.doMock('shared/constants', () => ({
        PLATFORM: { IS_MAC: false, IS_WINDOWS: false, IS_LINUX: true },
      }))
      const { focusCursorCrossplatform } = await import('./platform-focus')

      const result = await focusCursorCrossplatform('/home/test/project')

      expect(result).toBe(false)
    })
  })
})
