/**
 * ProductivityInsights - Week-over-week productivity metrics section
 *
 * Displays key productivity metrics with trend indicators.
 * Focused on actionable metrics only.
 */

import { motion } from 'framer-motion'
import { Calendar, MessageSquare, CheckCircle2 } from 'lucide-react'
import type { ProductivityTrend, WeekComparison } from 'shared/history-types'
import { TrendCard } from './trend-card'
import { cn } from 'renderer/lib/utils'

interface ProductivityInsightsProps {
  trends: ProductivityTrend[]
  comparison: WeekComparison
  className?: string
}

export function ProductivityInsights({
  trends,
  comparison,
  className = '',
}: ProductivityInsightsProps) {
  // Get current week's data (first item)
  const thisWeek = trends[0]

  if (!thisWeek) {
    return (
      <div
        className={cn(
          'glass-surface rounded-xl p-5 flex items-center justify-center h-32',
          'text-muted-foreground text-sm',
          className
        )}
      >
        No productivity data available
      </div>
    )
  }

  // Format values
  const formatSessionsPerDay = (val: number): string => {
    return val.toFixed(1)
  }

  const formatMessagesPerSession = (val: number): string => {
    return val.toFixed(1)
  }

  const formatPercentage = (val: number): string => {
    return `${(val * 100).toFixed(0)}%`
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={className}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold tracking-tight">This Week</h3>
        <span className="text-xs text-muted-foreground font-medium">
          vs last week
        </span>
      </div>

      {/* Trend Cards Grid - 핵심 3개만 */}
      <div className="grid grid-cols-3 gap-3">
        <TrendCard
          change={comparison.sessionsChange}
          icon={<Calendar className="w-4 h-4" />}
          index={0}
          title="Sessions/Day"
          value={formatSessionsPerDay(thisWeek.sessionsPerDay)}
        />
        <TrendCard
          change={comparison.messagesChange}
          icon={<MessageSquare className="w-4 h-4" />}
          index={1}
          title="Msgs/Session"
          value={formatMessagesPerSession(thisWeek.avgMessagesPerSession)}
        />
        <TrendCard
          change={comparison.successRateChange}
          icon={<CheckCircle2 className="w-4 h-4" />}
          index={2}
          title="Completion"
          value={formatPercentage(thisWeek.completionRate)}
        />
      </div>
    </motion.div>
  )
}
