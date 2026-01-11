import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Search,
  Calendar,
  Clock,
  Lightbulb,
  ArrowLeft,
  ChevronDown,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from 'renderer/components/ui/button'
import { Input } from 'renderer/components/ui/input'
import { SubTabs, type SubTab } from 'renderer/components/ui/sub-tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'renderer/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'renderer/components/ui/dropdown-menu'
import { AgentIcon } from 'renderer/components/ui/icons'
import { SessionList } from './session-list'
import { ConversationViewer } from './conversation-viewer'
import { PromptInsights } from './prompt-insights'
import { ReplayDialog } from './replay'
import { useScopedShortcuts } from 'renderer/lib/keyboard'
import { cn } from 'renderer/lib/utils'
import type {
  HistorySession,
  QueryOptions,
  SearchFilters,
} from 'shared/history-types'
import type { AgentType } from 'shared/hook-types'
import type { HistoryViewMode } from 'shared/ui-types'
import { devLog } from 'renderer/lib/logger'

// Date filter options - using relative days for predictable behavior
type DateFilterOption = 'all' | 'today' | 'last7days' | 'last30days'

const DATE_FILTER_LABELS: Record<DateFilterOption, string> = {
  all: 'All Time',
  today: 'Today',
  last7days: 'Last 7 days',
  last30days: 'Last 30 days',
}

function getDateRange(
  option: DateFilterOption
): { start: number; end: number } | undefined {
  if (option === 'all') return undefined

  const now = new Date()
  const end = now.getTime()
  let start: number

  switch (option) {
    case 'today': {
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      )
      start = startOfDay.getTime()
      break
    }
    case 'last7days': {
      const sevenDaysAgo = new Date(now)
      sevenDaysAgo.setDate(now.getDate() - 7)
      sevenDaysAgo.setHours(0, 0, 0, 0)
      start = sevenDaysAgo.getTime()
      break
    }
    case 'last30days': {
      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(now.getDate() - 30)
      thirtyDaysAgo.setHours(0, 0, 0, 0)
      start = thirtyDaysAgo.getTime()
      break
    }
    default:
      return undefined
  }

  return { start, end }
}

const { App } = window

// All available agents
const ALL_AGENTS: AgentType[] = ['claude', 'cursor', 'gemini']

// Agent-specific button styles when selected
const AGENT_BUTTON_STYLES: Record<AgentType, string> = {
  claude:
    'bg-orange-500/15 text-orange-600 dark:text-orange-400 hover:bg-orange-500/25',
  cursor:
    'bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25',
  gemini:
    'bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25',
}

// History sub-tabs
const HISTORY_TABS: SubTab<HistoryViewMode>[] = [
  { id: 'sessions', label: 'Sessions', icon: Clock },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
]

export function HistoryView() {
  const [sessions, setSessions] = useState<HistorySession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  )
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null)
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<
    string | null
  >(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<HistoryViewMode>('sessions')
  const [error, setError] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Track 'g' key for gg sequence (same as dashboard)
  const lastKeyRef = useRef<{ key: string; time: number } | null>(null)

  // Filter states
  const [selectedAgents, setSelectedAgents] = useState<Set<AgentType>>(
    new Set(ALL_AGENTS)
  )
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all')

  // Folder expansion state (for keyboard navigation)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Build filters from current state
  const buildFilters = useCallback((): SearchFilters | undefined => {
    const filters: SearchFilters = {}

    // Agent filter - only add if not all agents selected
    if (selectedAgents.size < ALL_AGENTS.length && selectedAgents.size > 0) {
      filters.agents = Array.from(selectedAgents)
    }

    // Date filter
    const dateRange = getDateRange(dateFilter)
    if (dateRange) {
      filters.dateRange = dateRange
    }

    // Return undefined if no filters applied
    return Object.keys(filters).length > 0 ? filters : undefined
  }, [selectedAgents, dateFilter])

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return selectedAgents.size < ALL_AGENTS.length || dateFilter !== 'all'
  }, [selectedAgents, dateFilter])

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSelectedAgents(new Set(ALL_AGENTS))
    setDateFilter('all')
  }, [])

  // Toggle agent filter
  const toggleAgent = useCallback((agent: AgentType) => {
    setSelectedAgents(prev => {
      const next = new Set(prev)
      if (next.has(agent)) {
        // Don't allow deselecting all agents
        if (next.size > 1) {
          next.delete(agent)
        }
      } else {
        next.add(agent)
      }
      return next
    })
  }, [])

  // Load sessions
  const loadSessions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const filters = buildFilters()
      const options: QueryOptions = {
        filters,
        sort: { field: 'startedAt', order: 'asc' },
        pagination: { limit: 100, offset: 0 },
      }
      const result = await App.history.getSessions(options)
      setSessions(result)
    } catch (err) {
      devLog.error('Failed to load history sessions:', err)
      setError('Failed to load sessions')
    } finally {
      setIsLoading(false)
    }
  }, [buildFilters])

  useEffect(() => {
    loadSessions()

    // Subscribe to claude session events for real-time updates
    const unsubscribe = App.claudeSessions.onEvent(event => {
      if (event.type === 'add' || event.type === 'remove') {
        // Debounce to avoid excessive reloads
        setTimeout(() => {
          loadSessions()
        }, 500)
      }
    })

    return () => unsubscribe()
  }, [loadSessions])

  // Search sessions
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadSessions()
      return
    }

    setIsLoading(true)
    try {
      const results = await App.history.search(
        searchQuery.trim(),
        undefined,
        50
      )
      // Convert search results to sessions
      const uniqueSessions = new Map<string, HistorySession>()
      for (const result of results) {
        if (!uniqueSessions.has(result.sessionId)) {
          uniqueSessions.set(result.sessionId, result.session)
        }
      }
      setSessions(Array.from(uniqueSessions.values()))
    } catch (error) {
      devLog.error('Failed to search:', error)
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, loadSessions])

  // Handle search on enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // Compute display order matching SessionList's grouping/sorting logic
  const displayOrder = useMemo(() => {
    // Group sessions by folder (same logic as SessionList)
    const folders = new Map<
      string,
      {
        projectName: string
        sessions: { session: HistorySession; originalIndex: number }[]
      }
    >()
    const ungrouped: { session: HistorySession; originalIndex: number }[] = []

    sessions.forEach((session, index) => {
      if (session.projectRoot && session.projectName) {
        const existing = folders.get(session.projectRoot)
        if (existing) {
          existing.sessions.push({ session, originalIndex: index })
        } else {
          folders.set(session.projectRoot, {
            projectName: session.projectName,
            sessions: [{ session, originalIndex: index }],
          })
        }
      } else {
        ungrouped.push({ session, originalIndex: index })
      }
    })

    // Sort folders and sessions within folders (same as SessionList)
    const sortedFolders = Array.from(folders.entries())
      .map(([projectRoot, data]) => ({
        projectRoot,
        projectName: data.projectName,
        sessions: data.sessions.sort(
          (a, b) => a.session.startedAt - b.session.startedAt
        ),
      }))
      .sort((a, b) => {
        const maxA = Math.max(...a.sessions.map(s => s.session.startedAt))
        const maxB = Math.max(...b.sessions.map(s => s.session.startedAt))
        return maxA - maxB
      })

    // Build display order: folders first, then ungrouped
    const order: { originalIndex: number; projectRoot: string | null }[] = []

    for (const folder of sortedFolders) {
      for (const item of folder.sessions) {
        order.push({
          originalIndex: item.originalIndex,
          projectRoot: folder.projectRoot,
        })
      }
    }

    for (const item of ungrouped) {
      order.push({ originalIndex: item.originalIndex, projectRoot: null })
    }

    return order
  }, [sessions])

  // Compute visible indices based on display order and expanded folders
  const visibleIndices = useMemo(() => {
    const indices: number[] = []
    const seenFolders = new Set<string>()

    for (const item of displayOrder) {
      const folder = item.projectRoot
      if (folder) {
        if (expandedFolders.has(folder)) {
          // Folder is expanded - show all sessions
          indices.push(item.originalIndex)
        } else {
          // Folder is collapsed - only show first session of each folder
          if (!seenFolders.has(folder)) {
            seenFolders.add(folder)
            indices.push(item.originalIndex)
          }
        }
      } else {
        // Ungrouped session - always visible
        indices.push(item.originalIndex)
      }
    }

    return indices
  }, [displayOrder, expandedFolders])

  // Keep selectedIndex in bounds of visible indices
  useEffect(() => {
    if (visibleIndices.length === 0) {
      setSelectedIndex(0)
    } else if (!visibleIndices.includes(selectedIndex)) {
      // Find nearest visible index
      const nearestVisible = visibleIndices.reduce((nearest, idx) =>
        Math.abs(idx - selectedIndex) < Math.abs(nearest - selectedIndex)
          ? idx
          : nearest
      )
      setSelectedIndex(nearestVisible)
    }
  }, [visibleIndices, selectedIndex])

  // Keyboard navigation handlers - navigate through visible indices only
  const selectNext = useCallback(() => {
    if (visibleIndices.length === 0) return
    const currentVisibleIdx = visibleIndices.indexOf(selectedIndex)
    let nextIndex: number
    if (currentVisibleIdx === -1) {
      // Not on a visible index, go to first visible
      nextIndex = visibleIndices[0]
    } else if (currentVisibleIdx < visibleIndices.length - 1) {
      nextIndex = visibleIndices[currentVisibleIdx + 1]
    } else {
      return // Already at the end
    }
    setSelectedIndex(nextIndex)
    // If conversation viewer is open, also update the selected session
    if (selectedSessionId && sessions[nextIndex]) {
      setSelectedSessionId(sessions[nextIndex].id)
    }
  }, [visibleIndices, selectedIndex, selectedSessionId, sessions])

  const selectPrev = useCallback(() => {
    if (visibleIndices.length === 0) return
    const currentVisibleIdx = visibleIndices.indexOf(selectedIndex)
    let prevIndex: number
    if (currentVisibleIdx === -1) {
      // Not on a visible index, go to first visible
      prevIndex = visibleIndices[0]
    } else if (currentVisibleIdx > 0) {
      prevIndex = visibleIndices[currentVisibleIdx - 1]
    } else {
      return // Already at the beginning
    }
    setSelectedIndex(prevIndex)
    // If conversation viewer is open, also update the selected session
    if (selectedSessionId && sessions[prevIndex]) {
      setSelectedSessionId(sessions[prevIndex].id)
    }
  }, [visibleIndices, selectedIndex, selectedSessionId, sessions])

  const selectFirst = useCallback(() => {
    if (visibleIndices.length > 0) {
      const firstIndex = visibleIndices[0]
      setSelectedIndex(firstIndex)
      if (selectedSessionId && sessions[firstIndex]) {
        setSelectedSessionId(sessions[firstIndex].id)
      }
    }
  }, [visibleIndices, selectedSessionId, sessions])

  // Handle gg sequence (first session) - same as dashboard
  const handleGKey = useCallback(() => {
    const now = Date.now()
    if (
      lastKeyRef.current?.key === 'g' &&
      now - lastKeyRef.current.time < 500
    ) {
      // gg detected
      selectFirst()
      lastKeyRef.current = null
    } else {
      lastKeyRef.current = { key: 'g', time: now }
    }
  }, [selectFirst])

  const selectLast = useCallback(() => {
    if (visibleIndices.length > 0) {
      const lastIndex = visibleIndices[visibleIndices.length - 1]
      setSelectedIndex(lastIndex)
      if (selectedSessionId && sessions[lastIndex]) {
        setSelectedSessionId(sessions[lastIndex].id)
      }
    }
  }, [visibleIndices, selectedSessionId, sessions])

  const openSelected = useCallback(() => {
    if (sessions[selectedIndex]) {
      setSelectedSessionId(sessions[selectedIndex].id)
    }
  }, [sessions, selectedIndex])

  const closeConversation = useCallback(() => {
    setSelectedSessionId(null)
  }, [])

  // Get current selected session's project root
  const currentProjectRoot = useMemo(() => {
    const session = sessions[selectedIndex]
    return session?.projectRoot ?? null
  }, [sessions, selectedIndex])

  // Toggle folder expansion
  const toggleFolder = useCallback((projectRoot: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(projectRoot)) {
        next.delete(projectRoot)
      } else {
        next.add(projectRoot)
      }
      return next
    })
  }, [])

  // Expand current folder (l key)
  const expandCurrentFolder = useCallback(() => {
    if (currentProjectRoot && !expandedFolders.has(currentProjectRoot)) {
      setExpandedFolders(prev => new Set([...prev, currentProjectRoot]))
    }
  }, [currentProjectRoot, expandedFolders])

  // Collapse current folder (h key)
  const collapseCurrentFolder = useCallback(() => {
    if (currentProjectRoot && expandedFolders.has(currentProjectRoot)) {
      setExpandedFolders(prev => {
        const next = new Set(prev)
        next.delete(currentProjectRoot)
        return next
      })
    }
  }, [currentProjectRoot, expandedFolders])

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus()
  }, [])

  const cycleViewMode = useCallback(() => {
    const modes: HistoryViewMode[] = ['sessions', 'insights']
    const currentIdx = modes.indexOf(viewMode)
    setViewMode(modes[(currentIdx + 1) % modes.length])
  }, [viewMode])

  const cycleViewModeReverse = useCallback(() => {
    const modes: HistoryViewMode[] = ['sessions', 'insights']
    const currentIdx = modes.indexOf(viewMode)
    setViewMode(modes[(currentIdx - 1 + modes.length) % modes.length])
  }, [viewMode])

  // Register keyboard shortcuts
  useScopedShortcuts(
    'history',
    useMemo(
      () => [
        {
          id: 'history.next',
          key: 'j',
          action: selectNext,
          description: 'Next session',
          category: 'list' as const,
        },
        {
          id: 'history.nextArrow',
          key: 'ArrowDown',
          action: selectNext,
          description: 'Next session',
          category: 'list' as const,
        },
        {
          id: 'history.prev',
          key: 'k',
          action: selectPrev,
          description: 'Previous session',
          category: 'list' as const,
        },
        {
          id: 'history.prevArrow',
          key: 'ArrowUp',
          action: selectPrev,
          description: 'Previous session',
          category: 'list' as const,
        },
        {
          id: 'history.first',
          key: 'g',
          action: handleGKey,
          description: 'First session',
          category: 'list' as const,
          displayKey: 'gg',
        },
        {
          id: 'history.last',
          key: 'G',
          action: selectLast,
          description: 'Last session',
          category: 'list' as const,
        },
        {
          id: 'history.open',
          key: 'Enter',
          action: openSelected,
          description: 'Open conversation',
          category: 'actions' as const,
          when: () => !selectedSessionId,
        },
        {
          id: 'history.escape',
          key: 'Escape',
          action: closeConversation,
          description: 'Close conversation',
          category: 'actions' as const,
          when: () => !!selectedSessionId,
        },
        {
          id: 'history.expandFolder',
          key: 'l',
          action: expandCurrentFolder,
          description: 'Expand folder',
          category: 'list' as const,
        },
        {
          id: 'history.collapseFolder',
          key: 'h',
          action: collapseCurrentFolder,
          description: 'Collapse folder',
          category: 'list' as const,
        },
        {
          id: 'history.search',
          key: '/',
          action: focusSearch,
          description: 'Focus search',
          category: 'actions' as const,
        },
        {
          id: 'history.tab',
          key: 'Tab',
          action: cycleViewMode,
          description: 'Next tab',
          category: 'navigation' as const,
        },
        {
          id: 'history.tabReverse',
          key: 'Tab',
          modifiers: ['shift'],
          action: cycleViewModeReverse,
          description: 'Previous tab',
          category: 'navigation' as const,
          displayKey: 'Shift+Tab',
        },
        {
          id: 'history.focus',
          key: 'f',
          action: openSelected,
          description: 'Open conversation',
          category: 'actions' as const,
          when: () => !selectedSessionId,
        },
      ],
      [
        selectNext,
        selectPrev,
        handleGKey,
        selectLast,
        openSelected,
        closeConversation,
        expandCurrentFolder,
        collapseCurrentFolder,
        focusSearch,
        cycleViewMode,
        cycleViewModeReverse,
        selectedSessionId,
      ]
    )
  )

  // Open delete confirmation dialog
  const handleDeleteSession = useCallback((sessionId: string) => {
    setDeleteConfirmSessionId(sessionId)
  }, [])

  // Confirm and execute delete
  const confirmDeleteSession = useCallback(async () => {
    if (!deleteConfirmSessionId) return

    try {
      await App.history.deleteSession(deleteConfirmSessionId)
      setSessions(prev => prev.filter(s => s.id !== deleteConfirmSessionId))
      if (selectedSessionId === deleteConfirmSessionId) {
        setSelectedSessionId(null)
      }
      toast.success('Session deleted')
    } catch (error) {
      devLog.error('Failed to delete session:', error)
      toast.error('Failed to delete session')
    } finally {
      setDeleteConfirmSessionId(null)
    }
  }, [deleteConfirmSessionId, selectedSessionId])

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="border-b px-4 py-2">
        <SubTabs
          layoutId="historySubTabs"
          onChange={setViewMode}
          tabs={HISTORY_TABS}
          value={viewMode}
        />
      </div>

      {/* Search & Filters - Only show in sessions view */}
      {viewMode === 'sessions' && (
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Filter conversations... (/)"
                ref={searchInputRef}
                value={searchQuery}
              />
            </div>
            <Button
              disabled={isLoading}
              onClick={handleSearch}
              size="icon"
              variant="outline"
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Agent Filter */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Agent:</span>
              {ALL_AGENTS.map(agent => (
                <Button
                  className={cn(
                    'h-7 px-2 gap-1.5',
                    selectedAgents.has(agent)
                      ? AGENT_BUTTON_STYLES[agent]
                      : 'opacity-40 hover:opacity-70'
                  )}
                  key={agent}
                  onClick={() => toggleAgent(agent)}
                  size="sm"
                  variant="ghost"
                >
                  <AgentIcon agent={agent} size={12} />
                  <span className="text-xs capitalize">{agent}</span>
                </Button>
              ))}
            </div>

            <div className="w-px h-4 bg-border" />

            {/* Date Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-7 gap-1.5" size="sm" variant="ghost">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="text-xs">
                    {DATE_FILTER_LABELS[dateFilter]}
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(Object.keys(DATE_FILTER_LABELS) as DateFilterOption[]).map(
                  option => (
                    <DropdownMenuItem
                      key={option}
                      onClick={() => setDateFilter(option)}
                    >
                      <span
                        className={cn(dateFilter === option && 'font-medium')}
                      >
                        {DATE_FILTER_LABELS[option]}
                      </span>
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button
                className="h-7 gap-1 text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
                size="sm"
                variant="ghost"
              >
                <X className="w-3 h-3" />
                <span className="text-xs">Clear</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {viewMode === 'sessions' && (
          <>
            {/* Session List - hidden on mobile when session selected */}
            <div
              className={`
              w-full md:w-80 border-r h-full min-h-0 overflow-hidden
              ${selectedSessionId ? 'hidden md:block' : 'block'}
            `}
            >
              {error ? (
                <div className="flex items-center justify-center h-full p-4">
                  <div className="text-center">
                    <p className="text-destructive text-sm mb-2">{error}</p>
                    <Button onClick={loadSessions} size="sm" variant="outline">
                      Retry
                    </Button>
                  </div>
                </div>
              ) : (
                <SessionList
                  expandedFolders={expandedFolders}
                  highlightedFolderRoot={currentProjectRoot}
                  isLoading={isLoading}
                  keyboardSelectedIndex={selectedIndex}
                  onDeleteSession={handleDeleteSession}
                  onReplaySession={setReplaySessionId}
                  onSelectSession={setSelectedSessionId}
                  onToggleFolder={toggleFolder}
                  selectedSessionId={selectedSessionId}
                  sessions={sessions}
                />
              )}
            </div>

            {/* Conversation Viewer - full width on mobile */}
            <div
              className={`
              flex-1 h-full min-h-0
              ${selectedSessionId ? 'block' : 'hidden md:block'}
            `}
            >
              {selectedSessionId ? (
                <div className="flex flex-col h-full">
                  {/* Mobile back button */}
                  <div className="md:hidden border-b p-2">
                    <Button
                      className="gap-2"
                      onClick={() => setSelectedSessionId(null)}
                      size="sm"
                      variant="ghost"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to sessions
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <ConversationViewer
                      onDelete={handleDeleteSession}
                      onReplay={setReplaySessionId}
                      sessionId={selectedSessionId}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Select a session to view conversation</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {viewMode === 'insights' && (
          <div className="flex-1 h-full min-h-0 overflow-auto">
            <PromptInsights />
          </div>
        )}
      </div>

      {/* Replay Dialog */}
      {replaySessionId && (
        <ReplayDialog
          onOpenChange={open => !open && setReplaySessionId(null)}
          open={!!replaySessionId}
          sessionId={replaySessionId}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        onOpenChange={open => !open && setDeleteConfirmSessionId(null)}
        open={!!deleteConfirmSessionId}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                This will remove the session from Plexus history.
              </span>
              <span className="block text-muted-foreground text-xs">
                The original conversation in your agent will not be affected.
                You can restore it later using Re-sync in Analytics &gt;
                Statistics &gt; Database.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteSession}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
