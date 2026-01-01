/**
 * Dashboard Shortcuts Hook
 *
 * Registers global and sessions-specific keyboard shortcuts.
 */

import { useCallback, useMemo, useRef } from 'react'
import {
  useScopedShortcuts,
  useGlobalShortcuts,
  useActiveScope,
  useShortcutContext,
  platformModifier,
} from 'renderer/lib/keyboard'
import { useSidebar } from '../../ui/sidebar'
import { useSessions, useUIStore } from 'renderer/stores'
import { useProjects, filterSessionsByProject } from 'renderer/lib/hooks'
import { sortSessions } from '../claude-sessions-view'

export function useDashboardShortcuts() {
  const sessions = useSessions()

  const viewMode = useUIStore(state => state.viewMode)
  const setViewMode = useUIStore(state => state.setViewMode)
  const selectedProjectId = useUIStore(state => state.selectedProjectId)
  const highlightSession = useUIStore(state => state.highlightSession)

  // Session list navigation
  const selectedSessionIndex = useUIStore(state => state.selectedSessionIndex)
  const setSelectedSessionIndex = useUIStore(
    state => state.setSelectedSessionIndex
  )

  // Project navigation
  const selectNextProject = useUIStore(state => state.selectNextProject)
  const selectPrevProject = useUIStore(state => state.selectPrevProject)
  const selectAllProjects = useUIStore(state => state.selectAllProjects)

  // Get filtered and sorted sessions for the current project
  const filteredSessions = useMemo(
    () => sortSessions(filterSessionsByProject(sessions, selectedProjectId)),
    [sessions, selectedProjectId]
  )

  // Get project IDs for navigation (null = All, then individual projects)
  const projects = useProjects(sessions)
  const projectIds = useMemo(
    () => [null, ...projects.map(p => p.id)] as (string | null)[],
    [projects]
  )

  // Track 'g' key for gg sequence
  const lastKeyRef = useRef<{ key: string; time: number } | null>(null)

  const { toggle: toggleSidebar } = useSidebar()
  const { toggleCheatsheet } = useShortcutContext()

  // Session list navigation handlers (j/k)
  const handleSessionNext = useCallback(() => {
    if (filteredSessions.length === 0) return
    const nextIndex = Math.min(
      selectedSessionIndex + 1,
      filteredSessions.length - 1
    )
    setSelectedSessionIndex(nextIndex)
    const nextSession = filteredSessions[nextIndex]
    if (nextSession) {
      highlightSession(nextSession.id)
    }
  }, [
    filteredSessions,
    selectedSessionIndex,
    setSelectedSessionIndex,
    highlightSession,
  ])

  const handleSessionPrev = useCallback(() => {
    if (filteredSessions.length === 0) return
    const prevIndex = Math.max(selectedSessionIndex - 1, 0)
    setSelectedSessionIndex(prevIndex)
    const prevSession = filteredSessions[prevIndex]
    if (prevSession) {
      highlightSession(prevSession.id)
    }
  }, [
    filteredSessions,
    selectedSessionIndex,
    setSelectedSessionIndex,
    highlightSession,
  ])

  const handleSessionFirst = useCallback(() => {
    if (filteredSessions.length === 0) return
    setSelectedSessionIndex(0)
    const firstSession = filteredSessions[0]
    if (firstSession) {
      highlightSession(firstSession.id)
    }
  }, [filteredSessions, setSelectedSessionIndex, highlightSession])

  const handleSessionLast = useCallback(() => {
    if (filteredSessions.length === 0) return
    const lastIndex = filteredSessions.length - 1
    setSelectedSessionIndex(lastIndex)
    const lastSession = filteredSessions[lastIndex]
    if (lastSession) {
      highlightSession(lastSession.id)
    }
  }, [filteredSessions, setSelectedSessionIndex, highlightSession])

  // Handle gg sequence (first session)
  const handleGKey = useCallback(() => {
    const now = Date.now()
    if (
      lastKeyRef.current?.key === 'g' &&
      now - lastKeyRef.current.time < 500
    ) {
      // gg detected
      handleSessionFirst()
      lastKeyRef.current = null
    } else {
      lastKeyRef.current = { key: 'g', time: now }
    }
  }, [handleSessionFirst])

  // Project navigation handlers
  const handleProjectNext = useCallback(() => {
    selectNextProject(projectIds as string[])
  }, [selectNextProject, projectIds])

  const handleProjectPrev = useCallback(() => {
    selectPrevProject(projectIds as string[])
  }, [selectPrevProject, projectIds])

  // Jump to the selected session's terminal/IDE
  const handleJumpToAgent = useCallback(async () => {
    const session = filteredSessions[selectedSessionIndex]
    if (session) {
      await window.App.tmux.focus(session.id)
    }
  }, [filteredSessions, selectedSessionIndex])

  // Register global shortcuts (always active)
  useGlobalShortcuts(
    useMemo(
      () => [
        {
          id: 'global.cheatsheet',
          key: '?',
          action: toggleCheatsheet,
          description: 'Show keyboard shortcuts',
          category: 'system' as const,
        },
        {
          id: 'global.settings',
          key: ',',
          modifiers: [platformModifier],
          action: () => setViewMode('settings'),
          description: 'Open settings',
          category: 'navigation' as const,
        },
        {
          id: 'global.toggleSidebar',
          key: 'b',
          modifiers: [platformModifier],
          action: toggleSidebar,
          description: 'Toggle sidebar',
          category: 'navigation' as const,
        },
        {
          id: 'global.sessions',
          key: '1',
          action: () => setViewMode('sessions'),
          description: 'Sessions view',
          category: 'navigation' as const,
        },
        {
          id: 'global.history',
          key: '2',
          action: () => setViewMode('history'),
          description: 'History view',
          category: 'navigation' as const,
        },
        {
          id: 'global.analytics',
          key: '3',
          action: () => setViewMode('analytics'),
          description: 'Analytics view',
          category: 'navigation' as const,
        },
      ],
      [toggleCheatsheet, toggleSidebar, setViewMode]
    )
  )

  // Register sessions-specific shortcuts
  useScopedShortcuts(
    'sessions',
    useMemo(
      () => [
        // Session list navigation (j/k)
        {
          id: 'sessions.next',
          key: 'j',
          action: handleSessionNext,
          description: 'Next session',
          category: 'list' as const,
        },
        {
          id: 'sessions.nextArrow',
          key: 'ArrowDown',
          action: handleSessionNext,
          description: 'Next session',
          category: 'list' as const,
        },
        {
          id: 'sessions.prev',
          key: 'k',
          action: handleSessionPrev,
          description: 'Previous session',
          category: 'list' as const,
        },
        {
          id: 'sessions.prevArrow',
          key: 'ArrowUp',
          action: handleSessionPrev,
          description: 'Previous session',
          category: 'list' as const,
        },
        {
          id: 'sessions.first',
          key: 'g',
          action: handleGKey,
          description: 'First session',
          category: 'list' as const,
          displayKey: 'gg',
        },
        {
          id: 'sessions.last',
          key: 'G',
          action: handleSessionLast,
          description: 'Last session',
          category: 'list' as const,
        },
        {
          id: 'sessions.focusTerminal',
          key: 'Enter',
          action: handleJumpToAgent,
          description: 'Jump to agent',
          category: 'actions' as const,
        },
        {
          id: 'sessions.escape',
          key: 'Escape',
          action: () => {
            setSelectedSessionIndex(0)
          },
          description: 'Clear selection',
          category: 'actions' as const,
        },
        // Project navigation
        {
          id: 'sessions.nextProject',
          key: 'L',
          action: handleProjectNext,
          description: 'Next project',
          category: 'navigation' as const,
        },
        {
          id: 'sessions.nextProjectTab',
          key: 'Tab',
          action: handleProjectNext,
          description: 'Next project',
          category: 'navigation' as const,
        },
        {
          id: 'sessions.prevProject',
          key: 'H',
          action: handleProjectPrev,
          description: 'Previous project',
          category: 'navigation' as const,
        },
        {
          id: 'sessions.prevProjectTab',
          key: 'Tab',
          modifiers: ['shift'],
          action: handleProjectPrev,
          description: 'Previous project',
          category: 'navigation' as const,
        },
        {
          id: 'sessions.allProjects',
          key: '0',
          action: selectAllProjects,
          description: 'All projects',
          category: 'navigation' as const,
        },
        // Jump to agent
        {
          id: 'sessions.jumpToAgent',
          key: 'f',
          action: handleJumpToAgent,
          description: 'Jump to agent',
          category: 'actions' as const,
        },
      ],
      [
        handleSessionNext,
        handleSessionPrev,
        handleGKey,
        handleSessionLast,
        handleProjectNext,
        handleProjectPrev,
        selectAllProjects,
        handleJumpToAgent,
        filteredSessions,
        selectedSessionIndex,
        setSelectedSessionIndex,
      ]
    )
  )

  // Set active scope based on view mode
  useActiveScope(viewMode === 'sessions' ? 'sessions' : viewMode)

  return { viewMode, setViewMode }
}
