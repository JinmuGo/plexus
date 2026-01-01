/**
 * AI Settings Panel
 *
 * Configure API keys and settings for AI-powered features.
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Key } from 'lucide-react'
import { Button } from 'renderer/components/ui/button'
import { Input } from 'renderer/components/ui/input'
import { Badge } from 'renderer/components/ui/badge'
import type { AIProvider, AISettings } from 'shared/history-types'

const { App } = window

// AI provider options
const PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
  { value: 'claude', label: 'Claude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
]

export function AISettingsPanel() {
  // API Key settings
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('claude')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState<Record<AIProvider, boolean>>({
    claude: false,
    openai: false,
    gemini: false,
  })
  const [isSavingKey, setIsSavingKey] = useState(false)

  // AI Settings
  const [aiSettings, setAiSettings] = useState<AISettings>({
    maxOutputTokens: 8192,
    defaultProvider: null,
    groupingMode: 'exact',
    similarityThreshold: 0.8,
  })
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load API key status and settings
  const loadSettings = useCallback(async () => {
    try {
      const [claude, openai, gemini, settings] = await Promise.all([
        App.ai.hasApiKey('claude'),
        App.ai.hasApiKey('openai'),
        App.ai.hasApiKey('gemini'),
        App.ai.getSettings(),
      ])
      setHasKey({ claude, openai, gemini })
      setAiSettings(settings)
    } catch (error) {
      console.error('Failed to load AI settings:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Save API key
  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return

    setIsSavingKey(true)
    try {
      await App.ai.setApiKey(selectedProvider, apiKey.trim())
      setHasKey(prev => ({ ...prev, [selectedProvider]: true }))
      setApiKey('')
    } catch (err) {
      console.error('Failed to save API key:', err)
    } finally {
      setIsSavingKey(false)
    }
  }

  // Remove API key
  const handleRemoveApiKey = async (provider: AIProvider) => {
    await App.ai.removeApiKey(provider)
    setHasKey(prev => ({ ...prev, [provider]: false }))
  }

  // Save AI settings
  const handleSaveSettings = async () => {
    setIsSavingSettings(true)
    try {
      await App.ai.saveSettings(aiSettings)
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setIsSavingSettings(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading settings...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Provider Selection & API Key */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">API Keys</h4>
        </div>

        <div className="space-y-2">
          <label
            className="text-sm text-muted-foreground"
            htmlFor="provider-select"
          >
            Provider
          </label>
          <select
            className="w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm"
            id="provider-select"
            onChange={e => setSelectedProvider(e.target.value as AIProvider)}
            value={selectedProvider}
          >
            {PROVIDER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label} {hasKey[opt.value] ? '(Configured)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            className="text-sm text-muted-foreground"
            htmlFor="api-key-input"
          >
            API Key
          </label>
          <div className="flex gap-2">
            <Input
              id="api-key-input"
              onChange={e => setApiKey(e.target.value)}
              placeholder={
                hasKey[selectedProvider]
                  ? 'Key is configured (enter new to replace)'
                  : 'Enter API key...'
              }
              type="password"
              value={apiKey}
            />
            <Button
              disabled={!apiKey.trim() || isSavingKey}
              onClick={handleSaveApiKey}
            >
              {isSavingKey ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>

        {/* Configured Keys List */}
        <div className="space-y-1">
          {PROVIDER_OPTIONS.map(opt => (
            <div
              className="flex items-center justify-between py-1"
              key={opt.value}
            >
              <span className="text-sm">{opt.label}</span>
              {hasKey[opt.value] ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Active</Badge>
                  <Button
                    onClick={() => handleRemoveApiKey(opt.value)}
                    size="sm"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Not configured
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Generation Settings */}
      <div className="space-y-4 border-t pt-4">
        <h4 className="text-sm font-medium">Generation Settings</h4>

        <div className="space-y-2">
          <label
            className="text-sm text-muted-foreground"
            htmlFor="max-tokens-input"
          >
            Max Output Tokens
          </label>
          <div className="flex gap-2">
            <Input
              id="max-tokens-input"
              max={65536}
              min={1024}
              onChange={e =>
                setAiSettings(prev => ({
                  ...prev,
                  maxOutputTokens: Number.parseInt(e.target.value, 10) || 8192,
                }))
              }
              type="number"
              value={aiSettings.maxOutputTokens}
            />
            <Button
              disabled={isSavingSettings}
              onClick={handleSaveSettings}
              variant="outline"
            >
              {isSavingSettings ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Apply'
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Higher values allow longer responses but may increase latency.
          </p>
        </div>
      </div>
    </div>
  )
}
