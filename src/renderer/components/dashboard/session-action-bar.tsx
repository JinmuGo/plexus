import { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu'
import {
  Check,
  X,
  Square,
  ChevronDown,
  Send,
  AlertTriangle,
} from 'lucide-react'
import type { AgentSession } from 'shared/ipc-protocol'
import { devLog } from 'renderer/lib/logger'

const { App } = window

interface SessionActionBarProps {
  session: AgentSession
}

// Common approval responses for Claude Code
const QUICK_RESPONSES = [
  { label: 'Yes', value: 'y' },
  { label: 'No', value: 'n' },
  { label: 'Yes to all', value: 'Y' },
  { label: 'No to all', value: 'N' },
]

export function SessionActionBar({ session }: SessionActionBarProps) {
  const [customInput, setCustomInput] = useState('')
  const [isKillDialogOpen, setIsKillDialogOpen] = useState(false)

  const isAwaiting = session.status === 'awaiting'

  const handleSendResponse = async (response: string) => {
    try {
      await App.sessions.stdin(session.id, `${response}\n`)
    } catch (error) {
      devLog.error('Failed to send response:', error)
    }
  }

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customInput.trim()) return

    await handleSendResponse(customInput)
    setCustomInput('')
  }

  const handleKill = async (signal: 'SIGTERM' | 'SIGKILL') => {
    try {
      await App.sessions.kill(session.id, signal)
      setIsKillDialogOpen(false)
    } catch (error) {
      devLog.error('Failed to kill session:', error)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Quick response buttons - only shown when awaiting */}
        {isAwaiting && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Check className="h-3 w-3" />
                  Approve
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {QUICK_RESPONSES.map(response => (
                  <DropdownMenuItem
                    key={response.value}
                    onClick={() => handleSendResponse(response.value)}
                  >
                    {response.label}
                    <span className="ml-auto text-xs text-muted-foreground">
                      ({response.value})
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    document.getElementById('custom-input')?.focus()
                  }
                >
                  Custom response...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              onClick={() => handleSendResponse('n')}
              size="sm"
              variant="outline"
            >
              <X className="h-3 w-3" />
              Reject
            </Button>

            {/* Custom input */}
            <form className="flex gap-1" onSubmit={handleCustomSubmit}>
              <Input
                className="h-8 w-32 text-sm"
                id="custom-input"
                onChange={e => setCustomInput(e.target.value)}
                placeholder="Custom..."
                value={customInput}
              />
              <Button
                disabled={!customInput.trim()}
                size="sm"
                type="submit"
                variant="ghost"
              >
                <Send className="h-3 w-3" />
              </Button>
            </form>
          </>
        )}

        {/* Force kill button - always shown */}
        <Button
          className="ml-auto"
          onClick={() => setIsKillDialogOpen(true)}
          size="sm"
          variant="destructive"
        >
          <Square className="h-3 w-3" />
          Kill
        </Button>
      </div>

      {/* Kill confirmation dialog */}
      <Dialog onOpenChange={setIsKillDialogOpen} open={isKillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Terminate Session
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to terminate this session?
              <br />
              <span className="font-mono text-sm">
                {session.command} (PID: {session.pid})
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              onClick={() => setIsKillDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={() => handleKill('SIGTERM')} variant="secondary">
              Graceful Shutdown
            </Button>
            <Button onClick={() => handleKill('SIGKILL')} variant="destructive">
              Force Kill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
