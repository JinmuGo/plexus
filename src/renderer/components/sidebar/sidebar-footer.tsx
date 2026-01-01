import { Settings } from 'lucide-react'
import { ThemeToggle } from 'renderer/components/ui/theme-toggle'
import {
  SidebarFooter as SidebarFooterBase,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuButtonIcon,
  SidebarMenuButtonLabel,
  useSidebar,
} from 'renderer/components/ui/sidebar'
import type { ViewMode } from './sidebar-nav'

interface SidebarFooterProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function SidebarFooter({
  viewMode,
  onViewModeChange,
}: SidebarFooterProps) {
  const { isCollapsed, isMobile } = useSidebar()
  const showLabels = !isCollapsed || isMobile

  return (
    <SidebarFooterBase className="flex-col gap-0 p-0">
      <SidebarGroup className="py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={viewMode === 'settings'}
              onClick={() => onViewModeChange('settings')}
              tooltip="Settings (⌘,)"
            >
              <SidebarMenuButtonIcon>
                <Settings className="size-4" />
              </SidebarMenuButtonIcon>
              <SidebarMenuButtonLabel>Settings</SidebarMenuButtonLabel>
              {showLabels && (
                <kbd className="ml-auto pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
                  ⌘,
                </kbd>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      {/* Theme toggle in a separate section */}
      <div className="border-t border-border/50 px-3 py-3">
        {showLabels ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
        ) : (
          <div className="flex justify-center">
            <ThemeToggle />
          </div>
        )}
      </div>
    </SidebarFooterBase>
  )
}
