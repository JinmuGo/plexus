import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, Sparkles, ArrowRight } from 'lucide-react'
import { FolderGroup } from './folder-group'
import { TmuxSessionGroup } from './tmux-session-group'
import { ClaudeSessionTile } from './claude-session-tile'
import {
  containerVariants,
  cardVariants,
  hoverLift,
} from 'renderer/lib/motion-variants'
import { springs } from 'renderer/lib/motion'
import {
  ClaudeIcon,
  GeminiIcon,
  CursorIcon,
  PlexusLogo,
} from 'renderer/components/ui/icons'
import { cn } from 'renderer/lib/utils'
import { PHASE_PRIORITY } from 'renderer/lib/constants'
import type { ClaudeSession } from 'shared/hook-types'

// Agent configuration for the empty state cards
const AGENTS = [
  {
    id: 'claude',
    name: 'Claude Code',
    description: "Anthropic's agentic coding tool",
    command: 'claude',
    icon: ClaudeIcon,
    gradient: 'from-agent-claude/20 via-agent-claude/10 to-transparent',
    borderGlow: 'hover:shadow-[0_0_30px_-5px] hover:shadow-agent-claude/30',
    iconBg: 'bg-agent-claude/15',
    iconColor: 'text-agent-claude',
    accentBorder: 'border-agent-claude/30 hover:border-agent-claude/60',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: "Google's AI coding assistant",
    command: 'gemini',
    icon: GeminiIcon,
    gradient: 'from-agent-gemini/20 via-agent-gemini/10 to-transparent',
    borderGlow: 'hover:shadow-[0_0_30px_-5px] hover:shadow-agent-gemini/30',
    iconBg: 'bg-agent-gemini/15',
    iconColor: 'text-agent-gemini',
    accentBorder: 'border-agent-gemini/30 hover:border-agent-gemini/60',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'AI-powered code editor',
    command: 'cursor .',
    icon: CursorIcon,
    gradient: 'from-agent-cursor/20 via-agent-cursor/10 to-transparent',
    borderGlow: 'hover:shadow-[0_0_30px_-5px] hover:shadow-agent-cursor/30',
    iconBg: 'bg-agent-cursor/15',
    iconColor: 'text-agent-cursor',
    accentBorder: 'border-agent-cursor/30 hover:border-agent-cursor/60',
  },
] as const

interface ClaudeSessionsViewProps {
  sessions: ClaudeSession[]
  selectedSessionId: string | null
  keyboardSelectedId?: string | null
  onSelectSession: (sessionId: string) => void
  groupByFolder?: boolean
  groupByTmux?: boolean
}

// Sort sessions by phase priority, then by last activity
export function sortSessions(sessions: ClaudeSession[]): ClaudeSession[] {
  return [...sessions].sort((a, b) => {
    const priorityA = PHASE_PRIORITY[a.phase] ?? 99
    const priorityB = PHASE_PRIORITY[b.phase] ?? 99
    if (priorityA !== priorityB) return priorityA - priorityB
    return b.lastActivity - a.lastActivity
  })
}

interface FolderGroupData {
  projectRoot: string
  projectName: string
  sessions: ClaudeSession[]
}

export function ClaudeSessionsView({
  sessions,
  selectedSessionId,
  keyboardSelectedId = null,
  onSelectSession,
  groupByFolder = true,
  groupByTmux = true,
}: ClaudeSessionsViewProps) {
  // Group sessions by folder, then by tmux
  const { folderGroups, ungroupedSessions } = useMemo(() => {
    if (!groupByFolder) {
      return { folderGroups: [], ungroupedSessions: sessions }
    }

    const folders = new Map<
      string,
      { projectName: string; sessions: ClaudeSession[] }
    >()
    const ungrouped: ClaudeSession[] = []

    for (const session of sessions) {
      if (session.projectRoot && session.projectName) {
        const existing = folders.get(session.projectRoot)
        if (existing) {
          existing.sessions.push(session)
        } else {
          folders.set(session.projectRoot, {
            projectName: session.projectName,
            sessions: [session],
          })
        }
      } else {
        ungrouped.push(session)
      }
    }

    // Sort folders by priority (has approval > most recent activity)
    const sortedFolders: FolderGroupData[] = Array.from(folders.entries())
      .map(([projectRoot, data]) => ({
        projectRoot,
        projectName: data.projectName,
        sessions: data.sessions,
      }))
      .sort((a, b) => {
        const approvalA = a.sessions.some(s => s.phase === 'waitingForApproval')
        const approvalB = b.sessions.some(s => s.phase === 'waitingForApproval')
        if (approvalA && !approvalB) return -1
        if (approvalB && !approvalA) return 1
        const maxA = Math.max(...a.sessions.map(s => s.lastActivity))
        const maxB = Math.max(...b.sessions.map(s => s.lastActivity))
        return maxB - maxA
      })

    return {
      folderGroups: sortedFolders,
      ungroupedSessions: sortSessions(ungrouped),
    }
  }, [sessions, groupByFolder])

  // Legacy tmux grouping (for ungrouped sessions when folder grouping is enabled)
  const { individualSessions, tmuxGroups } = useMemo(() => {
    const sessionsToGroup = groupByFolder ? ungroupedSessions : sessions
    const individual: ClaudeSession[] = []
    const groups = new Map<string, ClaudeSession[]>()

    for (const session of sessionsToGroup) {
      if (groupByTmux && session.isInTmux && session.tmuxTarget?.session) {
        const key = session.tmuxTarget.session
        const existing = groups.get(key) || []
        existing.push(session)
        groups.set(key, existing)
      } else {
        individual.push(session)
      }
    }

    // Sort individual sessions
    const sortedIndividual = sortSessions(individual)

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

    return { individualSessions: sortedIndividual, tmuxGroups: sortedGroups }
  }, [sessions, ungroupedSessions, groupByFolder, groupByTmux])

  const hasFolderGroups = folderGroups.length > 0
  const hasTmuxGroups = tmuxGroups.length > 0

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-12 overflow-auto">
        {/* Hero Section */}
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10 max-w-lg"
          initial={{ opacity: 0, y: 20 }}
          transition={springs.gentle}
        >
          {/* Animated logo */}
          <motion.div
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-6"
            initial={{ scale: 0.8, opacity: 0 }}
            transition={{ ...springs.bounce, delay: 0.1 }}
          >
            <PlexusLogo className="text-primary" size={48} />
          </motion.div>

          <h1 className="text-2xl font-bold text-foreground mb-3 tracking-tight">
            Welcome to Plexus
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Monitor and manage your AI coding agents in one place.
            <br />
            <span className="text-foreground/80">
              Start any agent to begin tracking.
            </span>
          </p>
        </motion.div>

        {/* Agent Cards Grid */}
        <motion.div
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-3xl w-full"
          initial="initial"
          variants={containerVariants}
        >
          {AGENTS.map((agent, index) => {
            const Icon = agent.icon
            return (
              <motion.div
                className={cn(
                  'group relative flex flex-col p-5 rounded-2xl',
                  // Glass base - theme-aware
                  'bg-[var(--glass-bg-2)]',
                  'backdrop-blur-xl',
                  // Glass border - theme-aware
                  'border border-[var(--glass-border-medium)]',
                  // Transitions
                  'transition-all duration-300',
                  'cursor-default',
                  agent.accentBorder,
                  agent.borderGlow,
                  // Hover glass enhancement
                  'hover:bg-[var(--glass-bg-3)]'
                )}
                key={agent.id}
                variants={cardVariants}
                {...hoverLift}
                custom={index}
              >
                {/* Glass gradient overlay on hover */}
                <div
                  className={cn(
                    'absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                    'backdrop-blur-sm',
                    agent.gradient
                  )}
                />

                {/* Content */}
                <div className="relative z-10">
                  {/* Icon */}
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                      'transition-transform duration-300 group-hover:scale-110',
                      agent.iconBg
                    )}
                  >
                    <Icon className={agent.iconColor} size={28} />
                  </div>

                  {/* Text */}
                  <h3 className="font-semibold text-foreground mb-1">
                    {agent.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {agent.description}
                  </p>

                  {/* Command */}
                  <div className="flex items-center gap-2 mt-auto">
                    <div
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg',
                        'bg-surface-2/80 border border-border/50',
                        'font-mono text-sm text-foreground'
                      )}
                    >
                      <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{agent.command}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Footer hint */}
        <motion.div
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 mt-10 text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Sparkles className="w-4 h-4" />
          <span>Sessions appear automatically once detected</span>
        </motion.div>
      </div>
    )
  }

  // If grouping is disabled, show flat list
  if (!groupByTmux) {
    const sortedSessions = sortSessions(sessions)

    return (
      <motion.div
        animate="animate"
        className="flex flex-col gap-2 p-4"
        initial="initial"
        variants={containerVariants}
      >
        <AnimatePresence mode="popLayout">
          {sortedSessions.map(session => (
            <ClaudeSessionTile
              isKeyboardSelected={session.id === keyboardSelectedId}
              isSelected={session.id === selectedSessionId}
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              session={session}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    )
  }

  // Folder-based grouping view
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Folder groups */}
      {hasFolderGroups &&
        folderGroups.map(folder => (
          <FolderGroup
            key={folder.projectRoot}
            onSelectSession={onSelectSession}
            projectName={folder.projectName}
            projectRoot={folder.projectRoot}
            selectedSessionId={selectedSessionId}
            sessions={folder.sessions}
          />
        ))}

      {/* Ungrouped tmux groups (sessions without project root) */}
      {hasTmuxGroups &&
        tmuxGroups.map(([tmuxSession, groupSessions]) => (
          <TmuxSessionGroup
            key={tmuxSession}
            onSelectSession={onSelectSession}
            selectedSessionId={selectedSessionId}
            sessions={groupSessions}
            tmuxSession={tmuxSession}
          />
        ))}

      {/* Individual sessions (non-tmux, no project) */}
      {individualSessions.length > 0 && (
        <motion.div
          animate="animate"
          className="flex flex-col gap-2"
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
  )
}
