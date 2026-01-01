/**
 * Cost View
 *
 * Main dashboard view for AI cost tracking.
 * Shows summary cards, spending chart, and cost breakdowns.
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertCircle, ExternalLink } from 'lucide-react'
import { CostSummaryCards } from './cost-summary-cards'
import { SpendingChart } from './spending-chart'
import { CostBreakdown } from './cost-breakdown'
import { Button } from '../ui/button'
import type { CostStatistics } from 'shared/cost-types'

const BILLING_LINKS = [
  {
    name: 'Claude Console',
    url: 'https://console.anthropic.com/settings/billing',
  },
  { name: 'Cursor Settings', url: 'https://www.cursor.com/settings' },
  { name: 'Google AI Studio', url: 'https://aistudio.google.com/billing' },
]

const { App } = window

export function CostView() {
  const [stats, setStats] = useState<CostStatistics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const statistics = await App.cost.getStatistics()
      setStats(statistics)
    } catch (err) {
      console.error('[CostView] Failed to load statistics:', err)
      setError(err instanceof Error ? err.message : 'Failed to load cost data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load stats on mount
  useEffect(() => {
    loadStats()
  }, [loadStats])

  if (isLoading && !stats) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading cost data...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p>{error}</p>
        <Button onClick={loadStats} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No cost data available
      </div>
    )
  }

  // Check if there's any data
  const hasData = stats.totalCostAllTime > 0

  return (
    <div className="p-6 space-y-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">AI Cost Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Track your AI token usage and spending
          </p>
        </div>
        <Button
          disabled={isLoading}
          onClick={loadStats}
          size="sm"
          variant="outline"
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No cost data yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Cost tracking will begin automatically when you use AI agents.
            Session data is captured when sessions end.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <CostSummaryCards
            monthChange={stats.monthOverMonthChange}
            monthCost={stats.totalCostThisMonth}
            todayCost={stats.totalCostToday}
            totalTokens={stats.totalInputTokens + stats.totalOutputTokens}
            weekChange={stats.weekOverWeekChange}
            weekCost={stats.totalCostThisWeek}
          />

          {/* Spending Chart */}
          <SpendingChart data={stats.dailyCosts} />

          {/* Breakdowns Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CostBreakdown
              data={stats.costByAgent}
              maxItems={4}
              title="By Agent"
            />
            <CostBreakdown
              data={stats.costByModel}
              maxItems={4}
              title="By Model"
            />
            <CostBreakdown
              data={stats.costByProject}
              maxItems={4}
              title="By Project"
            />
          </div>

          {/* Additional Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-muted-foreground mb-1">
                Average Cost per Session
              </p>
              <p className="text-lg font-medium">
                ~${stats.avgCostPerSession.toFixed(3)}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-muted-foreground mb-1">
                Average Tokens per Session
              </p>
              <p className="text-lg font-medium">
                {Math.round(stats.avgTokensPerSession).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Billing Links */}
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-3">
              View actual billing
            </p>
            <div className="flex flex-wrap gap-2">
              {BILLING_LINKS.map(link => (
                <Button
                  asChild
                  className="h-8 text-xs"
                  key={link.name}
                  size="sm"
                  variant="outline"
                >
                  <a href={link.url} rel="noopener noreferrer" target="_blank">
                    {link.name}
                    <ExternalLink className="w-3 h-3 ml-1.5" />
                  </a>
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
