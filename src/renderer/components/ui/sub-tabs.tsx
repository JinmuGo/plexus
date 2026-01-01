/**
 * SubTabs Component
 *
 * Reusable sub-tab navigation for view switching within a main tab.
 * Uses the same visual language as SidebarNav - Framer Motion layoutId
 * for smooth sliding indicator animation.
 */

import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from 'renderer/lib/utils'

export interface SubTab<T extends string> {
  id: T
  label: string
  icon: LucideIcon
}

interface SubTabsProps<T extends string> {
  tabs: SubTab<T>[]
  value: T
  onChange: (value: T) => void
  /** Unique ID for layoutId animation (required when multiple SubTabs on same page) */
  layoutId?: string
}

export function SubTabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId = 'subTabIndicator',
}: SubTabsProps<T>) {
  return (
    <div className="inline-flex items-center gap-1">
      {tabs.map(tab => {
        const isActive = value === tab.id
        return (
          <button
            className={cn(
              'relative flex items-center gap-2 rounded-lg px-3 py-2 text-base transition-colors duration-200',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80'
            )}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            {/* Active indicator - matches SidebarNav style */}
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-lg bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30"
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}

            <tab.icon
              className={cn(
                'relative z-10 h-4 w-4 transition-colors duration-200',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            />
            <span
              className={cn(
                'relative z-10 transition-colors duration-200',
                isActive && 'font-medium'
              )}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
