import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { stripAnsi } from 'renderer/lib/ansi'
import type { AgentSession } from 'shared/ipc-protocol'
import type { AgentStatus } from 'shared/types'

interface SessionTileProps {
  session: AgentSession
  recentOutput: string[]
  isSelected: boolean
  onClick: () => void
}

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string; bgColor: string }
> = {
  idle: {
    label: 'Idle',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
  thinking: {
    label: 'Thinking',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  awaiting: {
    label: 'Awaiting',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
  },
  tool_use: {
    label: 'Tool Use',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
  },
  error: {
    label: 'Error',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
  },
}

export function SessionTile({
  session,
  recentOutput,
  isSelected,
  onClick,
}: SessionTileProps) {
  const statusConfig = STATUS_CONFIG[session.status]
  const elapsedTime = Math.floor((Date.now() - session.startedAt) / 1000)

  // Convert raw chunks to clean lines for preview
  const cleanOutput = useMemo(() => {
    // Join all chunks and strip ANSI codes
    const rawText = stripAnsi(recentOutput.join(''))
    // Split by newlines and filter empty lines
    const lines = rawText.split('\n').filter(line => line.trim())
    // Return last 3 lines for preview
    return lines.slice(-3)
  }, [recentOutput])

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    return `${Math.floor(seconds / 3600)}h`
  }

  return (
    <Card
      className={`cursor-pointer transition-all hover:bg-accent/50 ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium truncate">
            {session.command}
          </CardTitle>
          <Badge
            className={`${statusConfig.color} ${statusConfig.bgColor} border-0`}
            variant="outline"
          >
            {statusConfig.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>PID: {session.pid}</span>
          <span>•</span>
          <span>{formatTime(elapsedTime)}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="font-mono text-xs text-muted-foreground bg-muted/50 rounded p-2 h-16 overflow-hidden">
          {cleanOutput.length > 0 ? (
            cleanOutput.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Terminal output is append-only, index is stable
              <div className="truncate" key={i}>
                {line || '\u00A0'}
              </div>
            ))
          ) : (
            <div className="text-muted-foreground/50 italic">
              Waiting for output...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
