/**
 * TrendCard - Displays a metric with week-over-week comparison
 *
 * Shows the current value and percentage change from the previous period.
 * Uses glassmorphism and refined industrial design.
 */

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from 'renderer/lib/utils'

interface TrendCardProps {
  title: string
  value: string | number
  change: number // percentage change
  icon: React.ReactNode
  period?: string
  className?: string
  index?: number // For staggered animation
}

export function TrendCard({
  title,
  value,
  change,
  icon,
  period = 'vs last week',
  className = '',
  index = 0,
}: TrendCardProps) {
  // Format the change badge
  const formatChange = (val: number): string => {
    const sign = val > 0 ? '+' : ''
    return `${sign}${val.toFixed(0)}%`
  }

  // Determine trend direction and styling
  const getTrendInfo = (
    val: number
  ): { icon: React.ReactNode; badgeClass: string; textClass: string } => {
    if (Math.abs(val) < 1) {
      return {
        icon: <Minus className="w-3 h-3" />,
        badgeClass: 'bg-muted/60 text-muted-foreground',
        textClass: 'text-muted-foreground',
      }
    }
    if (val > 0) {
      return {
        icon: <TrendingUp className="w-3 h-3" />,
        badgeClass: 'bg-chart-2/15 text-chart-2',
        textClass: 'text-chart-2',
      }
    }
    return {
      icon: <TrendingDown className="w-3 h-3" />,
      badgeClass: 'bg-chart-5/15 text-chart-5',
      textClass: 'text-chart-5',
    }
  }

  const trendInfo = getTrendInfo(change)

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'glass-base rounded-xl p-4',
        'group hover:bg-[var(--glass-bg-2)] transition-all duration-200',
        className
      )}
      initial={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      {/* Icon + Title */}
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        <div className="text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
          {icon}
        </div>
        <span className="text-xs font-medium tracking-wide uppercase">
          {title}
        </span>
      </div>

      {/* Value + Trend */}
      <div className="flex items-end justify-between gap-2">
        <motion.div
          animate={{ scale: 1 }}
          className="text-2xl font-semibold tracking-tight"
          initial={{ scale: 0.95 }}
          transition={{ duration: 0.2, delay: index * 0.05 + 0.1 }}
        >
          {value}
        </motion.div>

        {/* Trend badge */}
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
            trendInfo.badgeClass
          )}
          initial={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.2, delay: index * 0.05 + 0.15 }}
        >
          {trendInfo.icon}
          <span>{formatChange(change)}</span>
        </motion.div>
      </div>

      {/* Period label */}
      <p className="text-[10px] text-muted-foreground/70 mt-2 font-medium">
        {period}
      </p>
    </motion.div>
  )
}

/**
 * TrendCardGrid - A grid of trend cards for productivity metrics
 */
interface TrendCardGridProps {
  cards: Array<{
    title: string
    value: string | number
    change: number
    icon: React.ReactNode
  }>
  className?: string
}

export function TrendCardGrid({ cards, className = '' }: TrendCardGridProps) {
  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3', className)}>
      {cards.map((card, index) => (
        <TrendCard
          change={card.change}
          icon={card.icon}
          index={index}
          key={card.title}
          title={card.title}
          value={card.value}
        />
      ))}
    </div>
  )
}
