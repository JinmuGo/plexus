/**
 * Session Helpers Tests
 *
 * Tests for pure functions that compute derived session state.
 */

import { describe, it, expect } from 'vitest'
import { getStagedSessions, getActiveSessions } from './session-helpers'
import type { ClaudeSession, SessionPhase } from 'shared/hook-types'

// ============================================================================
// Test Fixtures
// ============================================================================

const createSession = (
  overrides: Partial<ClaudeSession> = {}
): ClaudeSession => ({
  id: `session-${Math.random().toString(36).slice(2, 8)}`,
  cwd: '/test/project',
  agent: 'claude',
  phase: 'idle',
  startedAt: Date.now() - 60000,
  lastActivity: Date.now(),
  isInTmux: false,
  ...overrides,
})

// ============================================================================
// getStagedSessions Tests
// ============================================================================

describe('getStagedSessions', () => {
  it('should return empty array for empty input', () => {
    expect(getStagedSessions([])).toEqual([])
  })

  it('should filter out ended sessions', () => {
    const sessions = [
      createSession({ phase: 'idle' }),
      createSession({ phase: 'ended' }),
      createSession({ phase: 'waitingForApproval' }),
    ]

    const staged = getStagedSessions(sessions)

    expect(staged).toHaveLength(2)
    expect(staged.every(s => s.phase !== 'ended')).toBe(true)
  })

  it('should filter out processing sessions', () => {
    const sessions = [
      createSession({ phase: 'idle' }),
      createSession({ phase: 'processing' }),
      createSession({ phase: 'waitingForInput' }),
    ]

    const staged = getStagedSessions(sessions)

    expect(staged).toHaveLength(2)
    expect(staged.every(s => s.phase !== 'processing')).toBe(true)
  })

  it('should filter out compacting sessions', () => {
    const sessions = [
      createSession({ phase: 'idle' }),
      createSession({ phase: 'compacting' }),
    ]

    const staged = getStagedSessions(sessions)

    expect(staged).toHaveLength(1)
    expect(staged[0].phase).toBe('idle')
  })

  it('should sort by phase priority (waitingForApproval first)', () => {
    const sessions = [
      createSession({ id: 'idle-1', phase: 'idle' }),
      createSession({ id: 'approval-1', phase: 'waitingForApproval' }),
      createSession({ id: 'input-1', phase: 'waitingForInput' }),
    ]

    const staged = getStagedSessions(sessions)

    expect(staged[0].phase).toBe('waitingForApproval')
    expect(staged[1].phase).toBe('waitingForInput')
    expect(staged[2].phase).toBe('idle')
  })

  it('should sort by lastActivity within same phase (most recent first)', () => {
    const now = Date.now()
    const sessions = [
      createSession({
        id: 'old',
        phase: 'waitingForApproval',
        lastActivity: now - 5000,
      }),
      createSession({
        id: 'new',
        phase: 'waitingForApproval',
        lastActivity: now,
      }),
      createSession({
        id: 'mid',
        phase: 'waitingForApproval',
        lastActivity: now - 2000,
      }),
    ]

    const staged = getStagedSessions(sessions)

    expect(staged[0].id).toBe('new')
    expect(staged[1].id).toBe('mid')
    expect(staged[2].id).toBe('old')
  })

  it('should handle mixed phases with correct priority and time sorting', () => {
    const now = Date.now()
    const sessions = [
      createSession({
        id: 'idle-old',
        phase: 'idle',
        lastActivity: now - 10000,
      }),
      createSession({
        id: 'approval-old',
        phase: 'waitingForApproval',
        lastActivity: now - 5000,
      }),
      createSession({
        id: 'input-new',
        phase: 'waitingForInput',
        lastActivity: now,
      }),
      createSession({
        id: 'approval-new',
        phase: 'waitingForApproval',
        lastActivity: now - 1000,
      }),
    ]

    const staged = getStagedSessions(sessions)

    // All approval sessions first (sorted by time)
    expect(staged[0].id).toBe('approval-new')
    expect(staged[1].id).toBe('approval-old')
    // Then input sessions
    expect(staged[2].id).toBe('input-new')
    // Then idle sessions
    expect(staged[3].id).toBe('idle-old')
  })

  it('should only include staged phases', () => {
    const allPhases: SessionPhase[] = [
      'idle',
      'processing',
      'waitingForInput',
      'waitingForApproval',
      'compacting',
      'ended',
    ]

    const sessions = allPhases.map(phase => createSession({ phase }))
    const staged = getStagedSessions(sessions)

    const includedPhases = new Set(staged.map(s => s.phase))
    expect(includedPhases.has('idle')).toBe(true)
    expect(includedPhases.has('waitingForInput')).toBe(true)
    expect(includedPhases.has('waitingForApproval')).toBe(true)
    expect(includedPhases.has('processing')).toBe(false)
    expect(includedPhases.has('compacting')).toBe(false)
    expect(includedPhases.has('ended')).toBe(false)
  })
})

// ============================================================================
// getActiveSessions Tests
// ============================================================================

describe('getActiveSessions', () => {
  it('should return empty array for empty input', () => {
    expect(getActiveSessions([])).toEqual([])
  })

  it('should filter out ended sessions', () => {
    const sessions = [
      createSession({ phase: 'idle' }),
      createSession({ phase: 'ended' }),
      createSession({ phase: 'processing' }),
    ]

    const active = getActiveSessions(sessions)

    expect(active).toHaveLength(2)
    expect(active.every(s => s.phase !== 'ended')).toBe(true)
  })

  it('should include all non-ended phases', () => {
    const phases: SessionPhase[] = [
      'idle',
      'processing',
      'waitingForInput',
      'waitingForApproval',
      'compacting',
    ]

    const sessions = phases.map(phase => createSession({ phase }))
    const active = getActiveSessions(sessions)

    expect(active).toHaveLength(5)
  })

  it('should return all sessions if none are ended', () => {
    const sessions = [
      createSession({ phase: 'idle' }),
      createSession({ phase: 'processing' }),
      createSession({ phase: 'waitingForApproval' }),
    ]

    const active = getActiveSessions(sessions)

    expect(active).toHaveLength(3)
  })

  it('should return empty if all sessions are ended', () => {
    const sessions = [
      createSession({ phase: 'ended' }),
      createSession({ phase: 'ended' }),
    ]

    const active = getActiveSessions(sessions)

    expect(active).toHaveLength(0)
  })

  it('should preserve original session order', () => {
    const sessions = [
      createSession({ id: 'first', phase: 'idle' }),
      createSession({ id: 'second', phase: 'processing' }),
      createSession({ id: 'third', phase: 'waitingForApproval' }),
    ]

    const active = getActiveSessions(sessions)

    expect(active[0].id).toBe('first')
    expect(active[1].id).toBe('second')
    expect(active[2].id).toBe('third')
  })
})
