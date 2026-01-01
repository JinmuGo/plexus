import { Logo } from 'renderer/components/logo'
import {
  SidebarHeader as SidebarHeaderBase,
  useSidebar,
} from 'renderer/components/ui/sidebar'

export function SidebarHeader() {
  const { isCollapsed, isMobile } = useSidebar()
  const showTitle = !isCollapsed || isMobile

  return (
    <SidebarHeaderBase className="h-14">
      <div className="flex items-center gap-2.5">
        <Logo className="text-sidebar-foreground shrink-0" size={28} />
        {showTitle && (
          <span className="font-semibold text-sidebar-foreground tracking-tight">
            Plexus
          </span>
        )}
      </div>
    </SidebarHeaderBase>
  )
}
