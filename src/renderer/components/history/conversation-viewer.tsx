import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Loader2, FolderOpen, Clock, Hash, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from 'renderer/lib/utils'
import { Button } from 'renderer/components/ui/button'
import { VirtualMessageList, type TimelineItem } from './messages'
import type {
  SessionWithMessages,
  HistoryMessage,
  ToolExecution,
  ThinkingBlock,
} from 'shared/history-types'
import { devLog } from 'renderer/lib/logger'

const { App } = window

interface ConversationViewerProps {
  sessionId: string
  onReplay?: (sessionId: string) => void
  onDelete?: (sessionId: string) => void
}

export function ConversationViewer({
  sessionId,
  onReplay,
  onDelete,
}: ConversationViewerProps) {
  const [data, setData] = useState<SessionWithMessages | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadSession = async () => {
      setIsLoading(true)
      try {
        // First try to get from JSONL for full content
        const jsonlData = await App.history.parseJsonlForReplay(sessionId)
        const sessionData = await App.history.getSession(sessionId)

        if (jsonlData && sessionData) {
          // Convert JSONL entries to HistoryMessage format
          const messages: HistoryMessage[] = jsonlData.entries
            .filter(
              e =>
                e.role === 'user' ||
                e.role === 'assistant' ||
                e.role === 'system'
            )
            .map(entry => ({
              id: entry.id,
              sessionId: entry.sessionId,
              role: entry.role,
              content: entry.content,
              contentPreview: entry.contentPreview,
              timestamp: entry.timestamp,
              metadata: entry.toolName ? { toolName: entry.toolName } : null,
              jsonlPath: entry.jsonlPath,
              jsonlOffset: entry.jsonlOffset,
              jsonlLength: entry.jsonlLength,
            }))

          const toolExecutions: ToolExecution[] = jsonlData.toolExecutions.map(
            tool => ({
              id: `tool-${tool.toolUseId}`,
              sessionId,
              toolUseId: tool.toolUseId,
              toolName: tool.toolName,
              toolInput: tool.toolInput,
              toolOutput: tool.toolOutput || null,
              status: 'success',
              startedAt: tool.timestamp,
              completedAt: tool.timestamp,
              durationMs: null,
            })
          )

          // Extract thinking blocks (reasoning trace)
          const thinkingBlocks: ThinkingBlock[] = (
            jsonlData.thinkingBlocks || []
          ).map(block => ({
            id: block.id,
            sessionId: block.sessionId,
            text: block.text,
            source: 'claude-code' as const,
            timestamp: block.timestamp,
            durationMs: null, // Claude doesn't provide duration
          }))

          setData({
            session: sessionData,
            messages,
            toolExecutions,
            thinkingBlocks,
          })
        } else {
          // Fallback to DB data
          const result = await App.history.getSessionWithMessages(sessionId)
          setData(result)
        }
      } catch (error) {
        devLog.error('Failed to load session:', error)
        // Try fallback
        try {
          const result = await App.history.getSessionWithMessages(sessionId)
          setData(result)
        } catch {
          setData(null)
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadSession()
  }, [sessionId])

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch (error) {
      devLog.error('Failed to copy:', error)
      toast.error('Failed to copy')
    }
  }, [])

  // Build timeline from messages, tools, and thinking blocks
  const timeline = useMemo((): TimelineItem[] => {
    if (!data) return []

    const items: TimelineItem[] = []

    for (const msg of data.messages) {
      items.push({ type: 'message', data: msg })
    }

    for (const tool of data.toolExecutions) {
      items.push({ type: 'tool', data: tool })
    }

    // Add thinking blocks (reasoning trace)
    for (const thinking of data.thinkingBlocks || []) {
      items.push({ type: 'thinking', data: thinking })
    }

    // Sort by timestamp (oldest first)
    return items.sort((a, b) => {
      const timeA =
        a.type === 'message'
          ? a.data.timestamp
          : a.type === 'tool'
            ? a.data.startedAt
            : a.data.timestamp
      const timeB =
        b.type === 'message'
          ? b.data.timestamp
          : b.type === 'tool'
            ? b.data.startedAt
            : b.data.timestamp
      return timeA - timeB
    })
  }, [data])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary/60" />
        <span className="text-sm text-muted-foreground">
          Loading conversation...
        </span>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <div className="text-lg mb-2">Session not found</div>
        <div className="text-sm">The session may have been deleted</div>
      </div>
    )
  }

  const { session } = data

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Beautiful Session Header */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="relative px-6 py-5 border-b bg-gradient-to-b from-muted/30 to-transparent"
        initial={{ opacity: 0, y: -10 }}
      >
        {/* Title + Actions */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 className="text-lg font-semibold text-foreground">
            {session.displayTitle || session.id.slice(0, 8)}
          </h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onReplay && (
              <Button
                className="h-8 gap-1.5 text-xs hover:bg-primary hover:text-primary-foreground"
                onClick={() => onReplay(sessionId)}
                size="sm"
                variant="outline"
              >
                <Play className="w-3.5 h-3.5" />
                Replay
              </Button>
            )}
            {onDelete && (
              <Button
                className="h-8 gap-1.5 text-xs hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => onDelete(sessionId)}
                size="sm"
                variant="outline"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Metadata Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Project Path */}
          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
              'bg-muted/50 text-[11px] text-muted-foreground'
            )}
          >
            <FolderOpen className="w-3 h-3" />
            <span className="truncate max-w-[200px]">{session.cwd}</span>
          </div>

          {/* Date/Time */}
          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
              'bg-muted/50 text-[11px] text-muted-foreground'
            )}
          >
            <Clock className="w-3 h-3" />
            <span>{new Date(session.startedAt).toLocaleString()}</span>
          </div>

          {/* Duration */}
          {session.durationMs && (
            <div
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
                'bg-muted/50 text-[11px] text-muted-foreground'
              )}
            >
              <span>{Math.round(session.durationMs / 1000)}s</span>
            </div>
          )}

          {/* Message Count */}
          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
              'bg-primary/10 text-[11px] text-primary'
            )}
          >
            <Hash className="w-3 h-3" />
            <span>{timeline.length} events</span>
          </div>
        </div>
      </motion.div>

      {/* Messages with Virtual Scrolling */}
      <div className="flex-1 min-h-0">
        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="text-base mb-1">No messages recorded</div>
            <div className="text-sm text-muted-foreground/60">
              This session has no conversation history
            </div>
          </div>
        ) : (
          <VirtualMessageList
            items={timeline}
            onCopy={handleCopy}
            showScrollToBottom
          />
        )}
      </div>
    </div>
  )
}
