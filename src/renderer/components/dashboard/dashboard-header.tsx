/**
 * Dashboard Header
 *
 * Mobile header with sidebar trigger and session summary.
 */

import { useMemo } from 'react'
import { SidebarTrigger } from '../ui/sidebar'
import { Badge } from '../ui/badge'
import { useSessionStore } from 'renderer/stores'
import type { SessionPhase } from 'shared/hook-types'

// Phase display names for summary
const PHASE_SUMMARY: Record<SessionPhase, string> = {
  processing: 'processing',
  waitingForInput: 'waiting',
  waitingForApproval: 'need approval',
  compacting: 'compacting',
  idle: 'idle',
  ended: 'ended',
}

export function DashboardHeader() {
  const sessions = useSessionStore(state => state.sessions)

  // Calculate session summary
  const activeSessions = useMemo(
    () => sessions.filter(s => s.phase !== 'ended'),
    [sessions]
  )

  const approvalNeeded = useMemo(
    () => sessions.filter(s => s.phase === 'waitingForApproval').length,
    [sessions]
  )

  // Get summary text
  const summaryText = useMemo(() => {
    if (activeSessions.length === 0) {
      return 'No active sessions'
    }

    if (approvalNeeded > 0) {
      return `${approvalNeeded} need${approvalNeeded === 1 ? 's' : ''} approval`
    }

    // Count by phase
    const phaseCounts = new Map<SessionPhase, number>()
    for (const session of activeSessions) {
      phaseCounts.set(session.phase, (phaseCounts.get(session.phase) || 0) + 1)
    }

    // Find most common phase
    let maxPhase: SessionPhase = 'idle'
    let maxCount = 0
    for (const [phase, count] of phaseCounts) {
      if (count > maxCount) {
        maxPhase = phase
        maxCount = count
      }
    }

    return `${activeSessions.length} session${activeSessions.length === 1 ? '' : 's'} (${PHASE_SUMMARY[maxPhase]})`
  }, [activeSessions, approvalNeeded])

  return (
    <header className="flex h-12 items-center gap-3 border-b px-4 md:hidden">
      <SidebarTrigger />
      <span className="text-sm text-muted-foreground truncate">
        {summaryText}
      </span>
      {approvalNeeded > 0 && (
        <Badge className="ml-auto" variant="approval">
          {approvalNeeded}
        </Badge>
      )}
    </header>
  )
}
