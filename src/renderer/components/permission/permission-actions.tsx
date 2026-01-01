/**
 * Permission Actions Component
 *
 * Unified permission action buttons supporting all agent-specific options.
 * - Allow/Deny base buttons
 * - Dropdown for extended options based on agent capabilities
 * - Compact mode for Popover, full mode for Dashboard
 */

import { useCallback, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  ChevronDown,
  Check,
  Ban,
  Hand,
  Shield,
  Timer,
  Pencil,
} from 'lucide-react'
import type {
  ClaudeSession,
  PermissionDecision,
  AgentPermissionCapabilities,
} from 'shared/hook-types'
import { EditInputDialog } from './edit-input-dialog'
import { InlineShortcutHint } from '../keyboard'

const { App } = window

interface PermissionActionsProps {
  session: ClaudeSession
  compact?: boolean
  onActionComplete?: () => void
}

export function PermissionActions({
  session,
  compact = false,
  onActionComplete,
}: PermissionActionsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [capabilities, setCapabilities] =
    useState<AgentPermissionCapabilities | null>(null)
  const [autoAllowedCount, setAutoAllowedCount] = useState(0)

  const toolName = session.activePermission?.toolName || 'unknown'
  const toolInput = session.activePermission?.toolInput

  // Fetch capabilities on mount
  useEffect(() => {
    App.permissions.getCapabilities(session.agent).then(setCapabilities)
    App.permissions
      .getAutoAllowed(session.id)
      .then(list => setAutoAllowedCount(list.length))
  }, [session.agent, session.id])

  const handleAction = useCallback(
    async (
      decision: PermissionDecision,
      options?: {
        reason?: string
        updatedInput?: Record<string, unknown>
        interrupt?: boolean
      }
    ) => {
      setIsLoading(decision)
      try {
        await App.permissions.respond(session.id, decision, options)
        onActionComplete?.()

        // Show toast based on decision
        const messages: Record<PermissionDecision, string> = {
          allow: 'Allowed',
          deny: 'Denied',
          ask: 'Delegated to agent',
          block: 'Blocked permanently',
          'auto-allow-session': `Auto-allow enabled for ${toolName}`,
        }
        toast.success(messages[decision] || decision)
      } catch (error) {
        console.error('[PermissionActions] Failed:', error)
        toast.error('Failed to respond to permission')
      } finally {
        setIsLoading(null)
      }
    },
    [session.id, toolName, onActionComplete]
  )

  const handleAllow = useCallback(() => handleAction('allow'), [handleAction])
  const handleDeny = useCallback(() => handleAction('deny'), [handleAction])

  const handleAsk = useCallback(() => handleAction('ask'), [handleAction])

  const handleAutoAllow = useCallback(async () => {
    await handleAction('auto-allow-session')
  }, [handleAction])

  const handleDenyWithInterrupt = useCallback(() => {
    handleAction('deny', {
      interrupt: true,
      reason: 'Stopped by user via Plexus',
    })
  }, [handleAction])

  const handleBlock = useCallback(() => {
    handleAction('block', { reason: 'Blocked by user via Plexus' })
  }, [handleAction])

  const handleEditAndAllow = useCallback(
    (updatedInput: Record<string, unknown>) => {
      handleAction('allow', { updatedInput })
      setShowEditDialog(false)
    },
    [handleAction]
  )

  if (!capabilities) {
    return null
  }

  // Compact mode: minimal buttons for popover
  if (compact) {
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          className="h-6 px-2 text-xs bg-status-active hover:bg-status-active/90"
          disabled={isLoading !== null}
          onClick={handleAllow}
          size="sm"
        >
          {isLoading === 'allow' ? '...' : 'Allow'}
        </Button>
        <Button
          className="h-6 px-2 text-xs"
          disabled={isLoading !== null}
          onClick={handleDeny}
          size="sm"
          variant="destructive"
        >
          {isLoading === 'deny' ? '...' : 'Deny'}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-6 w-6 p-0"
              disabled={isLoading !== null}
              size="sm"
              variant="outline"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {capabilities.autoAllow && (
              <DropdownMenuItem onClick={handleAutoAllow}>
                <Timer className="h-4 w-4 mr-2" />
                Auto-allow for session
              </DropdownMenuItem>
            )}
            {capabilities.ask && (
              <DropdownMenuItem onClick={handleAsk}>
                <Hand className="h-4 w-4 mr-2" />
                Let {session.agent} ask
              </DropdownMenuItem>
            )}
            {capabilities.updatedInput && toolInput && (
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit input & allow
              </DropdownMenuItem>
            )}
            {(capabilities.interrupt || capabilities.block) && (
              <DropdownMenuSeparator />
            )}
            {capabilities.interrupt && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleDenyWithInterrupt}
              >
                <Ban className="h-4 w-4 mr-2" />
                Deny & stop agent
              </DropdownMenuItem>
            )}
            {capabilities.block && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleBlock}
              >
                <Shield className="h-4 w-4 mr-2" />
                Block permanently
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Edit Input Dialog */}
        {capabilities.updatedInput && toolInput && (
          <EditInputDialog
            onCancel={() => setShowEditDialog(false)}
            onConfirm={handleEditAndAllow}
            open={showEditDialog}
            toolInput={toolInput}
            toolName={toolName}
          />
        )}
      </div>
    )
  }

  // Full mode: detailed buttons for dashboard
  return (
    <div className="space-y-3">
      {/* Tool info */}
      <div className="text-sm">
        <span className="text-muted-foreground">Requesting: </span>
        <span className="font-medium text-orange-400">{toolName}</span>
        {autoAllowedCount > 0 && (
          <span className="ml-2 text-xs text-muted-foreground">
            ({autoAllowedCount} tool{autoAllowedCount > 1 ? 's' : ''}{' '}
            auto-allowed)
          </span>
        )}
      </div>

      {/* Main action buttons */}
      <div className="flex gap-2">
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700"
          disabled={isLoading !== null}
          onClick={handleAllow}
          size="sm"
        >
          <Check className="h-4 w-4 mr-1" />
          {isLoading === 'allow' ? 'Allowing...' : 'Allow'}
          <InlineShortcutHint shortcut="y" />
        </Button>
        <Button
          className="flex-1"
          disabled={isLoading !== null}
          onClick={handleDeny}
          size="sm"
          variant="destructive"
        >
          <Ban className="h-4 w-4 mr-1" />
          {isLoading === 'deny' ? 'Denying...' : 'Deny'}
          <InlineShortcutHint shortcut="n" />
        </Button>
      </div>

      {/* Extended options */}
      <div className="flex flex-wrap gap-2">
        {capabilities.autoAllow && (
          <Button
            className="text-xs"
            disabled={isLoading !== null}
            onClick={handleAutoAllow}
            size="sm"
            variant="outline"
          >
            <Timer className="h-3 w-3 mr-1" />
            Auto-allow for session
            <InlineShortcutHint shortcut="a" />
          </Button>
        )}

        {capabilities.ask && (
          <Button
            className="text-xs"
            disabled={isLoading !== null}
            onClick={handleAsk}
            size="sm"
            variant="outline"
          >
            <Hand className="h-3 w-3 mr-1" />
            Let {session.agent} ask
          </Button>
        )}

        {capabilities.updatedInput && toolInput && (
          <Button
            className="text-xs"
            disabled={isLoading !== null}
            onClick={() => setShowEditDialog(true)}
            size="sm"
            variant="outline"
          >
            <Pencil className="h-3 w-3 mr-1" />
            Edit input
          </Button>
        )}

        {capabilities.interrupt && (
          <Button
            className="text-xs"
            disabled={isLoading !== null}
            onClick={handleDenyWithInterrupt}
            size="sm"
            variant="outline"
          >
            <Ban className="h-3 w-3 mr-1 text-destructive" />
            Deny & stop
          </Button>
        )}

        {capabilities.block && (
          <Button
            className="text-xs"
            disabled={isLoading !== null}
            onClick={handleBlock}
            size="sm"
            variant="outline"
          >
            <Shield className="h-3 w-3 mr-1 text-destructive" />
            Block
          </Button>
        )}
      </div>

      {/* Edit Input Dialog */}
      {capabilities.updatedInput && toolInput && (
        <EditInputDialog
          onCancel={() => setShowEditDialog(false)}
          onConfirm={handleEditAndAllow}
          open={showEditDialog}
          toolInput={toolInput}
          toolName={toolName}
        />
      )}
    </div>
  )
}
