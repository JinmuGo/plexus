/**
 * HeatmapChart - Time-based usage heatmap
 *
 * Displays a 7x24 grid showing session density by hour and day of week.
 * Uses glassmorphism and the refined industrial design system.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { HourlyUsageData } from 'shared/history-types'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from 'renderer/components/ui/tooltip'
import { cn } from 'renderer/lib/utils'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface HeatmapChartProps {
  data: HourlyUsageData[]
  className?: string
}

export function HeatmapChart({ data, className = '' }: HeatmapChartProps) {
  const [hoveredCell, setHoveredCell] = useState<{
    hour: number
    day: number
  } | null>(null)

  // Build a lookup map for quick access
  const dataMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of data) {
      map.set(`${item.dayOfWeek}-${item.hour}`, item.sessionCount)
    }
    return map
  }, [data])

  // Find max value for color scaling
  const maxValue = useMemo(() => {
    if (data.length === 0) return 1
    return Math.max(...data.map(d => d.sessionCount), 1)
  }, [data])

  // Get color intensity based on value - using chart colors from design system
  const getColorStyle = (value: number): string => {
    if (value === 0) return 'bg-muted/20'
    const intensity = value / maxValue
    if (intensity < 0.25) return 'bg-chart-2/25'
    if (intensity < 0.5) return 'bg-chart-2/45'
    if (intensity < 0.75) return 'bg-chart-2/65'
    return 'bg-chart-2/85'
  }

  // Format hour for display
  const formatHour = (hour: number): string => {
    if (hour === 0) return '12a'
    if (hour < 12) return `${hour}a`
    if (hour === 12) return '12p'
    return `${hour - 12}p`
  }

  // Get cell value
  const getCellValue = (day: number, hour: number): number => {
    return dataMap.get(`${day}-${hour}`) || 0
  }

  // Find peak usage
  const peakInfo = useMemo(() => {
    if (data.length === 0) return null
    const peak = data.reduce((max, item) =>
      item.sessionCount > max.sessionCount ? item : max
    )
    return {
      day: DAYS[peak.dayOfWeek],
      hour: formatHour(peak.hour),
      count: peak.sessionCount,
    }
  }, [data])

  if (data.length === 0) {
    return (
      <div
        className={cn(
          'glass-surface rounded-xl p-5 flex items-center justify-center h-56',
          'text-muted-foreground text-sm',
          className
        )}
      >
        No usage data available
      </div>
    )
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn('glass-surface rounded-xl p-5', className)}
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold tracking-tight">Usage Heatmap</h3>
        {peakInfo && (
          <span className="text-xs text-muted-foreground font-medium">
            Peak:{' '}
            <span className="text-foreground">
              {peakInfo.day} {peakInfo.hour}
            </span>{' '}
            ({peakInfo.count} sessions)
          </span>
        )}
      </div>

      <TooltipProvider delayDuration={50}>
        <div className="overflow-x-auto">
          {/* Hour labels - show every 4 hours */}
          <div className="flex ml-9 mb-2">
            {HOURS.filter(h => h % 4 === 0).map(hour => (
              <div
                className="text-[10px] text-muted-foreground font-mono"
                key={hour}
                style={{ width: '56px' }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="space-y-1">
            {DAYS.map((day, dayIndex) => (
              <div className="flex items-center gap-1.5" key={day}>
                <span className="text-[10px] text-muted-foreground w-7 font-medium">
                  {day}
                </span>
                <div className="flex gap-0.5">
                  {HOURS.map(hour => {
                    const value = getCellValue(dayIndex, hour)
                    const isHovered =
                      hoveredCell?.day === dayIndex &&
                      hoveredCell?.hour === hour

                    return (
                      <Tooltip key={hour}>
                        <TooltipTrigger asChild>
                          <motion.button
                            className={cn(
                              'w-3.5 h-3.5 rounded cursor-pointer',
                              'transition-colors duration-150',
                              getColorStyle(value),
                              isHovered && 'ring-1 ring-foreground/40'
                            )}
                            onMouseEnter={() =>
                              setHoveredCell({ day: dayIndex, hour })
                            }
                            onMouseLeave={() => setHoveredCell(null)}
                            type="button"
                            whileHover={{ scale: 1.3 }}
                            whileTap={{ scale: 0.95 }}
                          />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs" side="top">
                          <p className="font-semibold">
                            {day} {formatHour(hour)}
                          </p>
                          <p className="text-muted-foreground">
                            {value} session{value !== 1 ? 's' : ''}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-2 mt-5 text-[10px] text-muted-foreground">
            <span className="font-medium">Less</span>
            <div className="flex gap-0.5">
              <div className="w-3.5 h-3.5 rounded bg-muted/20" />
              <div className="w-3.5 h-3.5 rounded bg-chart-2/25" />
              <div className="w-3.5 h-3.5 rounded bg-chart-2/45" />
              <div className="w-3.5 h-3.5 rounded bg-chart-2/65" />
              <div className="w-3.5 h-3.5 rounded bg-chart-2/85" />
            </div>
            <span className="font-medium">More</span>
          </div>
        </div>
      </TooltipProvider>
    </motion.div>
  )
}
