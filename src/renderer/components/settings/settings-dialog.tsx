/**
 * Unified Settings Dialog
 *
 * Combines all application settings in one place with tabbed navigation.
 */

import { useState } from 'react'
import { Settings, Bell, Sparkles, Zap } from 'lucide-react'
import { Button } from 'renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from 'renderer/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from 'renderer/components/ui/tabs'
import { NotificationSettingsPanel } from './notification-settings'
import { AISettingsPanel } from './ai-settings'
import { IntegrationSettingsPanel } from './integration-settings'

type SettingsTab = 'notifications' | 'ai' | 'integrations'

interface SettingsDialogProps {
  /** Default tab to open */
  defaultTab?: SettingsTab
  /** Trigger element (optional - provides default button if not specified) */
  trigger?: React.ReactNode
  /** Controlled open state */
  open?: boolean
  /** Controlled open state handler */
  onOpenChange?: (open: boolean) => void
}

export function SettingsDialog({
  defaultTab = 'notifications',
  trigger,
  open,
  onOpenChange,
}: SettingsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)

  // Use controlled or uncontrolled mode
  const isOpen = open !== undefined ? open : internalOpen
  const setIsOpen = onOpenChange || setInternalOpen

  const defaultTrigger = (
    <Button className="h-9 w-9" size="icon" variant="ghost">
      <Settings className="h-4 w-4" />
      <span className="sr-only">Settings</span>
    </Button>
  )

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs className="mt-2" defaultValue={defaultTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger className="gap-2" value="notifications">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger className="gap-2" value="ai">
              <Sparkles className="h-4 w-4" />
              AI
            </TabsTrigger>
            <TabsTrigger className="gap-2" value="integrations">
              <Zap className="h-4 w-4" />
              Integrations
            </TabsTrigger>
          </TabsList>

          <div className="grid mt-4">
            <TabsContent
              className="col-start-1 row-start-1 data-[state=inactive]:invisible"
              forceMount
              value="notifications"
            >
              <NotificationSettingsPanel />
            </TabsContent>

            <TabsContent
              className="col-start-1 row-start-1 data-[state=inactive]:invisible"
              forceMount
              value="ai"
            >
              <AISettingsPanel />
            </TabsContent>

            <TabsContent
              className="col-start-1 row-start-1 data-[state=inactive]:invisible"
              forceMount
              value="integrations"
            >
              <IntegrationSettingsPanel />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// Export a hook for controlling the dialog externally
export function useSettingsDialog() {
  const [open, setOpen] = useState(false)
  const [defaultTab, setDefaultTab] = useState<SettingsTab>('notifications')

  const openSettings = (tab: SettingsTab = 'notifications') => {
    setDefaultTab(tab)
    setOpen(true)
  }

  const closeSettings = () => {
    setOpen(false)
  }

  return {
    open,
    defaultTab,
    setOpen,
    openSettings,
    closeSettings,
  }
}
