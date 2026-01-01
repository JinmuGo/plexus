import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { Badge } from '../ui/badge'
import { AgentIcon } from '../ui/icons'
import { StatusIcon, STATUS_CONFIG } from '../ui/icons/status-icon'
import { PermissionActions, QuestionDisplay } from '../permission'
import { activityItemVariants } from 'renderer/lib/motion-variants'
import { cn } from 'renderer/lib/utils'
import type { ClaudeSession } from 'shared/hook-types'

const { App } = window

interface PopoverSessionItemProps {
  session: ClaudeSession
}

function formatPath(cwd: string): string {
  const parts = cwd.split('/')
  if (parts.length <= 2) return cwd
  return parts[parts.length - 1]
}

// Map session phase to badge variant
function getPhaseVariant(phase: ClaudeSession['phase']) {
  switch (phase) {
    case 'waitingForInput':
      return 'success'
    case 'waitingForApproval':
      return 'approval'
    case 'processing':
    case 'compacting':
      return 'info'
    default:
      return 'idle'
  }
}

export function PopoverSessionItem({ session }: PopoverSessionItemProps) {
  const statusConfig = STATUS_CONFIG[session.phase]
  const needsApproval = session.phase === 'waitingForApproval'
  const hasQuestion =
    session.phase === 'waitingForInput' && session.questionContext

  const handleClick = useCallback(async () => {
    await App.tmux.focus(session.id)
  }, [session.id])

  // Prevent click propagation for permission actions
  const handleActionsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <motion.div
      animate="animate"
      className="relative"
      exit="exit"
      initial="initial"
      layout
      variants={activityItemVariants}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: Using div with role="button" to avoid nested button issue with PermissionActions */}
      <div
        className={cn(
          'w-full flex flex-col gap-1.5 px-3 py-2.5 rounded-lg',
          'bg-white/60 dark:bg-white/5 backdrop-blur-sm',
          'border border-border/30',
          'hover:bg-white/80 dark:hover:bg-white/10',
          'hover:border-border/50',
          'transition-all duration-150 cursor-pointer',
          'text-left',
          needsApproval && 'border-status-approval/40 bg-status-approval/5',
          hasQuestion && 'border-blue-400/40 bg-blue-400/5'
        )}
        onClick={handleClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
        role="button"
        tabIndex={0}
      >
        {/* Main row */}
        <div className="w-full flex items-center gap-2">
          <AgentIcon agent={session.agent} size="sm" />
          <StatusIcon phase={session.phase} size="sm" />
          <span className="flex-1 truncate text-sm font-medium">
            {session.displayTitle || formatPath(session.cwd)}
          </span>

          {needsApproval ? (
            // biome-ignore lint/a11y/noStaticElementInteractions: Wrapper to stop click propagation
            // biome-ignore lint/a11y/useKeyWithClickEvents: Keyboard events handled by child PermissionActions buttons
            <span className="contents" onClick={handleActionsClick}>
              <PermissionActions compact session={session} />
            </span>
          ) : (
            <Badge
              className="shrink-0"
              variant={getPhaseVariant(session.phase)}
            >
              {hasQuestion ? 'Question' : statusConfig.label}
            </Badge>
          )}
        </div>

        {/* Question display (when waiting for input with question) */}
        {hasQuestion && session.questionContext && (
          <QuestionDisplay compact question={session.questionContext} />
        )}
      </div>
    </motion.div>
  )
}
