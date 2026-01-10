/**
 * Cost Breakdown
 *
 * Shows cost breakdown by category (agent, project, or model) with horizontal bar visualization.
 */

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { InfoTooltip } from '../ui/info-tooltip'
import { cn } from 'renderer/lib/utils'
import type { CostBreakdown as CostBreakdownData } from 'shared/cost-types'

const COST_TOOLTIP = 'Estimated based on session data. Actual billing may vary.'

interface CostBreakdownProps {
  title: string
  data: CostBreakdownData[]
  maxItems?: number
}

// Color palette using design system chart colors
const COLORS = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
  'bg-primary',
  'bg-accent',
  'bg-status-thinking',
]

function formatCost(cost: number): string {
  if (cost >= 100) {
    return `~$${cost.toFixed(0)}`
  }
  if (cost >= 10) {
    return `~$${cost.toFixed(1)}`
  }
  return `~$${cost.toFixed(2)}`
}

function formatLabel(label: string): string {
  // Clean up model names and agent types for display
  return label
    .replace(/^claude-/, '')
    .replace(/^gemini-/, '')
    .replace(/-\d{8}$/, '') // Remove date suffix
    .replace(/-/g, ' ')
}

export function CostBreakdown({
  title,
  data,
  maxItems = 5,
}: CostBreakdownProps) {
  // Sort by cost descending and limit items
  const sortedData = [...data]
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, maxItems)

  const totalCost = data.reduce((sum, d) => sum + d.costUsd, 0)

  if (sortedData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-sm text-muted-foreground">No data available</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <InfoTooltip content={COST_TOOLTIP} />
          </div>
          <span className="text-xs text-muted-foreground">
            Total: {formatCost(totalCost)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {sortedData.map((item, index) => (
          <div className="space-y-1" key={item.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    COLORS[index % COLORS.length]
                  )}
                />
                <span className="capitalize">{formatLabel(item.label)}</span>
              </span>
              <span className="font-medium">{formatCost(item.costUsd)}</span>
            </div>
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'absolute left-0 top-0 h-full rounded-full transition-all duration-300',
                  COLORS[index % COLORS.length]
                )}
                style={{ width: `${item.percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{item.percentage.toFixed(1)}%</span>
              <span>
                {(item.inputTokens + item.outputTokens).toLocaleString()} tokens
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
