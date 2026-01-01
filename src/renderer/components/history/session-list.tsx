import { useState, useMemo, useEffect } from 'react'
import { ChevronDown, Clock, Folder, Trash2, Play } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from 'renderer/components/ui/scroll-area'
import { Button } from 'renderer/components/ui/button'
import { AgentIcon } from 'renderer/components/ui/icons'
import { cn } from 'renderer/lib/utils'
import { durations } from 'renderer/lib/motion'
import type { HistorySession } from 'shared/history-types'

interface SessionListProps {
  sessions: HistorySession[]
  selectedSessionId: string | null
  keyboardSelectedIndex?: number
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onReplaySession?: (sessionId: string) => void
  isLoading: boolean
  groupByFolder?: boolean
  // External folder state control (optional - for keyboard navigation)
  expandedFolders?: Set<string>
  onToggleFolder?: (projectRoot: string) => void
  // Highlight folder when navigating with keyboard
  highlightedFolderRoot?: string | null
}

interface FolderGroupData {
  projectRoot: string
  projectName: string
  sessions: HistorySession[]
}

// Color palette for folders (hash-based)
const FOLDER_COLORS = [
  { border: 'border-l-emerald-500', text: 'text-emerald-400' },
  { border: 'border-l-violet-500', text: 'text-violet-400' },
  { border: 'border-l-amber-500', text: 'text-amber-400' },
  { border: 'border-l-rose-500', text: 'text-rose-400' },
  { border: 'border-l-sky-500', text: 'text-sky-400' },
  { border: 'border-l-lime-500', text: 'text-lime-400' },
  { border: 'border-l-fuchsia-500', text: 'text-fuchsia-400' },
  { border: 'border-l-teal-500', text: 'text-teal-400' },
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

export function SessionList({
  sessions,
  selectedSessionId,
  keyboardSelectedIndex,
  onSelectSession,
  onDeleteSession,
  onReplaySession,
  isLoading,
  groupByFolder = true,
  expandedFolders: externalExpandedFolders,
  onToggleFolder: externalToggleFolder,
  highlightedFolderRoot,
}: SessionListProps) {
  // Use external state if provided, otherwise use internal state
  const [internalExpandedFolders, setInternalExpandedFolders] = useState<
    Set<string>
  >(new Set())
  const expandedFolders = externalExpandedFolders ?? internalExpandedFolders

  // Group sessions by folder
  const { folderGroups, ungroupedSessions, selectedFolderRoot } =
    useMemo(() => {
      if (!groupByFolder) {
        return {
          folderGroups: [],
          ungroupedSessions: sessions,
          selectedFolderRoot: null,
        }
      }

      const folders = new Map<
        string,
        { projectName: string; sessions: HistorySession[] }
      >()
      const ungrouped: HistorySession[] = []
      let folderWithSelected: string | null = null

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
          // Track which folder contains the selected session
          if (selectedSessionId && session.id === selectedSessionId) {
            folderWithSelected = session.projectRoot
          }
        } else {
          ungrouped.push(session)
        }
      }

      // Sort folders chronologically (most recent activity at bottom)
      // Sessions within each folder are sorted oldest-first
      const sortedFolders: FolderGroupData[] = Array.from(folders.entries())
        .map(([projectRoot, data]) => ({
          projectRoot,
          projectName: data.projectName,
          sessions: data.sessions.sort((a, b) => a.startedAt - b.startedAt),
        }))
        .sort((a, b) => {
          // Sort by most recent session in each folder (newest folder at bottom)
          const maxA = Math.max(...a.sessions.map(s => s.startedAt))
          const maxB = Math.max(...b.sessions.map(s => s.startedAt))
          return maxA - maxB
        })

      return {
        folderGroups: sortedFolders,
        ungroupedSessions: ungrouped,
        selectedFolderRoot: folderWithSelected,
      }
    }, [sessions, groupByFolder, selectedSessionId])

  // Auto-expand folder containing selected session only when selection changes
  // Note: intentionally not including expandedFolders in deps to allow manual folding
  useEffect(() => {
    if (selectedFolderRoot) {
      if (externalToggleFolder) {
        // External control - let parent handle auto-expand
        if (!expandedFolders.has(selectedFolderRoot)) {
          externalToggleFolder(selectedFolderRoot)
        }
      } else {
        // Internal control
        setInternalExpandedFolders(prev => {
          if (prev.has(selectedFolderRoot)) return prev
          return new Set([...prev, selectedFolderRoot])
        })
      }
    }
  }, [selectedFolderRoot, externalToggleFolder, expandedFolders])

  const toggleFolder = (projectRoot: string) => {
    if (externalToggleFolder) {
      externalToggleFolder(projectRoot)
    } else {
      setInternalExpandedFolders(prev => {
        const next = new Set(prev)
        if (next.has(projectRoot)) {
          next.delete(projectRoot)
        } else {
          next.add(projectRoot)
        }
        return next
      })
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    // Today
    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })
    }

    // This week
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    }

    // Older
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  }

  const formatDuration = (ms: number | null) => {
    if (ms === null) return 'ongoing'
    if (ms < 1000) return '<1s'
    if (ms < 60000) return `${Math.round(ms / 1000)}s`
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`
    return `${(ms / 3600000).toFixed(1)}h`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center p-4">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No history yet</p>
          <p className="text-xs mt-1 opacity-60">
            Sessions will appear here after you use Claude
          </p>
        </div>
      </div>
    )
  }

  const renderSessionItem = (session: HistorySession, index: number) => {
    const isKeyboardSelected = keyboardSelectedIndex === index
    const isSelected = selectedSessionId === session.id
    return (
      // biome-ignore lint/a11y/useSemanticElements: Using div for complex card layout
      <div
        className={cn(
          'group relative p-3 rounded-lg cursor-pointer transition-colors overflow-hidden min-w-0',
          'hover:bg-accent/50',
          isSelected && 'bg-accent',
          isKeyboardSelected &&
            'ring-2 ring-primary ring-offset-1 ring-offset-background'
        )}
        key={session.id}
        onClick={() => onSelectSession(session.id)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            onSelectSession(session.id)
          }
        }}
        role="button"
        tabIndex={0}
      >
        {/* Header: Title + Agent */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <AgentIcon
              agent={session.agent}
              className="flex-shrink-0 mt-0.5"
              showBackground
              size="sm"
            />
            <span
              className={cn(
                'font-medium text-sm line-clamp-2 min-w-0',
                isSelected && 'text-white'
              )}
            >
              {session.displayTitle || session.id.slice(0, 8)}
            </span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {onReplaySession && (
              <Button
                className={cn(
                  'h-7 w-7 transition-all',
                  'opacity-60 group-hover:opacity-100',
                  'hover:bg-primary/20',
                  isSelected && 'opacity-100'
                )}
                onClick={e => {
                  e.stopPropagation()
                  onReplaySession(session.id)
                }}
                size="icon"
                title="Replay session"
                variant="ghost"
              >
                <Play
                  className={cn(
                    'w-3.5 h-3.5 transition-colors',
                    isSelected
                      ? 'text-white/80 hover:text-white'
                      : 'text-muted-foreground hover:text-primary'
                  )}
                />
              </Button>
            )}
            <Button
              className={cn(
                'h-7 w-7 transition-all',
                'opacity-60 group-hover:opacity-100',
                'hover:bg-destructive/20',
                isSelected && 'opacity-100'
              )}
              onClick={e => {
                e.stopPropagation()
                onDeleteSession(session.id)
              }}
              size="icon"
              title="Delete session"
              variant="ghost"
            >
              <Trash2
                className={cn(
                  'w-3.5 h-3.5 transition-colors',
                  isSelected
                    ? 'text-white/80 hover:text-red-300'
                    : 'text-muted-foreground hover:text-destructive'
                )}
              />
            </Button>
          </div>
        </div>

        {/* Path */}
        <div
          className={cn(
            'flex items-center gap-1 text-xs mb-1',
            isSelected ? 'text-white/70' : 'text-muted-foreground'
          )}
        >
          <Folder className="w-3 h-3 flex-shrink-0" />
          <span className="block truncate w-0 flex-1">{session.cwd}</span>
        </div>

        {/* Footer: Time + Duration */}
        <div
          className={cn(
            'flex items-center justify-between text-xs',
            isSelected ? 'text-white/70' : 'text-muted-foreground'
          )}
        >
          <span>{formatDate(session.startedAt)}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(session.durationMs)}
          </span>
        </div>

        {/* Active session indicator - only show green dot for ongoing sessions */}
        {session.isInTmux && session.endedAt === null && (
          <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-green-500" />
        )}
      </div>
    )
  }

  const hasFolderGroups = folderGroups.length > 0

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-2 w-full overflow-hidden">
        {/* Folder groups */}
        {hasFolderGroups &&
          folderGroups.map(folder => {
            const colorScheme =
              FOLDER_COLORS[
                hashString(folder.projectName) % FOLDER_COLORS.length
              ]
            const isExpanded = expandedFolders.has(folder.projectRoot)
            // Highlight folder when it's selected and collapsed
            const isFolderHighlighted =
              highlightedFolderRoot === folder.projectRoot && !isExpanded

            return (
              <div
                className={cn(
                  'border-l-2 rounded-lg overflow-hidden min-w-0 transition-all',
                  isFolderHighlighted
                    ? 'border-l-primary ring-2 ring-primary ring-offset-1 ring-offset-background'
                    : colorScheme.border
                )}
                key={folder.projectRoot}
              >
                {/* Folder header */}
                <button
                  className={cn(
                    'w-full flex items-center justify-between p-2 transition-colors',
                    isFolderHighlighted
                      ? 'bg-primary/10'
                      : 'bg-muted/30 hover:bg-muted/50'
                  )}
                  onClick={() => toggleFolder(folder.projectRoot)}
                  type="button"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <motion.div
                      animate={{ rotate: isExpanded ? 0 : -90 }}
                      transition={{ duration: durations.fast }}
                    >
                      <ChevronDown
                        className={cn(
                          'w-4 h-4',
                          isFolderHighlighted
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        )}
                      />
                    </motion.div>
                    <Folder
                      className={cn(
                        'w-4 h-4',
                        isFolderHighlighted ? 'text-primary' : colorScheme.text
                      )}
                    />
                    <span
                      className={cn(
                        'font-medium text-sm',
                        isFolderHighlighted ? 'text-primary' : colorScheme.text
                      )}
                    >
                      {folder.projectName}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'text-xs',
                      isFolderHighlighted
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    )}
                  >
                    {folder.sessions.length}
                  </span>
                </button>

                {/* Folder content */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      animate={{ height: 'auto', opacity: 1 }}
                      className="overflow-hidden"
                      exit={{ height: 0, opacity: 0 }}
                      initial={{ height: 0, opacity: 0 }}
                      transition={{ duration: durations.normal }}
                    >
                      <div className="p-1 space-y-1 min-w-0">
                        {folder.sessions.map((session, _idx) =>
                          renderSessionItem(session, sessions.indexOf(session))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}

        {/* Ungrouped sessions */}
        {ungroupedSessions.length > 0 && (
          <div className="space-y-1">
            {hasFolderGroups && (
              <div className="text-xs text-muted-foreground px-2 pt-2">
                Other Sessions
              </div>
            )}
            {ungroupedSessions.map(session =>
              renderSessionItem(session, sessions.indexOf(session))
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
