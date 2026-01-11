import { type Monitor, Zap, BarChart3, History } from 'lucide-react'
import { motion } from 'framer-motion'
import { Badge } from 'renderer/components/ui/badge'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuButtonIcon,
  SidebarMenuButtonLabel,
  useSidebar,
} from 'renderer/components/ui/sidebar'
import { cn } from 'renderer/lib/utils'
import type { ViewMode } from 'shared/ui-types'

// Re-export for backwards compatibility
export type { ViewMode } from 'shared/ui-types'

interface NavItem {
  id: Exclude<ViewMode, 'settings'>
  label: string
  icon: typeof Monitor
  shortcut: string
  color: string // Raycast style - each nav item has accent color
}

const navItems: NavItem[] = [
  {
    id: 'sessions',
    label: 'Sessions',
    icon: Zap,
    shortcut: 'vs',
    color: 'text-status-active',
  },
  {
    id: 'history',
    label: 'History',
    icon: History,
    shortcut: 'vh',
    color: 'text-primary',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    shortcut: 'va',
    color: 'text-status-waiting',
  },
]

interface SidebarNavProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  approvalCount?: number
}

export function SidebarNav({
  viewMode,
  onViewModeChange,
  approvalCount = 0,
}: SidebarNavProps) {
  const { isCollapsed, isMobile } = useSidebar()
  const showLabels = !isCollapsed || isMobile

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarMenu>
        {navItems.map(item => {
          const isActive = viewMode === item.id
          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                className={cn(
                  'relative transition-all duration-200',
                  isActive && 'bg-primary/15'
                )}
                isActive={isActive}
                onClick={() => onViewModeChange(item.id)}
                tooltip={`${item.label} (${item.shortcut})`}
              >
                {/* Active indicator - solid background for better contrast */}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-lg bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/30"
                    layoutId="activeNavIndicator"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}

                <SidebarMenuButtonIcon>
                  <item.icon
                    className={cn(
                      'size-4 transition-colors duration-200 relative z-10',
                      isActive ? item.color : 'text-muted-foreground'
                    )}
                  />
                </SidebarMenuButtonIcon>
                <SidebarMenuButtonLabel
                  className={cn(
                    'transition-colors duration-200 relative z-10',
                    isActive && 'font-semibold text-foreground'
                  )}
                >
                  {item.label}
                </SidebarMenuButtonLabel>

                {/* Show approval badge on Sessions with pulse animation */}
                {item.id === 'sessions' && approvalCount > 0 && showLabels && (
                  <Badge
                    className="ml-auto text-xs px-1.5 py-0 font-bold"
                    variant="approval"
                  >
                    {approvalCount}
                  </Badge>
                )}

                {/* Keyboard shortcut badge - refined styling */}
                {showLabels &&
                  !(item.id === 'sessions' && approvalCount > 0) && (
                    <kbd
                      className={cn(
                        'ml-auto pointer-events-none hidden h-5 select-none items-center gap-1',
                        'rounded bg-surface-2 border border-border/50',
                        'px-1.5 font-mono text-[10px] font-medium text-muted-foreground',
                        'sm:flex transition-opacity duration-200',
                        isActive && 'opacity-70'
                      )}
                    >
                      {item.shortcut}
                    </kbd>
                  )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
