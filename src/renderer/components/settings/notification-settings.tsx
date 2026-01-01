import { useEffect, useState, useCallback } from 'react'
import { Switch } from 'renderer/components/ui/switch'
import { Button } from 'renderer/components/ui/button'
import { Bell, BellOff, Volume2, VolumeX, RotateCcw } from 'lucide-react'
import type { NotificationSettings } from 'shared/notification-types'

interface SettingRowProps {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  icon?: React.ReactNode
}

function SettingRow({
  label,
  description,
  checked,
  onCheckedChange,
  icon,
}: SettingRowProps) {
  const id = `setting-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
        <div className="space-y-0.5">
          <label
            className="text-sm font-medium leading-none cursor-pointer"
            htmlFor={id}
          >
            {label}
          </label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} id={id} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loading, setLoading] = useState(true)

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loaded = await window.App.notifications.getSettings()
        setSettings(loaded)
      } catch (error) {
        console.error('Failed to load notification settings:', error)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  // Update a setting
  const updateSetting = useCallback(
    async <K extends keyof NotificationSettings>(
      key: K,
      value: NotificationSettings[K]
    ) => {
      if (!settings) return

      const newSettings = { ...settings, [key]: value }
      setSettings(newSettings)

      try {
        await window.App.notifications.saveSettings({ [key]: value })
      } catch (error) {
        console.error('Failed to save notification settings:', error)
        // Revert on error
        setSettings(settings)
      }
    },
    [settings]
  )

  // Reset to defaults
  const resetToDefaults = useCallback(async () => {
    try {
      await window.App.notifications.resetSettings()
      const loaded = await window.App.notifications.getSettings()
      setSettings(loaded)
    } catch (error) {
      console.error('Failed to reset notification settings:', error)
    }
  }, [])

  if (loading || !settings) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading settings...
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="divide-y divide-border">
        <SettingRow
          checked={settings.permissionRequest}
          description="Notify when an agent needs approval to run a tool"
          icon={<Bell className="h-4 w-4" />}
          label="Permission Requests"
          onCheckedChange={checked =>
            updateSetting('permissionRequest', checked)
          }
        />

        <SettingRow
          checked={settings.sessionEnded}
          description="Notify when an agent session ends"
          icon={<BellOff className="h-4 w-4" />}
          label="Session Ended"
          onCheckedChange={checked => updateSetting('sessionEnded', checked)}
        />

        <SettingRow
          checked={settings.sound}
          description="Play sound with notifications"
          icon={
            settings.sound ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )
          }
          label="Notification Sound"
          onCheckedChange={checked => updateSetting('sound', checked)}
        />

        <SettingRow
          checked={settings.showWhenFocused}
          description="Show notifications even when window is focused"
          icon={<Bell className="h-4 w-4" />}
          label="Show When Focused"
          onCheckedChange={checked => updateSetting('showWhenFocused', checked)}
        />
      </div>

      <div className="pt-4">
        <Button
          className="gap-2"
          onClick={resetToDefaults}
          size="sm"
          variant="outline"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to Defaults
        </Button>
      </div>
    </div>
  )
}
