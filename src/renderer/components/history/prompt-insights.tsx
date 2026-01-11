/**
 * Prompt Insights Component
 *
 * Displays frequently used prompts and allows AI-powered improvement.
 * Uses progressive loading: curated prompts show instantly, user prompts load async.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Lightbulb,
  Copy,
  Check,
  Loader2,
  Sparkles,
  MessageSquare,
  Clock,
  Bookmark,
  Trash2,
  Save,
  ChevronDown,
  ChevronRight,
  Terminal,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from 'renderer/components/ui/button'
import { ScrollArea } from 'renderer/components/ui/scroll-area'
import { Card, CardContent } from 'renderer/components/ui/card'
import { Badge } from 'renderer/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from 'renderer/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from 'renderer/components/ui/tabs'
import { SettingsDialog, useSettingsDialog } from 'renderer/components/settings'
import { SlashCommandDialog } from './slash-command-dialog'
import { CURATED_PROMPTS } from 'shared/curated-prompts'
import type {
  EnhancedPromptGroup,
  AIProvider,
  PromptImprovement,
  SavedPrompt,
} from 'shared/history-types'
import type { AgentType } from 'shared/hook-types'
import { devLog } from 'renderer/lib/logger'

const { App } = window

// Agent filter options
const AGENT_OPTIONS: Array<{ value: AgentType | 'all'; label: string }> = [
  { value: 'all', label: 'All Agents' },
  { value: 'claude', label: 'Claude' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'gemini', label: 'Gemini' },
]

// Debounce delay for filter changes
const FILTER_DEBOUNCE_MS = 300

export function PromptInsights() {
  // Settings dialog
  const settingsDialog = useSettingsDialog()

  // Progressive loading: curated prompts are instant, user prompts load async
  const curatedPrompts = useMemo((): EnhancedPromptGroup[] => {
    return CURATED_PROMPTS.map(curated => ({
      representative: curated.content,
      variants: [{ content: curated.content, count: 0 }],
      totalCount: 0,
      agents: curated.recommendedAgents,
      lastUsed: 0,
      groupedBy: 'exact' as const,
      isCurated: true,
      curatedId: curated.id,
      category: curated.category,
      priority: curated.priority,
    }))
  }, [])

  // User prompts state (loaded async)
  const [userPrompts, setUserPrompts] = useState<EnhancedPromptGroup[]>([])
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([])
  const [isLoadingUser, setIsLoadingUser] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentFilter, setAgentFilter] = useState<AgentType | 'all'>('all')
  const [activeTab, setActiveTab] = useState<'frequent' | 'saved'>('frequent')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Debounce timer ref
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // API Key status (for feature availability)
  const [hasKey, setHasKey] = useState<Record<AIProvider, boolean>>({
    claude: false,
    openai: false,
    gemini: false,
  })

  // Improvement dialog
  const [improvingPrompt, setImprovingPrompt] = useState<string | null>(null)
  const [improvement, setImprovement] = useState<PromptImprovement | null>(null)
  const [isImproving, setIsImproving] = useState(false)
  const [improvementError, setImprovementError] = useState<string | null>(null)
  const [isSavingPrompt, setIsSavingPrompt] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)

  // Slash command dialog
  const [commandDialogOpen, setCommandDialogOpen] = useState(false)
  const [commandPrompt, setCommandPrompt] = useState('')

  // Handle save as slash command
  const handleSaveAsCommand = useCallback((prompt: string) => {
    setCommandPrompt(prompt)
    setCommandDialogOpen(true)
  }, [])

  // Filter curated prompts by agent
  const filteredCuratedPrompts = useMemo(() => {
    if (agentFilter === 'all') return curatedPrompts
    return curatedPrompts.filter(p => p.agents.includes(agentFilter))
  }, [curatedPrompts, agentFilter])

  // Combined prompts for display (curated first, then user)
  const enhancedPrompts = useMemo(() => {
    return [...filteredCuratedPrompts, ...userPrompts]
  }, [filteredCuratedPrompts, userPrompts])

  // Load user prompts only (curated are already available)
  const loadUserPrompts = useCallback(async (filter: AgentType | 'all') => {
    setIsLoadingUser(true)
    setError(null)
    try {
      const result = await App.history.getEnhancedPrompts(
        30, // days
        3, // min count (show prompts used 3+ times)
        filter === 'all' ? undefined : filter,
        true // include user prompts
      )
      // Filter out curated prompts (they're already displayed)
      const userOnly = result.filter(p => !p.isCurated)
      setUserPrompts(userOnly)
    } catch (err) {
      devLog.error('Failed to load user prompts:', err)
      setError('Failed to load prompts')
    } finally {
      setIsLoadingUser(false)
    }
  }, [])

  // Debounced filter change handler
  const handleFilterChange = useCallback(
    (newFilter: AgentType | 'all') => {
      setAgentFilter(newFilter)

      // Clear existing debounce timer
      if (filterDebounceRef.current) {
        clearTimeout(filterDebounceRef.current)
      }

      // Debounce the API call
      filterDebounceRef.current = setTimeout(() => {
        loadUserPrompts(newFilter)
      }, FILTER_DEBOUNCE_MS)
    },
    [loadUserPrompts]
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (filterDebounceRef.current) {
        clearTimeout(filterDebounceRef.current)
      }
    }
  }, [])

  // Load saved prompts
  const loadSavedPrompts = useCallback(async () => {
    try {
      const result = await App.ai.getSavedPrompts()
      setSavedPrompts(result)
    } catch (err) {
      devLog.error('Failed to load saved prompts:', err)
    }
  }, [])

  // Load API key status
  const loadApiKeyStatus = useCallback(async () => {
    const [claude, openai, gemini] = await Promise.all([
      App.ai.hasApiKey('claude'),
      App.ai.hasApiKey('openai'),
      App.ai.hasApiKey('gemini'),
    ])
    setHasKey({ claude, openai, gemini })
  }, [])

  // Initial load: user prompts load async (curated already available)
  useEffect(() => {
    loadUserPrompts(agentFilter)
    loadSavedPrompts()
    loadApiKeyStatus()
    // Only run on mount - agentFilter changes handled by handleFilterChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Improve prompt
  const handleImprove = async (prompt: string) => {
    // Find a provider with an API key
    const provider = (['claude', 'openai', 'gemini'] as AIProvider[]).find(
      p => hasKey[p]
    )

    if (!provider) {
      settingsDialog.openSettings('ai')
      return
    }

    setImprovingPrompt(prompt)
    setImprovement(null)
    setImprovementError(null)
    setIsImproving(true)
    setPromptSaved(false)

    try {
      const result = await App.ai.improvePrompt(prompt, provider)
      setImprovement(result)
    } catch (err) {
      devLog.error('Failed to improve prompt:', err)
      setImprovementError(
        err instanceof Error ? err.message : 'Failed to improve prompt'
      )
    } finally {
      setIsImproving(false)
    }
  }

  // Copy to clipboard
  const handleCopy = async () => {
    if (!improvement?.improved) return

    try {
      await navigator.clipboard.writeText(improvement.improved)
      toast.success('Copied to clipboard')
    } catch (err) {
      devLog.error('Failed to copy:', err)
      toast.error('Failed to copy')
    }
  }

  // Save improved prompt
  const handleSavePrompt = async () => {
    if (!improvement) return

    setIsSavingPrompt(true)
    try {
      await App.ai.savePrompt(improvement)
      setPromptSaved(true)
      loadSavedPrompts()
      toast.success('Prompt saved')
    } catch (err) {
      devLog.error('Failed to save prompt:', err)
      toast.error('Failed to save prompt')
    } finally {
      setIsSavingPrompt(false)
    }
  }

  // Delete saved prompt
  const handleDeleteSavedPrompt = async (id: string) => {
    try {
      await App.ai.deleteSavedPrompt(id)
      setSavedPrompts(prev => prev.filter(p => p.id !== id))
      toast.success('Prompt deleted')
    } catch (err) {
      devLog.error('Failed to delete prompt:', err)
      toast.error('Failed to delete prompt')
    }
  }

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    return `${Math.floor(days / 30)} months ago`
  }

  // Get configured provider count
  const configuredProviders = Object.values(hasKey).filter(Boolean).length

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold">Prompt Insights</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Agent Filter */}
          <select
            className="h-9 rounded-md border bg-transparent px-3 py-1 text-sm"
            onChange={e =>
              handleFilterChange(e.target.value as AgentType | 'all')
            }
            value={agentFilter}
          >
            {AGENT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* No API Key Warning */}
      {configuredProviders === 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <Lightbulb className="w-4 h-4" />
              <span>
                Configure an API key to enable AI-powered prompt improvements
              </span>
              <Button
                className="ml-auto"
                onClick={() => settingsDialog.openSettings('ai')}
                size="sm"
                variant="outline"
              >
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        className="flex-1 flex flex-col min-h-0"
        onValueChange={(v: string) => setActiveTab(v as 'frequent' | 'saved')}
        value={activeTab}
      >
        <TabsList className="grid w-full grid-cols-2 max-w-xs">
          <TabsTrigger value="frequent">
            <MessageSquare className="w-4 h-4 mr-1" />
            Frequent ({enhancedPrompts.length})
          </TabsTrigger>
          <TabsTrigger value="saved">
            <Bookmark className="w-4 h-4 mr-1" />
            Saved ({savedPrompts.length})
          </TabsTrigger>
        </TabsList>

        {/* Frequent Prompts Tab */}
        <TabsContent className="flex-1 min-h-0 mt-4" value="frequent">
          <ScrollArea className="h-full">
            {/* Show curated prompts immediately, user prompts loading indicator */}
            {error ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <p className="text-sm mb-2">{error}</p>
                <Button
                  onClick={() => loadUserPrompts(agentFilter)}
                  size="sm"
                  variant="outline"
                >
                  Retry
                </Button>
              </div>
            ) : enhancedPrompts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm">No prompts found</p>
                <p className="text-xs mt-1">
                  Prompts will appear here as you use them
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Curated Prompts Section */}
                {enhancedPrompts.some(p => p.isCurated) && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 px-1">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      Recommended Prompts
                    </h3>
                    {enhancedPrompts
                      .filter(p => p.isCurated)
                      .map((group, groupIdx) => {
                        const isExpanded = expandedGroups.has(
                          group.representative
                        )
                        const hasVariants = group.variants.length > 1

                        return (
                          <Card
                            className={
                              group.isCurated
                                ? 'group border-amber-500/30 bg-amber-500/5'
                                : 'group'
                            }
                            key={`group-${groupIdx}-${group.totalCount}`}
                          >
                            <CardContent className="py-3">
                              <div className="flex items-start gap-3">
                                {/* Expand/Collapse Button for Groups with Variants */}
                                {hasVariants && (
                                  <Button
                                    className="shrink-0 p-1 h-auto"
                                    onClick={() => {
                                      setExpandedGroups(prev => {
                                        const next = new Set(prev)
                                        if (isExpanded) {
                                          next.delete(group.representative)
                                        } else {
                                          next.add(group.representative)
                                        }
                                        return next
                                      })
                                    }}
                                    size="sm"
                                    variant="ghost"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </Button>
                                )}

                                <div className="flex-1 min-w-0">
                                  {/* Representative Prompt */}
                                  <p className="text-sm line-clamp-3">
                                    {group.representative}
                                  </p>

                                  {/* Meta + Actions */}
                                  <div className="flex items-center justify-between gap-2 mt-2">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap min-w-0">
                                      {group.isCurated ? (
                                        <>
                                          <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30">
                                            <Sparkles className="w-3 h-3 mr-1" />
                                            Recommended
                                          </Badge>
                                          {group.category && (
                                            <Badge
                                              className="capitalize"
                                              variant="outline"
                                            >
                                              {group.category}
                                            </Badge>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <span className="flex items-center gap-1">
                                            <MessageSquare className="w-3 h-3" />
                                            {group.totalCount} uses
                                          </span>
                                          {hasVariants && (
                                            <span className="flex items-center gap-1 text-primary">
                                              <MessageSquare className="w-3 h-3" />
                                              {group.variants.length} variants
                                            </span>
                                          )}
                                          <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatRelativeTime(group.lastUsed)}
                                          </span>
                                        </>
                                      )}
                                      {group.agents.map(agent => (
                                        <Badge
                                          className="capitalize"
                                          key={agent}
                                          variant="secondary"
                                        >
                                          {agent}
                                        </Badge>
                                      ))}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Button
                                        disabled={configuredProviders === 0}
                                        onClick={() =>
                                          handleImprove(group.representative)
                                        }
                                        size="sm"
                                        title="Improve prompt with AI"
                                        variant="outline"
                                      >
                                        <Sparkles className="w-4 h-4" />
                                      </Button>

                                      {(group.isCurated ||
                                        group.agents.includes('claude')) && (
                                        <Button
                                          onClick={() =>
                                            handleSaveAsCommand(
                                              group.representative
                                            )
                                          }
                                          size="sm"
                                          title="Save as Claude Code slash command"
                                          variant="ghost"
                                        >
                                          <Terminal className="w-4 h-4" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Expanded Variants */}
                                  {hasVariants && isExpanded && (
                                    <div className="mt-3 pl-2 border-l-2 border-muted space-y-2">
                                      {group.variants.map(variant => (
                                        <div
                                          className="text-xs text-muted-foreground"
                                          key={`variant-${groupIdx}-${variant.content.slice(0, 50)}`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium">
                                              {variant.count}x
                                            </span>
                                            {variant.similarity !== undefined &&
                                              variant.similarity < 1 && (
                                                <span className="text-primary/70">
                                                  {Math.round(
                                                    variant.similarity * 100
                                                  )}
                                                  %
                                                </span>
                                              )}
                                          </div>
                                          <p className="line-clamp-2 mt-0.5">
                                            {variant.content}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                  </div>
                )}

                {/* User Frequent Prompts Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 px-1">
                    <MessageSquare className="w-4 h-4" />
                    Your Frequent Prompts
                    {isLoadingUser && (
                      <Loader2 className="w-3 h-3 animate-spin ml-1" />
                    )}
                  </h3>
                  {isLoadingUser && userPrompts.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      <span className="text-sm">Loading your prompts...</span>
                    </div>
                  ) : userPrompts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <p className="text-sm">No frequent prompts yet</p>
                      <p className="text-xs mt-1">
                        Prompts you use 3+ times will appear here
                      </p>
                    </div>
                  ) : (
                    userPrompts.map((group, groupIdx) => {
                      const isExpanded = expandedGroups.has(
                        group.representative
                      )
                      const hasVariants = group.variants.length > 1

                      return (
                        <Card
                          className="group"
                          key={`user-group-${groupIdx}-${group.totalCount}`}
                        >
                          <CardContent className="py-3">
                            <div className="flex items-start gap-3">
                              {/* Expand/Collapse Button for Groups with Variants */}
                              {hasVariants && (
                                <Button
                                  className="shrink-0 p-1 h-auto"
                                  onClick={() => {
                                    setExpandedGroups(prev => {
                                      const next = new Set(prev)
                                      if (isExpanded) {
                                        next.delete(group.representative)
                                      } else {
                                        next.add(group.representative)
                                      }
                                      return next
                                    })
                                  }}
                                  size="sm"
                                  variant="ghost"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </Button>
                              )}

                              <div className="flex-1 min-w-0">
                                {/* Representative Prompt */}
                                <p className="text-sm line-clamp-3">
                                  {group.representative}
                                </p>

                                {/* Meta + Actions */}
                                <div className="flex items-center justify-between gap-2 mt-2">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap min-w-0">
                                    <span className="flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3" />
                                      {group.totalCount} uses
                                    </span>
                                    {hasVariants && (
                                      <span className="flex items-center gap-1 text-primary">
                                        <MessageSquare className="w-3 h-3" />
                                        {group.variants.length} variants
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatRelativeTime(group.lastUsed)}
                                    </span>
                                    {group.agents.map(agent => (
                                      <Badge
                                        className="capitalize"
                                        key={agent}
                                        variant="secondary"
                                      >
                                        {agent}
                                      </Badge>
                                    ))}
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      disabled={configuredProviders === 0}
                                      onClick={() =>
                                        handleImprove(group.representative)
                                      }
                                      size="sm"
                                      title="Improve prompt with AI"
                                      variant="outline"
                                    >
                                      <Sparkles className="w-4 h-4" />
                                    </Button>

                                    {group.agents.includes('claude') && (
                                      <Button
                                        onClick={() =>
                                          handleSaveAsCommand(
                                            group.representative
                                          )
                                        }
                                        size="sm"
                                        title="Save as Claude Code slash command"
                                        variant="ghost"
                                      >
                                        <Terminal className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                </div>

                                {/* Expanded Variants */}
                                {hasVariants && isExpanded && (
                                  <div className="mt-3 pl-2 border-l-2 border-muted space-y-2">
                                    {group.variants.map(variant => (
                                      <div
                                        className="text-xs text-muted-foreground"
                                        key={`user-variant-${groupIdx}-${variant.content.slice(0, 50)}`}
                                      >
                                        <p className="line-clamp-2">
                                          {variant.content}
                                        </p>
                                        <span className="text-[10px]">
                                          {variant.count} uses
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Saved Prompts Tab */}
        <TabsContent className="flex-1 min-h-0 mt-4" value="saved">
          <ScrollArea className="h-full">
            {savedPrompts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Bookmark className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm">No saved prompts yet</p>
                <p className="text-xs mt-1">
                  Save improved prompts to access them later
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedPrompts.map(prompt => (
                  <Card className="group" key={prompt.id}>
                    <CardContent className="py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Improved Prompt */}
                          <p className="text-sm line-clamp-3">
                            {prompt.improved}
                          </p>

                          {/* Original (collapsed) */}
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                              Show original
                            </summary>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {prompt.original}
                            </p>
                          </details>

                          {/* Meta */}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatRelativeTime(prompt.savedAt)}
                            </span>
                            <Badge className="capitalize" variant="secondary">
                              {prompt.provider}
                            </Badge>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  prompt.improved
                                )
                                toast.success('Copied to clipboard')
                              } catch {
                                toast.error('Failed to copy')
                              }
                            }}
                            size="sm"
                            variant="ghost"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteSavedPrompt(prompt.id)}
                            size="sm"
                            variant="ghost"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Improvement Dialog */}
      <Dialog
        onOpenChange={open => {
          if (!open) {
            setImprovingPrompt(null)
            setImprovement(null)
            setImprovementError(null)
            setPromptSaved(false)
          }
        }}
        open={!!improvingPrompt}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Improved Prompt
            </DialogTitle>
            <DialogDescription className="sr-only">
              AI-improved version of the selected prompt
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isImproving ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  Analyzing and improving prompt...
                </p>
              </div>
            ) : improvementError ? (
              <div className="text-center py-4">
                <p className="text-sm text-destructive">{improvementError}</p>
                <Button
                  className="mt-4"
                  onClick={() =>
                    improvingPrompt && handleImprove(improvingPrompt)
                  }
                  variant="outline"
                >
                  Retry
                </Button>
              </div>
            ) : improvement ? (
              <>
                {/* Original Prompt */}
                <div className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Original
                  </span>
                  <div className="p-3 rounded-md bg-muted/50 text-sm">
                    {improvement.original}
                  </div>
                </div>

                {/* Improved Prompt */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Improved</span>
                    <div className="flex items-center gap-1">
                      <Button onClick={handleCopy} size="sm" variant="ghost">
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </Button>
                      <Button
                        disabled={isSavingPrompt || promptSaved}
                        onClick={handleSavePrompt}
                        size="sm"
                        variant="ghost"
                      >
                        {promptSaved ? (
                          <>
                            <Check className="w-4 h-4 mr-1 text-green-500" />
                            Saved!
                          </>
                        ) : isSavingPrompt ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-1" />
                            Save
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="p-3 rounded-md bg-primary/5 border border-primary/20 text-sm whitespace-pre-wrap">
                    {improvement.improved}
                  </div>
                </div>

                {/* Changes */}
                {improvement.changes.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Key Changes
                    </span>
                    <ul className="space-y-1">
                      {improvement.changes.map(change => (
                        <li
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                          key={change.slice(0, 30)}
                        >
                          <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          {change}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Provider Badge */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Improved with</span>
                  <Badge className="capitalize" variant="secondary">
                    {improvement.provider}
                  </Badge>
                </div>
              </>
            ) : null}
          </div>

          <DialogFooter>
            <Button onClick={() => setImprovingPrompt(null)} variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog (controlled, no trigger) */}
      <SettingsDialog
        defaultTab="ai"
        onOpenChange={settingsDialog.setOpen}
        open={settingsDialog.open}
        trigger={<span className="hidden" />}
      />

      {/* Slash Command Dialog */}
      <SlashCommandDialog
        initialPrompt={commandPrompt}
        onOpenChange={setCommandDialogOpen}
        open={commandDialogOpen}
      />
    </div>
  )
}
