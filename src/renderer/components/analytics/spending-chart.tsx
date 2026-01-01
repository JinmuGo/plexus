/**
 * Spending Chart
 *
 * A lightweight SVG-based line chart showing daily spending trends.
 */

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { InfoTooltip } from '../ui/info-tooltip'
import { Badge } from '../ui/badge'
import type { DailyCost } from 'shared/cost-types'

const COST_TOOLTIP = 'Estimated based on session data. Actual billing may vary.'

interface SpendingChartProps {
  data: DailyCost[]
  title?: string
}

const CHART_HEIGHT = 120
const CHART_PADDING = 20

export function SpendingChart({
  data,
  title = 'Daily Spending',
}: SpendingChartProps) {
  // Sort data by date ascending
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.timestamp - b.timestamp)
  }, [data])

  // Calculate chart dimensions and path
  const chartData = useMemo(() => {
    if (sortedData.length === 0) {
      return { path: '', points: [], maxCost: 0, avgCost: 0 }
    }

    const costs = sortedData.map(d => d.costUsd)
    const maxCost = Math.max(...costs, 0.01) // Minimum to avoid division by zero
    const avgCost = costs.reduce((sum, c) => sum + c, 0) / costs.length

    // Generate path points
    const width = 100 // Percentage-based
    const height = CHART_HEIGHT - CHART_PADDING * 2
    const stepX =
      sortedData.length > 1 ? width / (sortedData.length - 1) : width / 2

    const points = sortedData.map((d, i) => ({
      x: i * stepX,
      y: height - (d.costUsd / maxCost) * height,
      date: d.date,
      cost: d.costUsd,
      tokens: d.inputTokens + d.outputTokens,
    }))

    // Generate SVG path
    const pathPoints = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ')

    // Generate area path (filled under the line)
    const areaPath = `${pathPoints} L ${points[points.length - 1].x} ${height} L 0 ${height} Z`

    return { path: pathPoints, areaPath, points, maxCost, avgCost }
  }, [sortedData])

  if (sortedData.length === 0) {
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
            <span>Avg: ~${chartData.avgCost.toFixed(2)}/day</span>
            <span>Max: ~${chartData.maxCost.toFixed(2)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-2">
        <div className="relative h-[120px]">
          <svg
            className="w-full h-full"
            preserveAspectRatio="none"
            viewBox={`0 0 100 ${CHART_HEIGHT}`}
          >
            {/* Gradient definitions */}
            <defs>
              {/* Area fill gradient - emerald to cyan */}
              <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.05" />
              </linearGradient>
              {/* Line stroke gradient - horizontal */}
              <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="50%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>

            {/* Filled area */}
            <path
              d={chartData.areaPath}
              fill="url(#areaGradient)"
              transform={`translate(0, ${CHART_PADDING})`}
            />

            {/* Line */}
            <path
              d={chartData.path}
              fill="none"
              stroke="url(#lineGradient)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              transform={`translate(0, ${CHART_PADDING})`}
            />

            {/* Data points with position-based gradient colors */}
            {chartData.points.map((point, i) => {
              const progress =
                chartData.points.length > 1
                  ? i / (chartData.points.length - 1)
                  : 0.5
              const color =
                progress < 0.5
                  ? `color-mix(in srgb, #10b981 ${(1 - progress * 2) * 100}%, #06b6d4)`
                  : `color-mix(in srgb, #06b6d4 ${(1 - (progress - 0.5) * 2) * 100}%, #8b5cf6)`
              return (
                <circle
                  className="transition-all hover:opacity-80"
                  cx={point.x}
                  cy={point.y + CHART_PADDING}
                  fill={color}
                  key={`${point.x}-${point.y}`}
                  r="2.5"
                />
              )
            })}
          </svg>

          {/* X-axis labels */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] text-muted-foreground px-1">
            {sortedData.length > 0 && (
              <>
                <span>{sortedData[0].date.slice(5)}</span>
                {sortedData.length > 1 && (
                  <span>{sortedData[sortedData.length - 1].date.slice(5)}</span>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
