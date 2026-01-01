/**
 * Dashboard
 *
 * Main dashboard component with session monitoring and view routing.
 */

import { useMemo, useRef, useEffect } from 'react'
import { AppSidebar } from '../sidebar'
import { SidebarProvider, SidebarInset } from '../ui/sidebar'
import { DashboardHeader } from './dashboard-header'
import { ViewRouter } from './view-router'
import { useDashboardShortcuts } from './hooks'
import {
  useSessionStore,
  useSessions,
  getStagedSessions,
  useUIStore,
} from 'renderer/stores'

const { App } = window

// Inner component that uses sidebar context
function DashboardContent() {
  // Session store (initialization handled by StoreProvider)
  const isLoading = useSessionStore(state => state.isLoading)
  const sessions = useSessions()

  // UI store
  const handleSessionRemoved = useUIStore(state => state.handleSessionRemoved)
  const clampAttentionIndex = useUIStore(state => state.clampAttentionIndex)

  // Derive staged sessions with stable reference
  const stagedSessions = useMemo(() => getStagedSessions(sessions), [sessions])

  // Track previous staged sessions length to avoid unnecessary clamp calls
  const prevLengthRef = useRef(stagedSessions.length)

  // Register keyboard shortcuts
  const { viewMode, setViewMode } = useDashboardShortcuts()

  // Handle session removal in IPC subscription
  useEffect(() => {
    const unsubscribe = App.claudeSessions.onEvent(event => {
      if (event.type === 'remove') {
        handleSessionRemoved(event.session.id)
      }
    })
    return unsubscribe
  }, [handleSessionRemoved])

  // Keep selectedAttentionIndex in bounds when stagedSessions length changes
  useEffect(() => {
    // Only clamp if length actually changed
    if (prevLengthRef.current !== stagedSessions.length) {
      prevLengthRef.current = stagedSessions.length
      clampAttentionIndex(stagedSessions.length)
    }
  }, [stagedSessions.length, clampAttentionIndex])

  // Calculate approval count for sidebar
  const approvalNeeded = useMemo(
    () => sessions.filter(s => s.phase === 'waitingForApproval').length,
    [sessions]
  )

  // Loading state
  if (isLoading) {
    return (
      <>
        <AppSidebar
          approvalCount={0}
          onViewModeChange={setViewMode}
          viewMode={viewMode}
        />
        <SidebarInset>
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">
              Loading sessions...
            </div>
          </div>
        </SidebarInset>
      </>
    )
  }

  return (
    <>
      {/* Sidebar */}
      <AppSidebar
        approvalCount={approvalNeeded}
        onViewModeChange={setViewMode}
        viewMode={viewMode}
      />

      {/* Main content */}
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-1 min-h-0">
          <ViewRouter viewMode={viewMode} />
        </div>
      </SidebarInset>
    </>
  )
}

// Main Dashboard component with SidebarProvider wrapper
export function Dashboard() {
  return (
    <SidebarProvider>
      <DashboardContent />
    </SidebarProvider>
  )
}
