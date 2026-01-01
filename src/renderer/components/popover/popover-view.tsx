import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { PopoverSessionItem } from './popover-session-item'
import { LayoutDashboard, Power } from 'lucide-react'
import { modalVariants, containerVariants } from 'renderer/lib/motion-variants'
import { cn } from 'renderer/lib/utils'
import type { ClaudeSession } from 'shared/hook-types'
import type { ClaudeSessionEvent } from 'preload/index'

const { App } = window

// Sort sessions by priority (approval > processing > others)
function sortByPriority(sessions: ClaudeSession[]): ClaudeSession[] {
  const priorityMap: Record<ClaudeSession['phase'], number> = {
    waitingForApproval: 5,
    processing: 4,
    compacting: 3,
    waitingForInput: 2,
    idle: 1,
    ended: 0,
  }

  return [...sessions].sort((a, b) => {
    const priorityDiff = priorityMap[b.phase] - priorityMap[a.phase]
    if (priorityDiff !== 0) return priorityDiff
    return b.lastActivity - a.lastActivity
  })
}

export function PopoverView() {
  const [sessions, setSessions] = useState<ClaudeSession[]>([])

  // Load sessions and subscribe to updates
  useEffect(() => {
    // Initial load
    App.claudeSessions.getAll().then(allSessions => {
      const active = allSessions.filter(s => s.phase !== 'ended')
      setSessions(sortByPriority(active))
    })

    // Subscribe to session events
    const unsubscribe = App.claudeSessions.onEvent(
      (event: ClaudeSessionEvent) => {
        setSessions(prev => {
          let updated: ClaudeSession[]
          switch (event.type) {
            case 'add':
              if (event.session.phase === 'ended') return prev
              updated = [...prev, event.session]
              break
            case 'update':
            case 'phaseChange':
            case 'permissionRequest':
            case 'permissionResolved':
              if (event.session.phase === 'ended') {
                updated = prev.filter(s => s.id !== event.session.id)
              } else {
                const exists = prev.find(s => s.id === event.session.id)
                if (exists) {
                  updated = prev.map(s =>
                    s.id === event.session.id ? event.session : s
                  )
                } else {
                  updated = [...prev, event.session]
                }
              }
              break
            case 'remove':
              updated = prev.filter(s => s.id !== event.session.id)
              break
            default:
              return prev
          }
          return sortByPriority(updated)
        })
      }
    )

    return unsubscribe
  }, [])

  // Handle escape key to close popover
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleOpenDashboard = useCallback(async () => {
    await App.window.showDashboard()
  }, [])

  const handleQuit = useCallback(async () => {
    await App.window.quit()
  }, [])

  const activeCount = sessions.length
  const approvalCount = sessions.filter(
    s => s.phase === 'waitingForApproval'
  ).length

  return (
    <motion.div
      animate="animate"
      className={cn(
        'flex flex-col h-screen',
        'bg-background/80 dark:bg-background/60 backdrop-blur-xl',
        'rounded-xl overflow-hidden',
        'border border-border/50'
      )}
      exit="exit"
      initial="initial"
      variants={modalVariants}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-primary/20 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">P</span>
          </div>
          <span className="text-sm font-semibold">Plexus</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {activeCount === 0 ? (
            'No active sessions'
          ) : approvalCount > 0 ? (
            <span className="text-status-approval font-medium">
              {approvalCount} need{approvalCount === 1 ? 's' : ''} approval
            </span>
          ) : (
            `${activeCount} active session${activeCount === 1 ? '' : 's'}`
          )}
        </div>
      </header>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        <AnimatePresence mode="popLayout">
          {sessions.length === 0 ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-muted-foreground/60 py-12"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="empty"
            >
              <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
                <LayoutDashboard className="w-6 h-6" />
              </div>
              <p className="text-sm">No active sessions</p>
              <p className="text-xs mt-1">Start an AI agent to see it here</p>
            </motion.div>
          ) : (
            <motion.div
              animate="animate"
              className="space-y-1.5"
              initial="initial"
              variants={containerVariants}
            >
              {sessions.map(session => (
                <PopoverSessionItem key={session.id} session={session} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="flex gap-2 px-3 py-2.5 border-t border-border/30">
        <Button
          className="flex-1 h-9 text-sm"
          onClick={handleOpenDashboard}
          variant="secondary"
        >
          <LayoutDashboard className="w-4 h-4 mr-2" />
          Dashboard
        </Button>
        <Button
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
          onClick={handleQuit}
          size="icon"
          title="Quit Plexus"
          variant="ghost"
        >
          <Power className="w-4 h-4" />
        </Button>
      </footer>
    </motion.div>
  )
}
