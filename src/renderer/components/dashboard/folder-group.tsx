import { useState, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Folder, Terminal } from 'lucide-react'
import { TmuxSessionGroup } from './tmux-session-group'
import { ClaudeSessionTile } from './claude-session-tile'
import { Badge } from '../ui/badge'
import {
  collapseVariants,
  containerVariants,
} from 'renderer/lib/motion-variants'
import { durations, springs } from 'renderer/lib/motion'
import { cn } from 'renderer/lib/utils'
import { PHASE_PRIORITY } from 'renderer/lib/constants'
import type { ClaudeSession } from 'shared/hook-types'

interface FolderGroupProps {
  projectRoot: string
  projectName: string
  sessions: ClaudeSession[]
  selectedSessionId: string | null
  onSelectSession: (sessionId: string) => void
  defaultExpanded?: boolean
}

// Raycast-style vibrant color palette for folders
const FOLDER_COLORS = [
  {
    border: 'border-l-status-active',
    bg: 'from-status-active/15 to-status-active/5',
    text: 'text-status-active',
    icon: 'text-status-active',
  },
  {
    border: 'border-l-primary',
    bg: 'from-primary/15 to-primary/5',
    text: 'text-primary',
    icon: 'text-primary',
  },
  {
    border: 'border-l-status-approval',
    bg: 'from-status-approval/15 to-status-approval/5',
    text: 'text-status-approval',
    icon: 'text-status-approval',
  },
  {
    border: 'border-l-agent-cursor',
    bg: 'from-agent-cursor/15 to-agent-cursor/5',
    text: 'text-agent-cursor',
    icon: 'text-agent-cursor',
  },
  {
    border: 'border-l-agent-gemini',
    bg: 'from-agent-gemini/15 to-agent-gemini/5',
    text: 'text-agent-gemini',
    icon: 'text-agent-gemini',
  },
  {
    border: 'border-l-status-waiting',
    bg: 'from-status-waiting/15 to-status-waiting/5',
    text: 'text-status-waiting',
    icon: 'text-status-waiting',
  },
  {
    border: 'border-l-agent-claude',
    bg: 'from-agent-claude/15 to-agent-claude/5',
    text: 'text-agent-claude',
    icon: 'text-agent-claude',
  },
  {
    border: 'border-l-status-thinking',
    bg: 'from-status-thinking/15 to-status-thinking/5',
    text: 'text-status-thinking',
    icon: 'text-status-thinking',
  },
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

export const FolderGroup = memo(function FolderGroup({
  projectRoot: _projectRoot,
  projectName,
  sessions,
  selectedSessionId,
  onSelectSession,
  defaultExpanded = true,
}: FolderGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // Get color for this folder
  const colorScheme = useMemo(() => {
    const colorIndex = hashString(projectName) % FOLDER_COLORS.length
    return FOLDER_COLORS[colorIndex]
  }, [projectName])

  // Separate sessions into tmux groups and individual sessions
  const { tmuxGroups, individualSessions } = useMemo(() => {
    const groups = new Map<string, ClaudeSession[]>()
    const individual: ClaudeSession[] = []

    for (const session of sessions) {
      if (session.isInTmux && session.tmuxTarget?.session) {
        const key = session.tmuxTarget.session
        const existing = groups.get(key) || []
        existing.push(session)
        groups.set(key, existing)
      } else {
        individual.push(session)
      }
    }

    // Sort groups by priority (has approval > most recent activity)
    const sortedGroups = Array.from(groups.entries()).sort(
      ([, sessionsA], [, sessionsB]) => {
        const approvalA = sessionsA.some(s => s.phase === 'waitingForApproval')
        const approvalB = sessionsB.some(s => s.phase === 'waitingForApproval')
        if (approvalA && !approvalB) return -1
        if (approvalB && !approvalA) return 1
        const maxA = Math.max(...sessionsA.map(s => s.lastActivity))
        const maxB = Math.max(...sessionsB.map(s => s.lastActivity))
        return maxB - maxA
      }
    )

    // Sort individual sessions by phase priority
    const sortedIndividual = [...individual].sort((a, b) => {
      const priorityA = PHASE_PRIORITY[a.phase] ?? 99
      const priorityB = PHASE_PRIORITY[b.phase] ?? 99
      if (priorityA !== priorityB) return priorityA - priorityB
      return b.lastActivity - a.lastActivity
    })

    return { tmuxGroups: sortedGroups, individualSessions: sortedIndividual }
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

  // Check if there are tmux groups
  const hasTmuxGroups = tmuxGroups.length > 0

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'border-l-2 rounded-xl overflow-hidden',
        // Glass container - theme-aware
        'bg-[var(--glass-bg-1)]',
        'backdrop-blur-xl',
        // Subtle inner glow
        'shadow-[var(--glass-inner-glow)]',
        'transition-all duration-200',
        colorScheme.border
      )}
      initial={{ opacity: 0, y: 8 }}
      transition={springs.gentle}
    >
      {/* Group Header - Glass style */}
      <button
        className={cn(
          'w-full flex items-center justify-between p-3',
          'bg-gradient-to-r',
          colorScheme.bg,
          'backdrop-blur-md',
          'hover:brightness-110 transition-all duration-200',
          'border-b border-[var(--glass-border-subtle)]'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <div className="flex items-center gap-2.5">
          <motion.div
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ duration: durations.fast, ease: 'easeOut' }}
          >
            <ChevronDown className={cn('w-4 h-4', colorScheme.icon)} />
          </motion.div>
          <Folder className={cn('w-4 h-4', colorScheme.icon)} />
          <span className={cn('font-semibold text-sm', colorScheme.text)}>
            {projectName}
          </span>
          {hasTmuxGroups && (
            <Badge className="text-[10px] px-1.5 py-0 gap-1" variant="outline">
              <Terminal className="w-3 h-3" />
              {tmuxGroups.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stats.needApproval > 0 && (
            <Badge className="text-[10px] font-bold" variant="approval">
              {stats.needApproval} pending
            </Badge>
          )}
          {stats.processing > 0 && (
            <Badge className="text-[10px]" variant="processing">
              {stats.processing} active
            </Badge>
          )}
          <span className="text-xs text-muted-foreground font-medium tabular-nums">
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
            <div className="p-3 bg-surface-1/50 space-y-3">
              {/* Tmux groups within this folder */}
              {hasTmuxGroups &&
                tmuxGroups.map(([tmuxSession, groupSessions]) => (
                  <TmuxSessionGroup
                    defaultExpanded={true}
                    key={tmuxSession}
                    onSelectSession={onSelectSession}
                    selectedSessionId={selectedSessionId}
                    sessions={groupSessions}
                    tmuxSession={tmuxSession}
                  />
                ))}

              {/* Individual sessions (non-tmux) */}
              {individualSessions.length > 0 && (
                <motion.div
                  animate="animate"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                  initial="initial"
                  variants={containerVariants}
                >
                  <AnimatePresence mode="popLayout">
                    {individualSessions.map(session => (
                      <ClaudeSessionTile
                        isSelected={session.id === selectedSessionId}
                        key={session.id}
                        onClick={() => onSelectSession(session.id)}
                        session={session}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
