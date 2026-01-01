/**
 * Settings View
 *
 * Full-page settings view with left navigation and right content panel.
 * Similar to History view layout.
 */

import { useState } from 'react'
import { Bell, Sparkles, Zap, ArrowLeft, Settings } from 'lucide-react'
import { Button } from 'renderer/components/ui/button'
import { ScrollArea } from 'renderer/components/ui/scroll-area'
import { cn } from 'renderer/lib/utils'
import { NotificationSettingsPanel } from './notification-settings'
import { AISettingsPanel } from './ai-settings'
import { IntegrationSettingsPanel } from './integration-settings'

type SettingsTab = 'notifications' | 'ai' | 'integrations'

interface NavItem {
  id: SettingsTab
  label: string
  icon: typeof Bell
  description: string
}

const navItems: NavItem[] = [
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    description: 'Configure alerts and sounds',
  },
  {
    id: 'ai',
    label: 'AI',
    icon: Sparkles,
    description: 'API keys and generation settings',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Zap,
    description: 'Connect Slack, Discord, etc.',
  },
]

export function SettingsView() {
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('notifications')

  const selectedNavItem = navItems.find(item => item.id === selectedTab)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your preferences and integrations
        </p>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Left Navigation - hidden on mobile when tab selected */}
        <div
          className={cn(
            'w-full md:w-64 border-r h-full min-h-0',
            selectedTab ? 'hidden md:block' : 'block'
          )}
        >
          <ScrollArea className="h-full">
            <nav className="p-2 space-y-1">
              {navItems.map(item => (
                <button
                  className={cn(
                    'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors',
                    selectedTab === item.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'hover:bg-muted text-foreground'
                  )}
                  key={item.id}
                  onClick={() => setSelectedTab(item.id)}
                  type="button"
                >
                  <item.icon className="w-5 h-5 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{item.label}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </div>
                  </div>
                </button>
              ))}
            </nav>
          </ScrollArea>
        </div>

        {/* Right Content Panel */}
        <div
          className={cn(
            'flex-1 h-full min-h-0 overflow-hidden',
            selectedTab ? 'block' : 'hidden md:block'
          )}
        >
          <div className="flex flex-col h-full overflow-hidden">
            {/* Mobile back button */}
            <div className="md:hidden border-b p-2">
              <Button
                className="gap-2"
                onClick={() => setSelectedTab('notifications')}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to settings
              </Button>
            </div>

            {/* Content Header */}
            <div className="p-4 border-b hidden md:block">
              <div className="flex items-center gap-2">
                {selectedNavItem && (
                  <>
                    <selectedNavItem.icon className="w-5 h-5 text-muted-foreground" />
                    <h2 className="font-semibold">{selectedNavItem.label}</h2>
                  </>
                )}
              </div>
              {selectedNavItem && (
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedNavItem.description}
                </p>
              )}
            </div>

            {/* Content */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 pb-8">
                {selectedTab === 'notifications' && (
                  <NotificationSettingsPanel />
                )}
                {selectedTab === 'ai' && <AISettingsPanel />}
                {selectedTab === 'integrations' && <IntegrationSettingsPanel />}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  )
}
