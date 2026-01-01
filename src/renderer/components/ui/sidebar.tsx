import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { PanelLeft } from 'lucide-react'
import { cn } from 'renderer/lib/utils'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { Button } from './button'
import { Sheet, SheetContent, SheetTitle } from './sheet'

// Constants
const SIDEBAR_WIDTH_COLLAPSED = 48
const SIDEBAR_DEFAULT_WIDTH = 240
const SIDEBAR_MIN_WIDTH = SIDEBAR_WIDTH_COLLAPSED
const SIDEBAR_MAX_WIDTH = 400
const SIDEBAR_COLLAPSE_THRESHOLD = 120
const SIDEBAR_COOKIE_NAME = 'sidebar:state'
const SIDEBAR_WIDTH_COOKIE_NAME = 'sidebar:width'
const SIDEBAR_MOBILE_BREAKPOINT = 768

// Context types
interface SidebarContextValue {
  isOpen: boolean
  isCollapsed: boolean
  isMobile: boolean
  sidebarWidth: number
  isDragging: boolean
  toggle: () => void
  setOpen: (open: boolean) => void
  setCollapsed: (collapsed: boolean) => void
  startDrag: () => void
  onDrag: (clientX: number) => void
  endDrag: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}

// Provider
interface SidebarProviderProps {
  children: ReactNode
  defaultOpen?: boolean
  defaultCollapsed?: boolean
}

export function SidebarProvider({
  children,
  defaultOpen = true,
  defaultCollapsed = false,
}: SidebarProviderProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [isCollapsed, setIsCollapsedState] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_COOKIE_NAME)
      if (saved) {
        return saved === 'collapsed'
      }
    }
    return defaultCollapsed
  })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_WIDTH_COOKIE_NAME)
      if (saved) {
        const parsed = Number.parseInt(saved, 10)
        if (!Number.isNaN(parsed)) {
          return parsed
        }
      }
    }
    return SIDEBAR_DEFAULT_WIDTH
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Handle responsive breakpoint
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < SIDEBAR_MOBILE_BREAKPOINT)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const toggle = useCallback(() => {
    if (isMobile) {
      setIsOpen(prev => !prev)
    } else {
      setIsCollapsedState(prev => {
        const newState = !prev
        localStorage.setItem(
          SIDEBAR_COOKIE_NAME,
          newState ? 'collapsed' : 'expanded'
        )
        return newState
      })
    }
  }, [isMobile])

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open)
  }, [])

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed)
    localStorage.setItem(
      SIDEBAR_COOKIE_NAME,
      collapsed ? 'collapsed' : 'expanded'
    )
  }, [])

  const startDrag = useCallback(() => {
    setIsDragging(true)
    // Expand if collapsed when starting drag
    if (isCollapsed) {
      setIsCollapsedState(false)
      localStorage.setItem(SIDEBAR_COOKIE_NAME, 'expanded')
    }
  }, [isCollapsed])

  const onDrag = useCallback((clientX: number) => {
    const newWidth = Math.max(
      SIDEBAR_MIN_WIDTH,
      Math.min(SIDEBAR_MAX_WIDTH, clientX)
    )
    setSidebarWidth(newWidth)
  }, [])

  const endDrag = useCallback(() => {
    setIsDragging(false)
    // Auto-collapse if width is below threshold
    if (sidebarWidth < SIDEBAR_COLLAPSE_THRESHOLD) {
      setIsCollapsedState(true)
      localStorage.setItem(SIDEBAR_COOKIE_NAME, 'collapsed')
    } else {
      localStorage.setItem(SIDEBAR_WIDTH_COOKIE_NAME, String(sidebarWidth))
      localStorage.setItem(SIDEBAR_COOKIE_NAME, 'expanded')
    }
  }, [sidebarWidth])

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        isCollapsed,
        isMobile,
        sidebarWidth,
        isDragging,
        toggle,
        setOpen,
        setCollapsed,
        startDrag,
        onDrag,
        endDrag,
      }}
    >
      <div
        className="flex h-screen w-full overflow-hidden"
        style={
          {
            '--sidebar-width': `${sidebarWidth}px`,
            '--sidebar-width-collapsed': `${SIDEBAR_WIDTH_COLLAPSED}px`,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

// Sidebar component
interface SidebarProps {
  children: ReactNode
  className?: string
}

export function Sidebar({ children, className }: SidebarProps) {
  const { isOpen, isCollapsed, isMobile, sidebarWidth, isDragging, setOpen } =
    useSidebar()

  // Mobile: use Sheet
  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpen} open={isOpen}>
        <SheetContent
          aria-describedby={undefined}
          className="w-[280px] p-0 bg-sidebar border-sidebar-border [&>button]:hidden"
          side="left"
        >
          <VisuallyHidden.Root>
            <SheetTitle>Navigation Menu</SheetTitle>
          </VisuallyHidden.Root>
          <div className="flex flex-col h-full">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop: fixed sidebar with glassmorphism
  return (
    <aside
      className={cn(
        'relative flex flex-col h-screen',
        // Glass base for theme-aware styling
        'glass-base',
        // Border override for sidebar
        'border-0 border-r border-[var(--glass-border-medium)]',
        'shadow-[inset_-1px_0_0_0_var(--glass-inner-glow)]',
        // Transitions - disable during drag for smooth resize
        !isDragging && 'transition-[width] duration-200 ease-in-out',
        'shrink-0',
        className
      )}
      data-collapsed={isCollapsed}
      data-state={isCollapsed ? 'collapsed' : 'expanded'}
      style={{
        width: isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : sidebarWidth,
      }}
    >
      {children}
    </aside>
  )
}

// Sidebar Header
interface SidebarHeaderProps {
  children: ReactNode
  className?: string
}

export function SidebarHeader({ children, className }: SidebarHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-4',
        // Glass header - theme-aware
        'bg-[var(--glass-bg-1)]',
        'backdrop-blur-md',
        'border-b border-[var(--glass-border-subtle)]',
        className
      )}
    >
      {children}
    </div>
  )
}

// Sidebar Content
interface SidebarContentProps {
  children: ReactNode
  className?: string
}

export function SidebarContent({ children, className }: SidebarContentProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto py-2', className)}>
      {children}
    </div>
  )
}

// Sidebar Footer
interface SidebarFooterProps {
  children: ReactNode
  className?: string
}

export function SidebarFooter({ children, className }: SidebarFooterProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 mt-auto',
        // Glass footer - theme-aware
        'bg-[var(--glass-bg-1)]',
        'border-t border-[var(--glass-border-subtle)]',
        className
      )}
    >
      {children}
    </div>
  )
}

// Sidebar Group
interface SidebarGroupProps {
  children: ReactNode
  className?: string
}

export function SidebarGroup({ children, className }: SidebarGroupProps) {
  return <div className={cn('px-2 py-1', className)}>{children}</div>
}

// Sidebar Group Label
interface SidebarGroupLabelProps {
  children: ReactNode
  className?: string
}

export function SidebarGroupLabel({
  children,
  className,
}: SidebarGroupLabelProps) {
  const { isCollapsed, isMobile } = useSidebar()

  if (isCollapsed && !isMobile) {
    return null
  }

  return (
    <div
      className={cn(
        'px-2 py-1.5 text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wider',
        className
      )}
    >
      {children}
    </div>
  )
}

// Sidebar Menu
interface SidebarMenuProps {
  children: ReactNode
  className?: string
}

export function SidebarMenu({ children, className }: SidebarMenuProps) {
  return (
    <nav className={cn('flex flex-col gap-0.5', className)}>{children}</nav>
  )
}

// Sidebar Menu Item
interface SidebarMenuItemProps {
  children: ReactNode
  className?: string
}

export function SidebarMenuItem({ children, className }: SidebarMenuItemProps) {
  return <div className={cn('', className)}>{children}</div>
}

// Sidebar Menu Button
interface SidebarMenuButtonProps {
  children: ReactNode
  className?: string
  isActive?: boolean
  onClick?: () => void
  tooltip?: string
}

export function SidebarMenuButton({
  children,
  className,
  isActive,
  onClick,
  tooltip,
}: SidebarMenuButtonProps) {
  const { isCollapsed, isMobile, setOpen } = useSidebar()

  const handleClick = () => {
    onClick?.()
    // Close mobile sidebar on navigation
    if (isMobile) {
      setOpen(false)
    }
  }

  const button = (
    <button
      className={cn(
        'group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm',
        'transition-all duration-150 ease-out',
        'text-sidebar-foreground/80 hover:text-sidebar-foreground',
        'hover:bg-sidebar-accent/80',
        'active:scale-[0.98]',
        isActive && [
          'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
          'shadow-sm',
        ],
        isCollapsed && !isMobile && 'justify-center px-0',
        className
      )}
      onClick={handleClick}
      title={isCollapsed && !isMobile ? tooltip : undefined}
      type="button"
    >
      {children}
    </button>
  )

  return button
}

// Sidebar Menu Button Icon
interface SidebarMenuButtonIconProps {
  children: ReactNode
  className?: string
}

export function SidebarMenuButtonIcon({
  children,
  className,
}: SidebarMenuButtonIconProps) {
  return <span className={cn('shrink-0', className)}>{children}</span>
}

// Sidebar Menu Button Label
interface SidebarMenuButtonLabelProps {
  children: ReactNode
  className?: string
}

export function SidebarMenuButtonLabel({
  children,
  className,
}: SidebarMenuButtonLabelProps) {
  const { isCollapsed, isMobile } = useSidebar()

  if (isCollapsed && !isMobile) {
    return null
  }

  return <span className={cn('truncate', className)}>{children}</span>
}

// Sidebar Trigger (hamburger/toggle button)
interface SidebarTriggerProps {
  className?: string
}

export function SidebarTrigger({ className }: SidebarTriggerProps) {
  const { toggle } = useSidebar()

  return (
    <Button
      className={cn('size-8', className)}
      onClick={toggle}
      size="icon"
      variant="ghost"
    >
      <PanelLeft className="size-4" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  )
}

// Sidebar Inset (main content wrapper)
interface SidebarInsetProps {
  children: ReactNode
  className?: string
}

export function SidebarInset({ children, className }: SidebarInsetProps) {
  return (
    <main
      className={cn('flex-1 flex flex-col h-full overflow-hidden', className)}
    >
      {children}
    </main>
  )
}

// Sidebar Rail (draggable resize handle for desktop)
interface SidebarRailProps {
  className?: string
}

export function SidebarRail({ className }: SidebarRailProps) {
  const { isMobile, isDragging, sidebarWidth, startDrag, onDrag, endDrag } =
    useSidebar()

  // Calculate percentage for aria-valuenow (0-100 range)
  const valueNow = Math.round(
    ((sidebarWidth - SIDEBAR_MIN_WIDTH) /
      (SIDEBAR_MAX_WIDTH - SIDEBAR_MIN_WIDTH)) *
      100
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      onDrag(e.clientX)
    }

    const handleMouseUp = () => {
      endDrag()
    }

    // Prevent text selection during drag
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ew-resize'

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, onDrag, endDrag])

  if (isMobile) {
    return null
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    startDrag()
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: Custom drag handle needs div for styling
    <div
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={valueNow}
      className={cn(
        'absolute -right-1 top-0 h-full w-3 cursor-ew-resize',
        'hover:bg-sidebar-border/50 transition-colors',
        isDragging && 'bg-sidebar-border/70',
        className
      )}
      onMouseDown={handleMouseDown}
      role="separator"
      tabIndex={0}
      title="Drag to resize sidebar"
    />
  )
}
