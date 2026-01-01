import { useState, useEffect, type MouseEvent } from 'react'
import { motion } from 'framer-motion'
import { HelpCircle, Clock, ChevronRight, ExternalLink } from 'lucide-react'
import { AgentIcon, ToolIcon } from '../ui/icons'
import { STATUS_CONFIG } from '../ui/icons/status-icon'
import { cardVariants } from 'renderer/lib/motion-variants'
import { springs } from 'renderer/lib/motion'
import { cn } from 'renderer/lib/utils'
import type { ClaudeSession, PermissionContext } from 'shared/hook-types'

interface AttentionStatusCardProps {
  session: ClaudeSession
  onFocus: () => void
  /** Callback to jump to the agent's terminal/IDE */
  onJump?: () => void
  /** Whether this card is selected via keyboard navigation */
  isKeyboardSelected?: boolean
}

function formatPath(cwd: string): string {
  const parts = cwd.split('/')
  if (parts.length <= 2) return cwd
  return parts[parts.length - 1]
}

// Format elapsed time compactly
function formatElapsedTime(lastActivity: number): string {
  const seconds = Math.floor((Date.now() - lastActivity) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}

// Get time color based on elapsed duration
function getTimeColor(lastActivity: number): string {
  const seconds = Math.floor((Date.now() - lastActivity) / 1000)
  if (seconds < 60) return 'text-muted-foreground' // < 1min: gray
  if (seconds < 300) return 'text-status-waiting' // < 5min: yellow
  return 'text-status-approval' // > 5min: orange (urgent)
}

// Format tool target from permission context
function formatToolTarget(permission: PermissionContext): string {
  if (!permission.toolInput) return ''

  const input = permission.toolInput
  // Common patterns for file paths
  if (typeof input.file_path === 'string') {
    return input.file_path.split('/').pop() || input.file_path
  }
  if (typeof input.path === 'string') {
    return input.path.split('/').pop() || input.path
  }
  if (typeof input.command === 'string') {
    // Truncate long commands
    const cmd = input.command as string
    return cmd.length > 30 ? `${cmd.slice(0, 30)}...` : cmd
  }
  // For other inputs, show parameter count
  const paramCount = Object.keys(input).length
  return paramCount > 0 ? `${paramCount} params` : ''
}

// Get status border color
function getStatusBorderColor(phase: ClaudeSession['phase']): string {
  switch (phase) {
    case 'waitingForApproval':
      return 'border-l-status-approval'
    case 'waitingForInput':
      return 'border-l-status-active'
    case 'idle':
      return 'border-l-status-idle'
    default:
      return 'border-l-border'
  }
}

export function AttentionStatusCard({
  session,
  onFocus,
  onJump,
  isKeyboardSelected = false,
}: AttentionStatusCardProps) {
  const statusConfig = STATUS_CONFIG[session.phase]
  const needsApproval = session.phase === 'waitingForApproval'
  const hasQuestion =
    session.phase === 'waitingForInput' && !!session.questionContext
  const hasToolInfo = needsApproval && session.activePermission

  // Update elapsed time every 10 seconds
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000)
    return () => clearInterval(interval)
  }, [])

  // Handle jump button click (prevent event propagation)
  const handleJumpClick = (e: MouseEvent) => {
    e.stopPropagation()
    onJump?.()
  }

  const elapsedTime = formatElapsedTime(session.lastActivity)
  const timeColor = getTimeColor(session.lastActivity)
  const title = session.displayTitle || formatPath(session.cwd)

  return (
    <motion.div
      animate="animate"
      className={cn(
        'w-full flex flex-col gap-1.5 p-3 rounded-xl',
        // Glass background - theme-aware
        'bg-[var(--glass-bg-2)]',
        'backdrop-blur-lg',
        // Glass border with status accent on left
        'border border-l-[3px]',
        'border-[var(--glass-border-medium)]',
        getStatusBorderColor(session.phase),
        // Hover - enhanced glass
        'hover:bg-[var(--glass-bg-3)]',
        'transition-all duration-200',
        'text-left cursor-pointer group',
        // Keyboard selected state
        isKeyboardSelected && 'ring-2 ring-primary/50 shadow-lg',
        // Approval state - subtle pulse
        needsApproval && 'animate-pulse-subtle'
      )}
      exit="exit"
      initial="initial"
      layout
      onClick={onFocus}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onFocus()
        }
      }}
      role="button"
      tabIndex={0}
      transition={springs.snappy}
      variants={cardVariants}
      whileHover={{ scale: 1.01, x: 2 }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Row 1: Agent + Title + Jump Button + Elapsed Time */}
      <div className="flex items-center gap-2">
        <AgentIcon agent={session.agent} size="sm" />
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {title}
        </span>
        {/* Jump to agent button - appears on hover */}
        {onJump && (
          <button
            className={cn(
              'p-1 rounded-md shrink-0 cursor-pointer',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-[var(--glass-bg-3)]',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-150'
            )}
            onClick={handleJumpClick}
            title="Jump to agent"
            type="button"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
        <span
          className={cn(
            'flex items-center gap-1 text-xs tabular-nums shrink-0',
            timeColor
          )}
        >
          <Clock className="w-3 h-3" />
          {elapsedTime}
        </span>
      </div>

      {/* Row 2: Tool info / Question / Status */}
      <div className="flex items-center gap-2">
        {/* Tool info for approval state */}
        {hasToolInfo && session.activePermission && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1">
            <ToolIcon
              className="w-3.5 h-3.5 shrink-0 text-status-approval"
              toolName={session.activePermission.toolName}
            />
            <span className="font-medium text-foreground/80">
              {session.activePermission.toolName}
            </span>
            {formatToolTarget(session.activePermission) && (
              <>
                <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                <span className="truncate text-muted-foreground">
                  {formatToolTarget(session.activePermission)}
                </span>
              </>
            )}
          </div>
        )}

        {/* Question for input state */}
        {hasQuestion && session.questionContext && (
          <div className="flex items-center gap-1.5 text-xs min-w-0 flex-1">
            <HelpCircle className="w-3.5 h-3.5 shrink-0 text-status-waiting" />
            <span className="truncate text-muted-foreground">
              {session.questionContext.question}
            </span>
          </div>
        )}

        {/* Idle state - show last action */}
        {!hasToolInfo && !hasQuestion && session.lastToolName && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1">
            <ToolIcon
              className="w-3.5 h-3.5 shrink-0"
              toolName={session.lastToolName}
            />
            <span className="truncate">{session.lastToolName}</span>
          </div>
        )}

        {/* Status badge - always on the right */}
        <span
          className={cn(
            'shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md ml-auto',
            statusConfig.bgColor,
            statusConfig.color
          )}
        >
          {statusConfig.label}
        </span>
      </div>
    </motion.div>
  )
}
