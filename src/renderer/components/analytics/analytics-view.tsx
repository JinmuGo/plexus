/**
 * Analytics View
 *
 * Main analytics dashboard with Cost and Statistics tabs.
 */

import { useState, useMemo, useCallback } from 'react'
import { DollarSign, BarChart3 } from 'lucide-react'
import { SubTabs, type SubTab } from 'renderer/components/ui/sub-tabs'
import { CostView } from './cost-view'
import { StatisticsView } from './statistics-view'
import { useScopedShortcuts } from 'renderer/lib/keyboard'
import type { AnalyticsViewMode } from 'shared/ui-types'

const ANALYTICS_TABS: SubTab<AnalyticsViewMode>[] = [
  { id: 'cost', label: 'Cost', icon: DollarSign },
  { id: 'statistics', label: 'Statistics', icon: BarChart3 },
]

export function AnalyticsView() {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('cost')

  const cycleViewMode = useCallback(() => {
    const modes: AnalyticsViewMode[] = ['cost', 'statistics']
    const currentIdx = modes.indexOf(viewMode)
    setViewMode(modes[(currentIdx + 1) % modes.length])
  }, [viewMode])

  const cycleViewModeReverse = useCallback(() => {
    const modes: AnalyticsViewMode[] = ['cost', 'statistics']
    const currentIdx = modes.indexOf(viewMode)
    setViewMode(modes[(currentIdx - 1 + modes.length) % modes.length])
  }, [viewMode])

  // Register keyboard shortcuts
  useScopedShortcuts(
    'analytics',
    useMemo(
      () => [
        {
          id: 'analytics.tab',
          key: 'Tab',
          action: cycleViewMode,
          description: 'Next tab',
          category: 'navigation' as const,
        },
        {
          id: 'analytics.tabReverse',
          key: 'Tab',
          modifiers: ['shift'],
          action: cycleViewModeReverse,
          description: 'Previous tab',
          category: 'navigation' as const,
          displayKey: 'Shift+Tab',
        },
      ],
      [cycleViewMode, cycleViewModeReverse]
    )
  )

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="border-b px-4 py-2">
        <SubTabs
          layoutId="analyticsSubTabs"
          onChange={setViewMode}
          tabs={ANALYTICS_TABS}
          value={viewMode}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {viewMode === 'cost' && <CostView />}
        {viewMode === 'statistics' && <StatisticsView />}
      </div>
    </div>
  )
}
