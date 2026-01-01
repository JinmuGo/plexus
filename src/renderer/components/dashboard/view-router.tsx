/**
 * View Router
 *
 * Routes between different dashboard views based on viewMode.
 */

import { useMemo, useEffect, useCallback } from 'react'
import { ClaudeSessionsView, sortSessions } from './claude-sessions-view'
import { ProjectTabs } from './project-tabs'
import { HistoryView } from '../history'
import { AnalyticsView } from '../analytics'
import { SettingsView } from '../settings'
import { useSessionStore, useUIStore, type ViewMode } from 'renderer/stores'
import { filterSessionsByProject } from 'renderer/lib/hooks'

interface ViewRouterProps {
  viewMode: ViewMode
}

export function ViewRouter({ viewMode }: ViewRouterProps) {
  const sessions = useSessionStore(state => state.sessions)
  const selectedProjectId = useUIStore(state => state.selectedProjectId)
  const selectedSessionIndex = useUIStore(state => state.selectedSessionIndex)
  const setSelectedSessionIndex = useUIStore(
    state => state.setSelectedSessionIndex
  )
  const clampSessionIndex = useUIStore(state => state.clampSessionIndex)

  // Filter and sort sessions by selected project
  const filteredSessions = useMemo(
    () => sortSessions(filterSessionsByProject(sessions, selectedProjectId)),
    [sessions, selectedProjectId]
  )

  // Clamp session index when filtered sessions change
  useEffect(() => {
    clampSessionIndex(filteredSessions.length)
  }, [filteredSessions.length, clampSessionIndex])

  // Get the keyboard-selected session ID (from sorted list)
  const keyboardSelectedId = filteredSessions[selectedSessionIndex]?.id ?? null

  // Handle session selection (just updates keyboard index)
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      const index = filteredSessions.findIndex(s => s.id === sessionId)
      if (index !== -1) {
        setSelectedSessionIndex(index)
      }
    },
    [filteredSessions, setSelectedSessionIndex]
  )

  switch (viewMode) {
    case 'sessions':
      return (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Project filter tabs */}
          <ProjectTabs sessions={sessions} />
          {/* Session list */}
          <div className="flex-1 overflow-auto">
            <ClaudeSessionsView
              groupByFolder={false}
              groupByTmux={false}
              keyboardSelectedId={keyboardSelectedId}
              onSelectSession={handleSelectSession}
              selectedSessionId={keyboardSelectedId}
              sessions={filteredSessions}
            />
          </div>
        </div>
      )

    case 'history':
      return (
        <div className="flex-1 h-full overflow-hidden">
          <HistoryView />
        </div>
      )

    case 'analytics':
      return (
        <div className="flex-1 h-full overflow-hidden">
          <AnalyticsView />
        </div>
      )

    case 'settings':
      return (
        <div className="flex-1 h-full overflow-hidden">
          <SettingsView />
        </div>
      )

    default:
      return null
  }
}
