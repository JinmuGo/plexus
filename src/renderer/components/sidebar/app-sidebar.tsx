import {
  Sidebar,
  SidebarContent,
  SidebarRail,
} from 'renderer/components/ui/sidebar'
import { SidebarHeader } from './sidebar-header'
import { SidebarNav, type ViewMode } from './sidebar-nav'
import { SidebarFooter } from './sidebar-footer'

interface AppSidebarProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  approvalCount?: number
}

export function AppSidebar({
  viewMode,
  onViewModeChange,
  approvalCount = 0,
}: AppSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader />
      <SidebarContent>
        <SidebarNav
          approvalCount={approvalCount}
          onViewModeChange={onViewModeChange}
          viewMode={viewMode}
        />
      </SidebarContent>
      <SidebarFooter onViewModeChange={onViewModeChange} viewMode={viewMode} />
      <SidebarRail />
    </Sidebar>
  )
}
