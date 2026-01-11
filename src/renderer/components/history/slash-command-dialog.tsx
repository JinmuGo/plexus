/**
 * Slash Command Dialog
 *
 * Dialog for creating Claude Code slash commands from prompts.
 * Supports Bash context templates and command customization.
 */

import { useState, useEffect, useCallback, type ChangeEvent } from 'react'
import {
  Terminal,
  Save,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Check,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from 'renderer/components/ui/button'
import { Input } from 'renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from 'renderer/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'renderer/components/ui/collapsible'
import { Badge } from 'renderer/components/ui/badge'
import type { BashTemplateType, SlashCommand } from 'shared/history-types'

const { App } = window

interface SlashCommandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPrompt: string
}

interface BashTemplateOption {
  value: BashTemplateType
  label: string
}

/**
 * Slugify a string for use as command name
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)
}

/**
 * Generate initial command name from prompt
 */
function generateCommandName(prompt: string): string {
  const firstLine = prompt.split('\n')[0].slice(0, 50)
  return slugify(firstLine) || 'my-command'
}

export function SlashCommandDialog({
  open,
  onOpenChange,
  initialPrompt,
}: SlashCommandDialogProps) {
  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [bashTemplateType, setBashTemplateType] =
    useState<BashTemplateType>('none')
  const [bashScript, setBashScript] = useState('')
  const [bashExpanded, setBashExpanded] = useState(false)

  // UI state
  const [templateOptions, setTemplateOptions] = useState<BashTemplateOption[]>(
    []
  )
  const [isSaving, setIsSaving] = useState(false)
  const [nameExists, setNameExists] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [copied, setCopied] = useState(false)

  // Load template options on mount
  useEffect(() => {
    App.commands.getBashTemplateOptions().then(setTemplateOptions)
  }, [])

  // Reset form when dialog opens with new prompt
  useEffect(() => {
    if (open && initialPrompt) {
      setName(generateCommandName(initialPrompt))
      setDescription('')
      setContent(initialPrompt)
      setBashTemplateType('none')
      setBashScript('')
      setBashExpanded(false)
      setNameExists(false)
      setShowPreview(false)
    }
  }, [open, initialPrompt])

  // Check if name exists when it changes
  useEffect(() => {
    if (!name) {
      setNameExists(false)
      return
    }

    const checkExists = async () => {
      const exists = await App.commands.exists(name)
      setNameExists(exists)
    }

    const timeout = setTimeout(checkExists, 300)
    return () => clearTimeout(timeout)
  }, [name])

  // Load bash template when type changes
  const handleTemplateChange = useCallback(
    async (e: ChangeEvent<HTMLSelectElement>) => {
      const type = e.target.value as BashTemplateType
      setBashTemplateType(type)
      if (type === 'none') {
        setBashScript('')
        setBashExpanded(false)
      } else if (type === 'custom') {
        setBashExpanded(true)
      } else {
        const template = await App.commands.getBashTemplate(type)
        setBashScript(template)
        setBashExpanded(true)
      }
    },
    []
  )

  // Generate preview markdown
  const generatePreview = useCallback((): string => {
    const lines: string[] = []
    lines.push('---')
    lines.push(`description: ${description || 'No description'}`)
    lines.push('---')
    lines.push('')
    lines.push('$ARGUMENTS')
    lines.push('')
    if (bashScript.trim()) {
      lines.push('```bash')
      lines.push(bashScript.trim())
      lines.push('```')
      lines.push('')
    }
    lines.push(content)
    return lines.join('\n')
  }, [description, bashScript, content])

  // Handle save
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a command name')
      return
    }
    if (!content.trim()) {
      toast.error('Please enter prompt content')
      return
    }

    setIsSaving(true)
    try {
      const command: SlashCommand = {
        name: name.trim(),
        description: description.trim() || `Slash command: ${name}`,
        content: content.trim(),
        bashScript: bashScript.trim() || undefined,
      }

      await App.commands.save(command)
      toast.success(`Command /${name} saved!`, {
        description: `Use it in Claude Code with /${name}`,
      })
      onOpenChange(false)
    } catch (error) {
      toast.error('Failed to save command', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Copy preview to clipboard
  const handleCopyPreview = async () => {
    await navigator.clipboard.writeText(generatePreview())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isValid = name.trim() && content.trim() && !nameExists

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Save as Slash Command
          </DialogTitle>
          <DialogDescription>
            Save this prompt as a Claude Code slash command. It will be saved to
            ~/.claude/commands/ and can be used with /{name || 'command-name'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Command Name */}
          <div className="space-y-2">
            <label
              className="text-sm font-medium leading-none"
              htmlFor="command-name"
            >
              Command Name
            </label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">/</span>
              <Input
                className={nameExists ? 'border-amber-500' : ''}
                id="command-name"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setName(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
                  )
                }
                placeholder="my-command"
                value={name}
              />
            </div>
            {nameExists && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Command exists and will be overwritten
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label
              className="text-sm font-medium leading-none"
              htmlFor="description"
            >
              Description
            </label>
            <Input
              id="description"
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setDescription(e.target.value)
              }
              placeholder="What does this command do?"
              value={description}
            />
            <p className="text-xs text-muted-foreground">
              Shown in Claude Code's command list
            </p>
          </div>

          {/* Prompt Content */}
          <div className="space-y-2">
            <label
              className="text-sm font-medium leading-none"
              htmlFor="content"
            >
              Prompt
            </label>
            <textarea
              className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              id="content"
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setContent(e.target.value)
              }
              placeholder="Enter your prompt..."
              rows={5}
              value={content}
            />
          </div>

          {/* Bash Context (Collapsible) */}
          <Collapsible onOpenChange={setBashExpanded} open={bashExpanded}>
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <Button
                  className="gap-2 p-0 h-auto hover:bg-transparent"
                  size="sm"
                  variant="ghost"
                >
                  {bashExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span className="font-medium">Bash Context (Optional)</span>
                </Button>
              </CollapsibleTrigger>
              <select
                className="h-9 rounded-md border bg-transparent px-3 py-1 text-sm"
                onChange={handleTemplateChange}
                value={bashTemplateType}
              >
                {templateOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <CollapsibleContent className="pt-3">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  This script runs before the prompt to gather context (e.g.,
                  git status). Output is included in the prompt.
                </p>
                <textarea
                  className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    setBashScript(e.target.value)
                  }
                  placeholder="# Bash commands to run before prompt..."
                  rows={4}
                  value={bashScript}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Preview Toggle */}
          <Collapsible onOpenChange={setShowPreview} open={showPreview}>
            <CollapsibleTrigger asChild>
              <Button
                className="gap-2 p-0 h-auto hover:bg-transparent"
                size="sm"
                variant="ghost"
              >
                {showPreview ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span className="font-medium">Preview</span>
                <Badge className="ml-2" variant="outline">
                  {name || 'command'}.md
                </Badge>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="relative">
                <pre className="p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {generatePreview()}
                </pre>
                <Button
                  className="absolute top-2 right-2"
                  onClick={handleCopyPreview}
                  size="sm"
                  variant="ghost"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={!isValid || isSaving} onClick={handleSave}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Command
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
