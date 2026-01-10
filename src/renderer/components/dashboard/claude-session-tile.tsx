import { useMemo, useCallback, useState, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { AgentIcon } from '../ui/icons'
import { STATUS_CONFIG } from '../ui/icons/status-icon'
import {
  MoreVertical,
  Square,
  Trash2,
  AlertTriangle,
  Folder,
  Wrench,
  ExternalLink,
  GitBranch,
  Check,
  X,
  MessageCircleQuestion,
  Coins,
  ChevronDown,
  Timer,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu'
import { cardVariants, collapseVariants } from 'renderer/lib/motion-variants'
import { springs } from 'renderer/lib/motion'
import { cn } from 'renderer/lib/utils'
import type { ClaudeSession } from 'shared/hook-types'
import type { SessionCost } from 'shared/cost-types'

const { App } = window

interface ClaudeSessionTileProps {
  session: ClaudeSession
  isSelected: boolean
  isKeyboardSelected?: boolean
  onClick: () => void
}

function formatElapsedTime(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

// Format CWD relative to project root with project name
function formatRelativePath(
  cwd: string,
  projectRoot?: string,
  projectName?: string
): string {
  if (projectRoot && cwd.startsWith(projectRoot)) {
    const relative = cwd.slice(projectRoot.length).replace(/^\//, '')
    const name = projectName || projectRoot.split('/').pop() || ''
    // At project root: show project name only
    // In subdirectory: show project/relative/path
    return relative ? `${name}/${relative}` : name
  }
  // Fallback: show last 2 path segments
  const parts = cwd.split('/')
  if (parts.length > 2) {
    return `…/${parts.slice(-2).join('/')}`
  }
  return cwd
}

// Format full path with ~ for home directory (for tooltip)
function formatFullPath(cwd: string): string {
  const home = process.env.HOME || ''
  if (home && cwd.startsWith(home)) {
    return `~${cwd.slice(home.length)}`
  }
  return cwd
}

// Truncate git branch name for display
function formatBranch(branch: string, maxLength = 16): string {
  if (branch.length <= maxLength) return branch
  return `${branch.slice(0, maxLength - 1)}…`
}

// Format cost for display
function formatCost(costUsd: number): string {
  if (costUsd < 0.01) return '<$0.01'
  if (costUsd < 1) return `$${costUsd.toFixed(2)}`
  return `$${costUsd.toFixed(2)}`
}

// Truncate question text for inline display
function truncateQuestion(question: string, maxLength = 60): string {
  if (question.length <= maxLength) return question
  return `${question.slice(0, maxLength - 1)}…`
}

// Get status border color (left border)
function getStatusBorderColor(phase: ClaudeSession['phase']): string {
  switch (phase) {
    case 'waitingForApproval':
      return 'border-l-status-approval'
    case 'waitingForInput':
      return 'border-l-status-active'
    case 'processing':
      return 'border-l-status-thinking'
    case 'compacting':
      return 'border-l-status-thinking'
    case 'idle':
      return 'border-l-status-idle'
    case 'ended':
      return 'border-l-muted-foreground/30'
    default:
      return 'border-l-status-idle'
  }
}

// Get status border animation class
function getStatusBorderAnimation(phase: ClaudeSession['phase']): string {
  switch (phase) {
    case 'waitingForApproval':
      return 'animate-border-pulse-approval'
    case 'processing':
    case 'compacting':
      return 'animate-border-pulse-thinking'
    default:
      return ''
  }
}

export const ClaudeSessionTile = memo(function ClaudeSessionTile({
  session,
  isSelected,
  isKeyboardSelected = false,
  onClick,
}: ClaudeSessionTileProps) {
  const [showTerminateDialog, setShowTerminateDialog] = useState(false)
  const [, setTick] = useState(0)
  const [sessionCost, setSessionCost] = useState<SessionCost | null>(null)
  const [isPermissionLoading, setIsPermissionLoading] = useState<string | null>(
    null
  )

  const statusConfig = STATUS_CONFIG[session.phase]
  const isEnded = session.phase === 'ended'
  const hasPermission =
    session.phase === 'waitingForApproval' && session.activePermission
  const hasQuestion =
    session.phase === 'waitingForInput' && session.questionContext

  // Update elapsed time every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000)
    return () => clearInterval(interval)
  }, [])

  // Fetch session cost periodically (every 30 seconds or when session ends)
  useEffect(() => {
    const fetchCost = async () => {
      try {
        const cost = await App.cost.getSessionCost(session.id)
        setSessionCost(cost)
      } catch {
        // Ignore errors - cost tracking is optional
      }
    }

    fetchCost()

    // Refresh cost every 30 seconds for active sessions
    if (!isEnded) {
      const interval = setInterval(fetchCost, 30000)
      return () => clearInterval(interval)
    }
  }, [session.id, isEnded])

  // Get display title - prioritize first user prompt for immediate context
  const displayTitle = useMemo(() => {
    // First user prompt takes priority - shows what the session is about
    if (session.firstUserPrompt) {
      return `"${session.firstUserPrompt}"`
    }
    if (session.displayTitle) return session.displayTitle
    if (session.sessionSummary) return session.sessionSummary
    // Fallback to project name or cwd
    return session.projectName || session.cwd.split('/').pop() || session.cwd
  }, [
    session.displayTitle,
    session.sessionSummary,
    session.firstUserPrompt,
    session.projectName,
    session.cwd,
  ])

  const handleTerminate = useCallback(
    async (signal: 'SIGTERM' | 'SIGKILL') => {
      await App.claudeSessions.terminate(session.id, signal)
      setShowTerminateDialog(false)
    },
    [session.id]
  )

  const handleRemove = useCallback(async () => {
    await App.claudeSessions.remove(session.id)
  }, [session.id])

  // Check if we can focus terminal
  const canFocusTerminal = useMemo(() => {
    if (isEnded) return false
    // Has tmux target, or has tty, or cursor agent with cwd
    return (
      (session.isInTmux && session.tmuxTarget) ||
      session.tty ||
      (session.agent === 'cursor' && session.cwd)
    )
  }, [session, isEnded])

  const handleFocusTerminal = useCallback(async () => {
    if (!canFocusTerminal) return
    await App.tmux.focus(session.id)
  }, [session.id, canFocusTerminal])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (canFocusTerminal) {
        handleFocusTerminal()
      }
    },
    [canFocusTerminal, handleFocusTerminal]
  )

  // Permission action handlers
  const handlePermissionAction = useCallback(
    async (
      decision: 'allow' | 'deny' | 'auto-allow-session',
      e?: React.MouseEvent
    ) => {
      e?.stopPropagation()
      setIsPermissionLoading(decision)
      try {
        await App.permissions.respond(session.id, decision)
      } catch (error) {
        console.error('[ClaudeSessionTile] Permission action failed:', error)
      } finally {
        setIsPermissionLoading(null)
      }
    },
    [session.id]
  )

  const handleAllow = useCallback(
    (e: React.MouseEvent) => handlePermissionAction('allow', e),
    [handlePermissionAction]
  )

  const handleDeny = useCallback(
    (e: React.MouseEvent) => handlePermissionAction('deny', e),
    [handlePermissionAction]
  )

  const handleAutoAllow = useCallback(
    (e: React.MouseEvent) => handlePermissionAction('auto-allow-session', e),
    [handlePermissionAction]
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          animate="animate"
          className="relative group"
          exit="exit"
          initial="initial"
          layout
          transition={springs.gentle}
          variants={cardVariants}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: Using div with role="button" to avoid nested button issue with DropdownMenuTrigger */}
          <div
            className={cn(
              'w-full text-left flex flex-col gap-1 px-3 py-2.5 rounded-xl cursor-pointer',
              // Left status border
              'border-l-4',
              getStatusBorderColor(session.phase),
              getStatusBorderAnimation(session.phase),
              // Glass background
              'bg-[var(--glass-bg-2)]',
              'backdrop-blur-lg',
              'border-y border-r border-[var(--glass-border-medium)]',
              // Hover state
              'hover:bg-[var(--glass-bg-3)]',
              'transition-all duration-200',
              // Selected state
              isSelected && 'ring-2 ring-primary/50 bg-[var(--glass-bg-3)]',
              // Keyboard navigation state (different from selected)
              isKeyboardSelected &&
                !isSelected &&
                'ring-1 ring-primary/30 bg-[var(--glass-bg-3)]',
              // Ended state
              isEnded && 'opacity-50 hover:opacity-70'
            )}
            onClick={onClick}
            onDoubleClick={handleDoubleClick}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }}
            role="button"
            tabIndex={0}
          >
            {/* Row 1: Agent + Title + Cost + Time */}
            <div className="flex items-center gap-2">
              {/* Agent icon */}
              <AgentIcon agent={session.agent} className="shrink-0" size="sm" />

              {/* Title */}
              <p className="flex-1 text-sm text-foreground truncate">
                {displayTitle}
              </p>

              {/* Cost indicator (if available) */}
              {sessionCost && sessionCost.costUsd > 0 && (
                <span
                  className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0"
                  title={`Estimated cost: ${formatCost(sessionCost.costUsd)}`}
                >
                  <Coins className="h-3 w-3" />
                  <span className="tabular-nums">
                    {formatCost(sessionCost.costUsd)}
                  </span>
                </span>
              )}

              {/* Time */}
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {formatElapsedTime(session.startedAt)}
              </span>
            </div>

            {/* Row 2: Git Branch + Path + Tool + Status Badge + Menu */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {/* Git Branch (if available) */}
              {session.gitBranch && (
                <span
                  className="flex items-center gap-1 shrink-0 text-primary/70"
                  title={session.gitBranch}
                >
                  <GitBranch className="h-3 w-3" />
                  <span className="font-mono text-xs">
                    {formatBranch(session.gitBranch)}
                  </span>
                </span>
              )}

              {/* Separator */}
              {session.gitBranch && <span className="text-border">·</span>}

              {/* Relative Path with full path tooltip */}
              <span
                className="flex items-center gap-1 truncate min-w-0"
                title={formatFullPath(session.cwd)}
              >
                <Folder className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {formatRelativePath(
                    session.cwd,
                    session.projectRoot,
                    session.projectName
                  )}
                </span>
              </span>

              {/* Tool indicator (icon only to save space) */}
              {session.lastToolName && (
                <>
                  <span className="text-border">·</span>
                  <span
                    className="flex items-center text-primary/70 shrink-0"
                    title={session.lastToolName}
                  >
                    <Wrench className="h-3 w-3" />
                  </span>
                </>
              )}

              {/* Status badge */}
              <span className="text-border">·</span>
              <span
                className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0',
                  statusConfig.bgColor,
                  statusConfig.color
                )}
              >
                {statusConfig.label}
              </span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-5 w-5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={e => e.stopPropagation()}
                    size="icon"
                    variant="ghost"
                  >
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canFocusTerminal && (
                    <DropdownMenuItem
                      onClick={e => {
                        e.stopPropagation()
                        handleFocusTerminal()
                      }}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Focus Terminal
                    </DropdownMenuItem>
                  )}
                  {!isEnded ? (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={e => {
                        e.stopPropagation()
                        setShowTerminateDialog(true)
                      }}
                    >
                      <Square className="h-4 w-4 mr-2" />
                      Terminate Session
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={e => {
                        e.stopPropagation()
                        handleRemove()
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove from List
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Row 3: Inline Permission Actions (when waiting for approval) */}
            <AnimatePresence>
              {hasPermission && (
                <motion.div
                  animate="animate"
                  className="flex items-center gap-2 pt-2 mt-1 border-t border-border/30"
                  exit="exit"
                  initial="initial"
                  variants={collapseVariants}
                >
                  {/* Tool name */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Wrench className="h-3.5 w-3.5 text-status-approval shrink-0" />
                    <span className="text-xs font-medium text-status-approval truncate">
                      {session.activePermission?.toolName}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      className="h-6 px-2 text-xs"
                      disabled={isPermissionLoading !== null}
                      onClick={handleAllow}
                      size="sm"
                      variant="allow"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      {isPermissionLoading === 'allow' ? '...' : 'Allow'}
                    </Button>
                    <Button
                      className="h-6 px-2 text-xs"
                      disabled={isPermissionLoading !== null}
                      onClick={handleDeny}
                      size="sm"
                      variant="deny"
                    >
                      <X className="h-3 w-3 mr-1" />
                      {isPermissionLoading === 'deny' ? '...' : 'Deny'}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          className="h-6 w-6 p-0"
                          disabled={isPermissionLoading !== null}
                          onClick={e => e.stopPropagation()}
                          size="sm"
                          variant="outline"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={e => {
                            e.stopPropagation()
                            handleAutoAllow(e as unknown as React.MouseEvent)
                          }}
                        >
                          <Timer className="h-4 w-4 mr-2" />
                          Auto-allow for session
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Row 3b: Question Display (when waiting for input with question) */}
            <AnimatePresence>
              {hasQuestion && (
                <motion.div
                  animate="animate"
                  className="flex items-center gap-2 pt-2 mt-1 border-t border-border/30"
                  exit="exit"
                  initial="initial"
                  variants={collapseVariants}
                >
                  <MessageCircleQuestion className="h-3.5 w-3.5 text-status-thinking shrink-0" />
                  <span
                    className="text-xs text-muted-foreground italic truncate"
                    title={session.questionContext?.question}
                  >
                    "{truncateQuestion(session.questionContext?.question || '')}
                    "
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </ContextMenuTrigger>

      {/* Context Menu (Right-click) */}
      <ContextMenuContent>
        {canFocusTerminal && (
          <>
            <ContextMenuItem onClick={handleFocusTerminal}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Focus Terminal
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {!isEnded ? (
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowTerminateDialog(true)}
          >
            <Square className="h-4 w-4 mr-2" />
            Terminate Session
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={handleRemove}>
            <Trash2 className="h-4 w-4 mr-2" />
            Remove from List
          </ContextMenuItem>
        )}
      </ContextMenuContent>

      {/* Terminate Confirmation Dialog */}
      <Dialog onOpenChange={setShowTerminateDialog} open={showTerminateDialog}>
        <DialogContent onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Terminate Session
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to terminate this session?
              <br />
              <span className="font-mono text-sm">
                {session.displayTitle} (PID: {session.pid ?? 'N/A'})
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              onClick={() => setShowTerminateDialog(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleTerminate('SIGTERM')}
              variant="secondary"
            >
              Graceful (SIGTERM)
            </Button>
            <Button
              onClick={() => handleTerminate('SIGKILL')}
              variant="destructive"
            >
              Force (SIGKILL)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContextMenu>
  )
})
