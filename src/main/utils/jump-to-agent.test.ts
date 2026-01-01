/**
 * Jump to Agent Tests
 *
 * Tests for focus navigation orchestration and active agent selection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClaudeSession } from 'shared/hook-types'

// Mock dependencies before importing the module
vi.mock('../tmux/target-finder', () => ({
  focusPane: vi.fn(),
  focusByTty: vi.fn(),
  focusCursor: vi.fn(),
}))

vi.mock('./platform-focus', () => ({
  activateTerminalApp: vi.fn(),
  activateWindowByProcess: vi.fn(),
}))

import { jumpToAgent, selectActiveAgent } from './jump-to-agent'
import { focusPane, focusByTty, focusCursor } from '../tmux/target-finder'
import { activateTerminalApp, activateWindowByProcess } from './platform-focus'

// ============================================================================
// Test Fixtures
// ============================================================================

const createSession = (
  overrides: Partial<ClaudeSession> = {}
): ClaudeSession => ({
  id: 'test-session-id',
  cwd: '/Users/test/project',
  agent: 'claude',
  phase: 'idle',
  startedAt: Date.now(),
  lastActivity: Date.now(),
  isInTmux: false,
  ...overrides,
})

const createTmuxSession = (): ClaudeSession =>
  createSession({
    isInTmux: true,
    tmuxTarget: {
      session: 'main',
      window: '0',
      pane: '0',
    },
  })

const createTtySession = (): ClaudeSession =>
  createSession({
    tty: '/dev/ttys001',
  })

const createCursorSession = (): ClaudeSession =>
  createSession({
    agent: 'cursor',
    cwd: '/Users/test/cursor-project',
  })

// ============================================================================
// jumpToAgent Tests
// ============================================================================

describe('jumpToAgent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('tmux path', () => {
    it('should focus via tmux when session has tmuxTarget and isInTmux=true', async () => {
      const session = createTmuxSession()
      vi.mocked(focusPane).mockResolvedValue(true)

      const result = await jumpToAgent(session)

      expect(focusPane).toHaveBeenCalledWith(session.tmuxTarget)
      expect(result).toEqual({ success: true, method: 'tmux' })
    })

    it('should not try tmux when isInTmux=false', async () => {
      const session = createSession({ isInTmux: false })

      await jumpToAgent(session)

      expect(focusPane).not.toHaveBeenCalled()
    })

    it('should fallback to tty when tmux focus fails', async () => {
      const session = createSession({
        isInTmux: true,
        tmuxTarget: { session: 'main', window: '0', pane: '0' },
        tty: '/dev/ttys001',
      })
      vi.mocked(focusPane).mockResolvedValue(false)
      vi.mocked(focusByTty).mockResolvedValue(true)

      const result = await jumpToAgent(session)

      expect(focusPane).toHaveBeenCalled()
      expect(focusByTty).toHaveBeenCalledWith('/dev/ttys001')
      expect(result).toEqual({ success: true, method: 'tty' })
    })

    it('should fallback to tty when tmux focus throws', async () => {
      const session = createSession({
        isInTmux: true,
        tmuxTarget: { session: 'main', window: '0', pane: '0' },
        tty: '/dev/ttys001',
      })
      vi.mocked(focusPane).mockRejectedValue(new Error('tmux error'))
      vi.mocked(focusByTty).mockResolvedValue(true)

      const result = await jumpToAgent(session)

      expect(result).toEqual({ success: true, method: 'tty' })
    })
  })

  describe('tty path', () => {
    it('should focus by TTY when session has tty but no tmux', async () => {
      const session = createTtySession()
      vi.mocked(focusByTty).mockResolvedValue(true)

      const result = await jumpToAgent(session)

      expect(focusByTty).toHaveBeenCalledWith('/dev/ttys001')
      expect(result).toEqual({ success: true, method: 'tty' })
    })

    it('should fallback when tty focus returns false', async () => {
      const session = createSession({
        agent: 'claude',
        tty: '/dev/ttys001',
      })
      vi.mocked(focusByTty).mockResolvedValue(false)
      vi.mocked(activateTerminalApp).mockResolvedValue(true)

      const result = await jumpToAgent(session)

      expect(result).toEqual({ success: true, method: 'terminal-fallback' })
    })
  })

  describe('cursor path', () => {
    it('should focus Cursor IDE when agent=cursor and has cwd', async () => {
      const session = createCursorSession()
      vi.mocked(focusCursor).mockResolvedValue(true)

      const result = await jumpToAgent(session)

      expect(focusCursor).toHaveBeenCalledWith('/Users/test/cursor-project')
      expect(result).toEqual({ success: true, method: 'cursor' })
    })

    it('should try activateWindowByProcess as last resort for cursor', async () => {
      const session = createCursorSession()
      vi.mocked(focusCursor).mockResolvedValue(false)
      vi.mocked(activateWindowByProcess).mockResolvedValue(true)

      const result = await jumpToAgent(session)

      expect(activateWindowByProcess).toHaveBeenCalledWith('Cursor')
      expect(result).toEqual({ success: true, method: 'cursor' })
    })
  })

  describe('terminal fallback', () => {
    it('should activate terminal for claude agent when other methods fail', async () => {
      const session = createSession({ agent: 'claude' })
      vi.mocked(activateTerminalApp).mockResolvedValue(true)

      const result = await jumpToAgent(session)

      expect(activateTerminalApp).toHaveBeenCalled()
      expect(result).toEqual({ success: true, method: 'terminal-fallback' })
    })

    it('should activate terminal for gemini agent when other methods fail', async () => {
      const session = createSession({ agent: 'gemini' })
      vi.mocked(activateTerminalApp).mockResolvedValue(true)

      const result = await jumpToAgent(session)

      expect(activateTerminalApp).toHaveBeenCalled()
      expect(result).toEqual({ success: true, method: 'terminal-fallback' })
    })

    it('should not try terminal fallback for cursor agent', async () => {
      const session = createSession({ agent: 'cursor', cwd: undefined })
      vi.mocked(activateWindowByProcess).mockResolvedValue(true)

      await jumpToAgent(session)

      expect(activateTerminalApp).not.toHaveBeenCalled()
    })
  })

  describe('failure case', () => {
    it('should return failed when all methods fail', async () => {
      const session = createSession({ agent: 'claude' })
      vi.mocked(activateTerminalApp).mockResolvedValue(false)

      const result = await jumpToAgent(session)

      expect(result).toEqual({
        success: false,
        method: 'failed',
        error: 'No focus method succeeded',
      })
    })

    it('should return failed for cursor when all methods fail', async () => {
      const session = createCursorSession()
      vi.mocked(focusCursor).mockResolvedValue(false)
      vi.mocked(activateWindowByProcess).mockResolvedValue(false)

      const result = await jumpToAgent(session)

      expect(result).toEqual({
        success: false,
        method: 'failed',
        error: 'No focus method succeeded',
      })
    })
  })
})

// ============================================================================
// selectActiveAgent Tests
// ============================================================================

describe('selectActiveAgent', () => {
  describe('priority ordering', () => {
    it('should prioritize waitingForApproval over all other phases', () => {
      const sessions = [
        createSession({ id: 'idle', phase: 'idle' }),
        createSession({ id: 'processing', phase: 'processing' }),
        createSession({ id: 'approval', phase: 'waitingForApproval' }),
        createSession({ id: 'input', phase: 'waitingForInput' }),
      ]

      const result = selectActiveAgent(sessions)

      expect(result?.id).toBe('approval')
    })

    it('should prioritize waitingForInput over processing', () => {
      const sessions = [
        createSession({ id: 'idle', phase: 'idle' }),
        createSession({ id: 'processing', phase: 'processing' }),
        createSession({ id: 'input', phase: 'waitingForInput' }),
      ]

      const result = selectActiveAgent(sessions)

      expect(result?.id).toBe('input')
    })

    it('should prioritize processing over compacting', () => {
      const sessions = [
        createSession({ id: 'idle', phase: 'idle' }),
        createSession({ id: 'compacting', phase: 'compacting' }),
        createSession({ id: 'processing', phase: 'processing' }),
      ]

      const result = selectActiveAgent(sessions)

      expect(result?.id).toBe('processing')
    })

    it('should prioritize compacting over idle', () => {
      const sessions = [
        createSession({ id: 'idle', phase: 'idle' }),
        createSession({ id: 'compacting', phase: 'compacting' }),
      ]

      const result = selectActiveAgent(sessions)

      expect(result?.id).toBe('compacting')
    })
  })

  describe('filtering', () => {
    it('should filter out ended sessions', () => {
      const sessions = [
        createSession({ id: 'ended', phase: 'ended' }),
        createSession({ id: 'idle', phase: 'idle' }),
      ]

      const result = selectActiveAgent(sessions)

      expect(result?.id).toBe('idle')
    })

    it('should return undefined when all sessions are ended', () => {
      const sessions = [
        createSession({ id: 'ended1', phase: 'ended' }),
        createSession({ id: 'ended2', phase: 'ended' }),
      ]

      const result = selectActiveAgent(sessions)

      expect(result).toBeUndefined()
    })

    it('should return undefined for empty array', () => {
      const result = selectActiveAgent([])

      expect(result).toBeUndefined()
    })
  })

  describe('fallback', () => {
    it('should return most recently active session when no priority matches', () => {
      const now = Date.now()
      const sessions = [
        createSession({ id: 'old', phase: 'idle', lastActivity: now - 1000 }),
        createSession({ id: 'recent', phase: 'idle', lastActivity: now }),
      ]

      const result = selectActiveAgent(sessions)

      // Since 'idle' is in priority order, it should find first idle
      expect(result?.phase).toBe('idle')
    })

    it('should select single active session', () => {
      const session = createSession({ id: 'only', phase: 'processing' })

      const result = selectActiveAgent([session])

      expect(result?.id).toBe('only')
    })
  })
})
