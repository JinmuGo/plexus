/**
 * Attention Section
 *
 * Displays sessions that need user attention (approval, input, idle).
 * Uses Zustand stores for state management.
 */

import { useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, ChevronDown } from 'lucide-react'
import { AttentionStatusCard } from './attention-status-card'
import { listItemVariants } from 'renderer/lib/motion-variants'
import { getStagedSessions, useUIStore } from 'renderer/stores'
import { cn } from 'renderer/lib/utils'
import type { ClaudeSession } from 'shared/hook-types'

const { App } = window

// Maximum items to show before collapsing
const MAX_VISIBLE_ITEMS = 3

interface AttentionSectionProps {
  sessions: ClaudeSession[]
}

export function AttentionSection({ sessions }: AttentionSectionProps) {
  const stagedSessions = useMemo(() => getStagedSessions(sessions), [sessions])
  const selectedAttentionIndex = useUIStore(
    state => state.selectedAttentionIndex
  )
  const [isExpanded, setIsExpanded] = useState(false)

  // Focus terminal directly (bypasses side panel)
  const handleQuickFocus = useCallback(async (sessionId: string) => {
    await App.tmux.focus(sessionId)
  }, [])

  // Don't render if no sessions need attention
  if (stagedSessions.length === 0) {
    return null
  }

  // Determine visible sessions
  const hasMore = stagedSessions.length > MAX_VISIBLE_ITEMS
  const visibleSessions = isExpanded
    ? stagedSessions
    : stagedSessions.slice(0, MAX_VISIBLE_ITEMS)
  const hiddenCount = stagedSessions.length - MAX_VISIBLE_ITEMS

  return (
    <div className="sticky top-0 z-10 p-4 pb-2">
      <div
        className={cn(
          'rounded-xl overflow-hidden',
          // Multi-layer glass effect - theme-aware
          'bg-[var(--glass-bg-2)]',
          'backdrop-blur-2xl',
          'border border-[var(--glass-border-medium)]',
          // Attention glow - uses CSS variable
          'shadow-[var(--glass-inner-glow),var(--glass-shadow-attention)]'
        )}
      >
        {/* Glass header - theme-aware */}
        <div
          className={cn(
            'flex items-center gap-2.5 px-4 py-2',
            'bg-[var(--glass-bg-1)]',
            'border-b border-[var(--glass-border-subtle)]'
          )}
        >
          {/* Bell icon with indicator */}
          <div className="relative">
            <Bell className="w-4 h-4 text-status-approval" />
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-status-approval rounded-full"
              transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
            />
          </div>

          <h2 className="text-sm font-semibold text-foreground">
            Needs Attention
          </h2>

          <span className="text-xs font-bold text-status-approval bg-status-approval/15 px-1.5 py-0.5 rounded">
            {stagedSessions.length}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Keyboard hint - more subtle */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/70">
            <kbd className="px-1 py-0.5 rounded bg-surface-2/50 border border-border/30 font-mono text-[10px]">
              ↑↓
            </kbd>
            <kbd className="px-1 py-0.5 rounded bg-surface-2/50 border border-border/30 font-mono text-[10px]">
              ↵
            </kbd>
          </div>
        </div>

        {/* Content area - vertical list */}
        <div className="p-2">
          <motion.div
            animate="animate"
            className="flex flex-col gap-2"
            initial="initial"
          >
            <AnimatePresence mode="popLayout">
              {visibleSessions.map((session, index) => (
                <motion.div
                  animate="animate"
                  exit="exit"
                  initial="initial"
                  key={session.id}
                  layout
                  variants={listItemVariants}
                >
                  <AttentionStatusCard
                    isKeyboardSelected={index === selectedAttentionIndex}
                    onFocus={() => handleQuickFocus(session.id)}
                    onJump={() => handleQuickFocus(session.id)}
                    session={session}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {/* Expand/Collapse button */}
          {hasMore && (
            <motion.button
              animate={{ opacity: 1 }}
              className={cn(
                'w-full mt-2 py-1.5 rounded-lg',
                'text-xs font-medium text-muted-foreground',
                'hover:text-foreground hover:bg-surface-2/50',
                'transition-colors flex items-center justify-center gap-1'
              )}
              initial={{ opacity: 0 }}
              onClick={() => setIsExpanded(!isExpanded)}
              transition={{ delay: 0.2 }}
              type="button"
            >
              <motion.span
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4" />
              </motion.span>
              {isExpanded ? 'Show less' : `+${hiddenCount} more`}
            </motion.button>
          )}
        </div>
      </div>
    </div>
  )
}
