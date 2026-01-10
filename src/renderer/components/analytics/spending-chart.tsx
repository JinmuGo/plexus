/**
 * Spending Chart
 *
 * A Recharts-based area chart showing daily spending trends.
 */

import { useMemo } from 'react'
import { Area, AreaChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../ui/chart'
import { InfoTooltip } from '../ui/info-tooltip'
import { Badge } from '../ui/badge'
import type { DailyCost } from 'shared/cost-types'

const COST_TOOLTIP = 'Estimated based on session data. Actual billing may vary.'

interface SpendingChartProps {
  data: DailyCost[]
  title?: string
}

const chartConfig = {
  cost: {
    label: 'Cost',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

export function SpendingChart({
  data,
  title = 'Daily Spending',
}: SpendingChartProps) {
  // Sort data by date ascending and format for Recharts
  // Always include today's date even if there's no data
  const { chartData, maxCost, avgCost } = useMemo(() => {
    if (data.length === 0) {
      return { chartData: [], maxCost: 0, avgCost: 0 }
    }

    const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)

    // Get today's date in YYYY-MM-DD format (local timezone)
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    // Check if today is already in the data
    const hasToday = sorted.some(d => d.date === todayStr)

    // Add today with 0 cost if not present
    if (!hasToday) {
      sorted.push({
        date: todayStr,
        timestamp: today.getTime(),
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        sessionCount: 0,
      })
    }

    const costs = sorted.map(d => d.costUsd)
    const nonZeroCosts = costs.filter(c => c > 0)
    const max = Math.max(...costs, 0.01)
    const avg =
      nonZeroCosts.length > 0
        ? nonZeroCosts.reduce((sum, c) => sum + c, 0) / nonZeroCosts.length
        : 0

    const formatted = sorted.map(d => ({
      date: d.date.slice(5), // MM-DD format
      cost: d.costUsd,
      tokens: d.inputTokens + d.outputTokens,
    }))

    return { chartData: formatted, maxCost: max, avgCost: avg }
  }, [data])

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[120px] flex items-center justify-center text-muted-foreground text-sm">
            No spending data yet
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Badge className="text-[10px] px-1.5 py-0" variant="outline">
              Estimated
            </Badge>
            <InfoTooltip content={COST_TOOLTIP} />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Avg: ~${avgCost.toFixed(2)}/day</span>
            <span>Max: ~${maxCost.toFixed(2)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-2">
        <ChartContainer className="h-[120px] w-full" config={chartConfig}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fillCost" x1="0" x2="1" y1="0" y2="0">
                <stop
                  offset="0%"
                  stopColor="var(--chart-2)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="50%"
                  stopColor="var(--chart-1)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="var(--chart-4)"
                  stopOpacity={0.2}
                />
              </linearGradient>
              <linearGradient id="strokeCost" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="var(--chart-2)" />
                <stop offset="50%" stopColor="var(--chart-1)" />
                <stop offset="100%" stopColor="var(--chart-4)" />
              </linearGradient>
            </defs>
            <XAxis
              axisLine={false}
              dataKey="date"
              interval="preserveStartEnd"
              tick={{ fontSize: 10 }}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis domain={[0, 'auto']} hide />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={value => [`~$${Number(value).toFixed(2)}`, 'Cost']}
                  labelFormatter={label => `Date: ${label}`}
                />
              }
            />
            <Area
              activeDot={{ r: 4, strokeWidth: 0 }}
              dataKey="cost"
              dot={false}
              fill="url(#fillCost)"
              stroke="url(#strokeCost)"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
