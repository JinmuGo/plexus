/**
 * Integration Settings Component
 *
 * Simple webhook configuration for Slack and Discord.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card } from 'renderer/components/ui/card'
import { Button } from 'renderer/components/ui/button'
import { Badge } from 'renderer/components/ui/badge'
import {
  MessageSquare,
  Check,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Hash,
} from 'lucide-react'
import type { IntegrationSettings } from 'shared/integration-types'
import {
  isValidSlackWebhookUrl,
  isValidDiscordWebhookUrl,
} from 'shared/integration-types'
import { devLog } from 'renderer/lib/logger'

const { App } = window

/**
 * Slack webhook configuration card
 */
function SlackWebhookCard() {
  const [settings, setSettings] = useState<IntegrationSettings | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [label, setLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testSuccess, setTestSuccess] = useState(false)

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loaded = await App.integrations.getSettings()
        setSettings(loaded)
        setWebhookUrl(loaded.slack.webhookUrl || '')
        setLabel(loaded.slack.label || '')
      } catch (err) {
        devLog.error('Failed to load integration settings:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const handleSave = useCallback(async () => {
    if (webhookUrl && !isValidSlackWebhookUrl(webhookUrl)) {
      setError('Invalid Slack webhook URL format')
      return
    }

    try {
      await App.integrations.saveSettings({
        slack: {
          enabled: !!webhookUrl,
          webhookUrl: webhookUrl || undefined,
          label: label || undefined,
          lastError: undefined,
        },
      })
      const updated = await App.integrations.getSettings()
      setSettings(updated)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }, [webhookUrl, label])

  const handleTest = useCallback(async () => {
    if (!webhookUrl) {
      setError('Enter a webhook URL first')
      return
    }

    if (!isValidSlackWebhookUrl(webhookUrl)) {
      setError('Invalid Slack webhook URL format')
      return
    }

    setTesting(true)
    setError(null)
    setTestSuccess(false)

    try {
      const success = await App.integrations.testSlackWebhook(webhookUrl)
      if (success) {
        setTestSuccess(true)
        // Save on successful test
        await handleSave()
        setTimeout(() => setTestSuccess(false), 3000)
      } else {
        setError('Webhook test failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }, [webhookUrl, handleSave])

  const handleDisable = useCallback(async () => {
    try {
      await App.integrations.saveSettings({
        slack: {
          enabled: false,
          webhookUrl: undefined,
          label: undefined,
          lastError: undefined,
        },
      })
      setWebhookUrl('')
      setLabel('')
      const updated = await App.integrations.getSettings()
      setSettings(updated)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable')
    }
  }, [])

  if (loading) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </Card>
    )
  }

  const isEnabled = settings?.slack.enabled && settings?.slack.webhookUrl

  return (
    <Card className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#4A154B]/10">
            <Hash className="h-5 w-5 text-[#4A154B]" />
          </div>
          <div>
            <h3 className="font-medium">Slack</h3>
            <p className="text-xs text-muted-foreground">
              Send notifications via Incoming Webhook
            </p>
          </div>
        </div>
        <Badge variant={isEnabled ? 'success' : 'secondary'}>
          {isEnabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>

      {/* Error/Success message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {testSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <Check className="h-4 w-4" />
          Test message sent successfully!
        </div>
      )}

      {/* Setup instructions */}
      <div className="text-sm text-muted-foreground">
        <a
          className="text-primary hover:underline inline-flex items-center gap-1"
          href="https://api.slack.com/messaging/webhooks"
          rel="noopener noreferrer"
          target="_blank"
        >
          Create an Incoming Webhook
          <ExternalLink className="h-3 w-3" />
        </a>{' '}
        in your Slack workspace
      </div>

      {/* Webhook URL input */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="slack-webhook-url">
          Webhook URL
        </label>
        <input
          className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-md font-mono"
          id="slack-webhook-url"
          onChange={e => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/T00/B00/xxx"
          type="url"
          value={webhookUrl}
        />
      </div>

      {/* Label input */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="slack-label">
          Label (optional)
        </label>
        <input
          className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-md"
          id="slack-label"
          onChange={e => setLabel(e.target.value)}
          placeholder="#dev-alerts"
          type="text"
          value={label}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          className="gap-2"
          disabled={testing || !webhookUrl}
          onClick={handleTest}
          size="sm"
        >
          {testing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Test & Save
        </Button>
        {isEnabled && (
          <Button
            className="gap-2"
            onClick={handleDisable}
            size="sm"
            variant="outline"
          >
            Disable
          </Button>
        )}
      </div>
    </Card>
  )
}

/**
 * Discord webhook configuration card
 */
function DiscordWebhookCard() {
  const [settings, setSettings] = useState<IntegrationSettings | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [label, setLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testSuccess, setTestSuccess] = useState(false)

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loaded = await App.integrations.getSettings()
        setSettings(loaded)
        setWebhookUrl(loaded.discord.webhookUrl || '')
        setLabel(loaded.discord.label || '')
      } catch (err) {
        devLog.error('Failed to load integration settings:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const handleSave = useCallback(async () => {
    if (webhookUrl && !isValidDiscordWebhookUrl(webhookUrl)) {
      setError('Invalid Discord webhook URL format')
      return
    }

    try {
      await App.integrations.saveSettings({
        discord: {
          enabled: !!webhookUrl,
          webhookUrl: webhookUrl || undefined,
          label: label || undefined,
          lastError: undefined,
        },
      })
      const updated = await App.integrations.getSettings()
      setSettings(updated)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }, [webhookUrl, label])

  const handleTest = useCallback(async () => {
    if (!webhookUrl) {
      setError('Enter a webhook URL first')
      return
    }

    if (!isValidDiscordWebhookUrl(webhookUrl)) {
      setError('Invalid Discord webhook URL format')
      return
    }

    setTesting(true)
    setError(null)
    setTestSuccess(false)

    try {
      const success = await App.integrations.testDiscordWebhook(webhookUrl)
      if (success) {
        setTestSuccess(true)
        // Save on successful test
        await handleSave()
        setTimeout(() => setTestSuccess(false), 3000)
      } else {
        setError('Webhook test failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }, [webhookUrl, handleSave])

  const handleDisable = useCallback(async () => {
    try {
      await App.integrations.saveSettings({
        discord: {
          enabled: false,
          webhookUrl: undefined,
          label: undefined,
          lastError: undefined,
        },
      })
      setWebhookUrl('')
      setLabel('')
      const updated = await App.integrations.getSettings()
      setSettings(updated)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable')
    }
  }, [])

  if (loading) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </Card>
    )
  }

  const isEnabled = settings?.discord.enabled && settings?.discord.webhookUrl

  return (
    <Card className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10">
            <MessageSquare className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <h3 className="font-medium">Discord</h3>
            <p className="text-xs text-muted-foreground">
              Send notifications via Webhook
            </p>
          </div>
        </div>
        <Badge variant={isEnabled ? 'success' : 'secondary'}>
          {isEnabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>

      {/* Error/Success message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {testSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <Check className="h-4 w-4" />
          Test message sent successfully!
        </div>
      )}

      {/* Setup instructions */}
      <div className="text-sm text-muted-foreground">
        <a
          className="text-primary hover:underline inline-flex items-center gap-1"
          href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
          rel="noopener noreferrer"
          target="_blank"
        >
          Create a Webhook
          <ExternalLink className="h-3 w-3" />
        </a>{' '}
        in your Discord channel settings
      </div>

      {/* Webhook URL input */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="discord-webhook-url">
          Webhook URL
        </label>
        <input
          className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-md font-mono"
          id="discord-webhook-url"
          onChange={e => setWebhookUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/xxx/yyy"
          type="url"
          value={webhookUrl}
        />
      </div>

      {/* Label input */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="discord-label">
          Label (optional)
        </label>
        <input
          className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-md"
          id="discord-label"
          onChange={e => setLabel(e.target.value)}
          placeholder="#alerts"
          type="text"
          value={label}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          className="gap-2"
          disabled={testing || !webhookUrl}
          onClick={handleTest}
          size="sm"
        >
          {testing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Test & Save
        </Button>
        {isEnabled && (
          <Button
            className="gap-2"
            onClick={handleDisable}
            size="sm"
            variant="outline"
          >
            Disable
          </Button>
        )}
      </div>
    </Card>
  )
}

/**
 * Integration settings panel
 */
export function IntegrationSettingsPanel() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Receive notifications in external channels
        </p>
      </div>

      <SlackWebhookCard />
      <DiscordWebhookCard />

      <p className="text-xs text-muted-foreground">
        Webhook URLs are stored locally. Notifications are one-way only.
      </p>
    </div>
  )
}
