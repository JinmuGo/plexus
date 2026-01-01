import { useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Clock } from 'lucide-react'
import { cn } from 'renderer/lib/utils'
import { ToolIcon } from 'renderer/components/ui/icons/tool-icon'
import type { ToolExecution } from 'shared/history-types'

interface ToolCardProps {
  execution: ToolExecution
  isActive?: boolean
  defaultExpanded?: boolean
}

const formatDuration = (ms: number | null) => {
  if (ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// Status colors inspired by claude-island
const statusConfig = {
  running: {
    dot: 'bg-blue-400',
    text: 'text-blue-400',
    glow: 'shadow-blue-400/30',
    pulse: true,
  },
  success: {
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    glow: 'shadow-emerald-400/30',
    pulse: false,
  },
  error: {
    dot: 'bg-red-400',
    text: 'text-red-400',
    glow: 'shadow-red-400/30',
    pulse: false,
  },
  denied: {
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    glow: 'shadow-amber-400/30',
    pulse: false,
  },
  interrupted: {
    dot: 'bg-yellow-400',
    text: 'text-yellow-400',
    glow: 'shadow-yellow-400/30',
    pulse: false,
  },
}

const expandSpring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 25,
}

export const ToolCard = memo(function ToolCard({
  execution,
  isActive = false,
  defaultExpanded = false,
}: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const status = statusConfig[execution.status] || statusConfig.success

  // Get tool input summary
  const getInputSummary = () => {
    if (!execution.toolInput) return ''
    const input = execution.toolInput

    switch (execution.toolName) {
      case 'Bash':
        return String(input.command || '').slice(0, 60)
      case 'Read':
      case 'Write':
      case 'Edit':
        return String(input.file_path || '')
      case 'Grep':
      case 'Glob':
        return String(input.pattern || '').slice(0, 40)
      case 'Task':
        return String(input.prompt || '').slice(0, 50)
      default: {
        const firstKey = Object.keys(input)[0]
        const firstValue = firstKey ? input[firstKey] : null
        if (firstValue && typeof firstValue === 'string') {
          return firstValue.slice(0, 50)
        }
        return ''
      }
    }
  }

  const inputSummary = getInputSummary()

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
              status.pulse || isActive
                ? { scale: [1, 1.3, 1], opacity: [0.6, 0.2, 0.6] }
                : {}
            }
            className={cn(
              'w-2 h-2 rounded-full',
              status.dot,
              (status.pulse || isActive) && ['shadow-sm', status.glow]
            )}
            transition={{
              repeat: status.pulse || isActive ? Number.POSITIVE_INFINITY : 0,
              duration: 1.2,
              ease: 'easeInOut',
            }}
          />
        </div>

        {/* Tool Icon */}
        <div className="flex-shrink-0 text-muted-foreground/70">
          <ToolIcon size="md" toolName={execution.toolName} />
        </div>

        {/* Tool Name & Summary */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-foreground/90">
            {execution.toolName}
          </span>
          {inputSummary && (
            <span className="text-[11px] text-muted-foreground/60 truncate">
              {inputSummary}
            </span>
          )}
        </div>

        {/* Duration */}
        {execution.durationMs !== null && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
            <Clock className="w-3 h-3" />
            <span className="tabular-nums">
              {formatDuration(execution.durationMs)}
            </span>
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
            <div className="ml-5 pl-3 border-l border-border/30 mt-2 space-y-3">
              {/* Input */}
              {execution.toolInput &&
                Object.keys(execution.toolInput).length > 0 && (
                  <div>
                    <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                      Input
                    </div>
                    <pre
                      className={cn(
                        'text-[11px] font-mono p-3 rounded-lg',
                        'bg-muted/20 border border-border/30',
                        'overflow-x-auto max-h-40',
                        'text-foreground/80'
                      )}
                    >
                      {JSON.stringify(execution.toolInput, null, 2)}
                    </pre>
                  </div>
                )}

              {/* Output */}
              {execution.toolOutput && (
                <div>
                  <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                    Output
                  </div>
                  <pre
                    className={cn(
                      'text-[11px] font-mono p-3 rounded-lg',
                      'bg-muted/20 border border-border/30',
                      'overflow-x-auto max-h-60 overflow-y-auto',
                      'text-foreground/70'
                    )}
                  >
                    {execution.toolOutput.length > 3000
                      ? `${execution.toolOutput.slice(0, 3000)}...\n\n[Truncated: ${execution.toolOutput.length} chars total]`
                      : execution.toolOutput}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
