/**
 * Statistics View
 *
 * Shows usage statistics from history data with productivity insights.
 * Focused on actionable metrics: usage patterns, projects, and agent comparison.
 */

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Clock,
  MessageSquare,
  RefreshCw,
  Activity,
  Timer,
  Zap,
} from 'lucide-react'
import { Button } from 'renderer/components/ui/button'
import { AgentIcon } from 'renderer/components/ui/icons'
import { cn } from 'renderer/lib/utils'
import type { ExtendedStatistics, AgentStats } from 'shared/history-types'
import type { AgentType } from 'shared/hook-types'
import {
  HeatmapChart,
  ProjectBreakdown,
  ProductivityInsights,
} from './statistics'

const { App } = window

// Agent colors for visual differentiation
const AGENT_COLORS: Record<AgentType, string> = {
  claude: 'from-agent-claude/80 to-agent-claude/40',
  cursor: 'from-agent-cursor/80 to-agent-cursor/40',
  gemini: 'from-agent-gemini/80 to-agent-gemini/40',
}

const AGENT_LABELS: Record<AgentType, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  gemini: 'Gemini',
}

export function StatisticsView() {
  const [stats, setStats] = useState<ExtendedStatistics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load statistics
  const loadStats = useCallback(async () => {
    setIsLoading(true)
    try {
      const statistics = await App.history.getExtendedStatistics()
      setStats(statistics)
    } catch (error) {
      console.error('Failed to load statistics:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Format duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`
    return `${(ms / 3600000).toFixed(1)}h`
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <RefreshCw className="w-6 h-6" />
        </motion.div>
        <span className="text-sm font-medium">Loading statistics...</span>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
        <Activity className="w-8 h-8 opacity-50" />
        <span className="text-sm">No statistics available</span>
      </div>
    )
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
      initial={{ opacity: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Usage Statistics
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI usage patterns and productivity
          </p>
        </div>
        <Button
          className="h-8 text-xs"
          disabled={isLoading}
          onClick={loadStats}
          size="sm"
          variant="outline"
        >
          <RefreshCw
            className={cn('w-3.5 h-3.5 mr-1.5', isLoading && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>

      {/* Summary Cards - 핵심 3개만 */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          icon={<Clock className="w-4 h-4" />}
          index={0}
          title="Sessions"
          value={stats.totalSessions.toLocaleString()}
        />
        <SummaryCard
          icon={<MessageSquare className="w-4 h-4" />}
          index={1}
          title="Messages"
          value={stats.totalMessages.toLocaleString()}
        />
        <SummaryCard
          icon={<Timer className="w-4 h-4" />}
          index={2}
          title="Avg Duration"
          value={formatDuration(stats.averageSessionDurationMs)}
        />
      </div>

      {/* Productivity Insights - 주간 비교 */}
      {stats.weeklyTrends.length > 0 && (
        <ProductivityInsights
          comparison={stats.thisWeekVsLastWeek}
          trends={stats.weeklyTrends}
        />
      )}

      {/* Usage Patterns: Heatmap + Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HeatmapChart data={stats.hourlyUsage} />
        <ProjectBreakdown projects={stats.projectStats} />
      </div>

      {/* Agent Comparison - 2개 이상일 때만 표시 */}
      {stats.agentStats.length > 1 && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="glass-surface rounded-xl p-5"
          initial={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-5">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold tracking-tight">
              Agent Usage
            </h3>
          </div>
          <div className="space-y-4">
            {stats.agentStats.map((agent, index) => (
              <AgentComparisonBar
                agent={agent}
                index={index}
                key={agent.agent}
                maxCount={Math.max(
                  ...stats.agentStats.map(a => a.sessionCount)
                )}
              />
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

/**
 * SummaryCard - Compact stat card for the overview section
 */
function SummaryCard({
  title,
  value,
  icon,
  index = 0,
}: {
  title: string
  value: string
  icon: React.ReactNode
  index?: number
}) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="glass-base rounded-xl p-4 group hover:bg-[var(--glass-bg-2)] transition-all duration-200"
      initial={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <div className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
          {icon}
        </div>
        <span className="text-[10px] font-medium tracking-wide uppercase">
          {title}
        </span>
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
    </motion.div>
  )
}

/**
 * AgentComparisonBar - Horizontal bar chart row for agent stats
 */
function AgentComparisonBar({
  agent,
  maxCount,
  index = 0,
}: {
  agent: AgentStats
  maxCount: number
  index?: number
}) {
  const barWidth = maxCount > 0 ? (agent.sessionCount / maxCount) * 100 : 0
  const gradientClass =
    AGENT_COLORS[agent.agent] || 'from-gray-500/80 to-gray-500/40'
  const label = AGENT_LABELS[agent.agent] || agent.agent

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="space-y-1.5"
      initial={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
    >
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <AgentIcon agent={agent.agent} size={14} />
          <span className="font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground text-xs">
          <span className="tabular-nums">{agent.sessionCount} sessions</span>
          <span className="tabular-nums">{agent.messageCount} msgs</span>
        </div>
      </div>
      <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
        <motion.div
          animate={{ width: `${barWidth}%` }}
          className={cn('h-full rounded-full bg-gradient-to-r', gradientClass)}
          initial={{ width: 0 }}
          transition={{
            duration: 0.5,
            delay: index * 0.05 + 0.1,
            ease: 'easeOut',
          }}
        />
      </div>
    </motion.div>
  )
}
