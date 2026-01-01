/**
 * Cost Summary Cards
 *
 * Shows today/week/month cost summary with trend indicators.
 */

import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Zap,
  Calendar,
} from 'lucide-react'
import { Card, CardContent } from '../ui/card'
import { InfoTooltip } from '../ui/info-tooltip'
import { cn } from 'renderer/lib/utils'

const COST_TOOLTIP = 'Estimated based on session data. Actual billing may vary.'

interface CostSummaryCardsProps {
  todayCost: number
  weekCost: number
  monthCost: number
  weekChange: number
  monthChange: number
  totalTokens: number
}

function formatCost(cost: number): string {
  if (cost >= 100) {
    return `~$${cost.toFixed(0)}`
  }
  if (cost >= 10) {
    return `~$${cost.toFixed(1)}`
  }
  return `~$${cost.toFixed(2)}`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return tokens.toString()
}

function TrendBadge({ change }: { change: number }) {
  const isPositive = change > 0
  const isNeutral = Math.abs(change) < 1

  if (isNeutral) {
    return <span className="text-xs text-muted-foreground">stable</span>
  }

  return (
    <span
      className={cn(
        'flex items-center gap-0.5 text-xs',
        isPositive ? 'text-red-500' : 'text-green-500'
      )}
    >
      {isPositive ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {Math.abs(change).toFixed(0)}%
    </span>
  )
}

export function CostSummaryCards({
  todayCost,
  weekCost,
  monthCost,
  weekChange,
  monthChange,
  totalTokens,
}: CostSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* Today */}
      <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <DollarSign className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-1">
              <p className="text-2xl font-bold">{formatCost(todayCost)}</p>
              <InfoTooltip content={COST_TOOLTIP} />
            </div>
            <p className="text-xs text-muted-foreground">Today</p>
          </div>
        </CardContent>
      </Card>

      {/* This Week */}
      <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <TrendBadge change={weekChange} />
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-1">
              <p className="text-2xl font-bold">{formatCost(weekCost)}</p>
              <InfoTooltip content={COST_TOOLTIP} />
            </div>
            <p className="text-xs text-muted-foreground">This Week</p>
          </div>
        </CardContent>
      </Card>

      {/* This Month */}
      <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Calendar className="w-4 h-4 text-purple-500" />
            </div>
            <TrendBadge change={monthChange} />
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-1">
              <p className="text-2xl font-bold">{formatCost(monthCost)}</p>
              <InfoTooltip content={COST_TOOLTIP} />
            </div>
            <p className="text-xs text-muted-foreground">This Month</p>
          </div>
        </CardContent>
      </Card>

      {/* Total Tokens */}
      <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Zap className="w-4 h-4 text-green-500" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold">{formatTokens(totalTokens)}</p>
            <p className="text-xs text-muted-foreground">Total Tokens</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
