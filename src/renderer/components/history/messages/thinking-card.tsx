import { useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Brain, Clock } from 'lucide-react'
import { cn } from 'renderer/lib/utils'
import type { ThinkingBlock } from 'shared/history-types'

interface ThinkingCardProps {
  thinking: ThinkingBlock
  isActive?: boolean
  defaultExpanded?: boolean
}

const formatDuration = (ms: number | null) => {
  if (ms === null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const expandSpring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 25,
}

export const ThinkingCard = memo(function ThinkingCard({
  thinking,
  isActive = false,
  defaultExpanded = false,
}: ThinkingCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // Get preview (first 50 chars)
  const preview =
    thinking.text.slice(0, 50) + (thinking.text.length > 50 ? '...' : '')
  const duration = formatDuration(thinking.durationMs)

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="group"
      initial={{ opacity: 0, y: 8 }}
      transition={expandSpring}
    >
      {/* Main Card */}
      <motion.button
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
          'bg-muted/30 hover:bg-muted/50',
          'border border-transparent hover:border-border/50',
          'transition-colors duration-200',
          'text-left'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
        whileTap={{ scale: 0.995 }}
      >
        {/* Status Dot with optional pulse */}
        <div className="relative flex-shrink-0">
          <motion.div
            animate={
              isActive ? { scale: [1, 1.3, 1], opacity: [0.6, 0.2, 0.6] } : {}
            }
            className={cn(
              'w-2 h-2 rounded-full bg-purple-400',
              isActive && 'shadow-sm shadow-purple-400/30'
            )}
            transition={{
              repeat: isActive ? Number.POSITIVE_INFINITY : 0,
              duration: 1.2,
              ease: 'easeInOut',
            }}
          />
        </div>

        {/* Brain Icon */}
        <div className="flex-shrink-0 text-purple-400/70">
          <Brain className="w-4 h-4" />
        </div>

        {/* Label & Preview */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-foreground/90">
            Thinking
          </span>
          <span className="text-[11px] text-muted-foreground/60 truncate">
            {preview}
          </span>
        </div>

        {/* Duration (if available) */}
        {duration !== null && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
            <Clock className="w-3 h-3" />
            <span className="tabular-nums">{duration}</span>
          </div>
        )}

        {/* Expand Chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          className="flex-shrink-0 text-muted-foreground/40"
          transition={{ duration: 0.15 }}
        >
          <ChevronRight className="w-4 h-4" />
        </motion.div>
      </motion.button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={expandSpring}
          >
            <div className="ml-5 pl-3 border-l border-border/30 mt-2">
              <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                Reasoning
              </div>
              <pre
                className={cn(
                  'text-[11px] font-mono p-3 rounded-lg',
                  'bg-muted/20 border border-border/30',
                  'overflow-x-auto max-h-96 overflow-y-auto',
                  'text-foreground/80 whitespace-pre-wrap'
                )}
              >
                {thinking.text || 'Empty thinking block'}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
