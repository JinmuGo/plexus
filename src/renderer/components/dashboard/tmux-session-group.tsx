import { useState, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Terminal } from 'lucide-react'
import { ClaudeSessionTile } from './claude-session-tile'
import {
  collapseVariants,
  containerVariants,
} from 'renderer/lib/motion-variants'
import { durations } from 'renderer/lib/motion'
import { PHASE_PRIORITY } from 'renderer/lib/constants'
import type { ClaudeSession } from 'shared/hook-types'

interface TmuxSessionGroupProps {
  tmuxSession: string | null // null = no tmux
  sessions: ClaudeSession[]
  selectedSessionId: string | null
  onSelectSession: (sessionId: string) => void
  defaultExpanded?: boolean
}

// Color palette for tmux sessions (based on session name hash)
const TMUX_COLORS = [
  { border: 'border-l-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  {
    border: 'border-l-green-500',
    bg: 'bg-green-500/10',
    text: 'text-green-400',
  },
  {
    border: 'border-l-purple-500',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
  },
  {
    border: 'border-l-orange-500',
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
  },
  { border: 'border-l-pink-500', bg: 'bg-pink-500/10', text: 'text-pink-400' },
  { border: 'border-l-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
  {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
  },
  { border: 'border-l-red-500', bg: 'bg-red-500/10', text: 'text-red-400' },
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

export const TmuxSessionGroup = memo(function TmuxSessionGroup({
  tmuxSession,
  sessions,
  selectedSessionId,
  onSelectSession,
  defaultExpanded = true,
}: TmuxSessionGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // Get color for this tmux session
  const colorScheme = useMemo(() => {
    if (!tmuxSession || tmuxSession === '__pending_tmux__') {
      return {
        border: 'border-l-gray-500',
        bg: 'bg-gray-500/10',
        text: 'text-gray-400',
      }
    }
    const colorIndex = hashString(tmuxSession) % TMUX_COLORS.length
    return TMUX_COLORS[colorIndex]
  }, [tmuxSession])

  // Sort sessions within group by phase priority
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const priorityA = PHASE_PRIORITY[a.phase] ?? 99
      const priorityB = PHASE_PRIORITY[b.phase] ?? 99
      if (priorityA !== priorityB) return priorityA - priorityB
      return b.lastActivity - a.lastActivity
    })
  }, [sessions])

  // Calculate stats
  const stats = useMemo(() => {
    const active = sessions.filter(s => s.phase !== 'ended').length
    const needApproval = sessions.filter(
      s => s.phase === 'waitingForApproval'
    ).length
    const processing = sessions.filter(s => s.phase === 'processing').length
    return { active, needApproval, processing, total: sessions.length }
  }, [sessions])

  // Check if there are multiple windows in this tmux session
  const hasMultipleWindows = useMemo(() => {
    const uniqueWindows = new Set(
      sessions
        .filter(s => s.tmuxTarget?.window !== undefined)
        .map(s => s.tmuxTarget?.window)
    )
    return uniqueWindows.size > 1
  }, [sessions])

  // Handle special placeholder for sessions where tmux target is still being resolved
  const isPendingTmux = tmuxSession === '__pending_tmux__'
  const displayName = isPendingTmux
    ? 'Tmux (resolving...)'
    : tmuxSession || 'No tmux'

  return (
    <div
      className={`border-l-4 ${colorScheme.border} rounded-lg overflow-hidden`}
    >
      {/* Group Header */}
      <button
        className={`w-full flex items-center justify-between p-3 ${colorScheme.bg} hover:bg-opacity-20 transition-colors`}
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ duration: durations.fast }}
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.div>
          <Terminal className={`w-4 h-4 ${colorScheme.text}`} />
          <span className={`font-medium ${colorScheme.text}`}>
            {displayName}
          </span>
          {tmuxSession && hasMultipleWindows && sessions[0]?.tmuxTarget && (
            <span className="text-xs text-muted-foreground">
              (window {sessions[0].tmuxTarget.window})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stats.needApproval > 0 && (
            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded-full">
              {stats.needApproval} pending
            </span>
          )}
          {stats.processing > 0 && (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
              {stats.processing} active
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {stats.active}/{stats.total}
          </span>
        </div>
      </button>

      {/* Group Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            animate="animate"
            className="overflow-hidden"
            exit="exit"
            initial="initial"
            variants={collapseVariants}
          >
            <motion.div
              animate="animate"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-background/50"
              initial="initial"
              variants={containerVariants}
            >
              <AnimatePresence mode="popLayout">
                {sortedSessions.map(session => (
                  <ClaudeSessionTile
                    isSelected={session.id === selectedSessionId}
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    session={session}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
