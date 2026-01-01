import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type {
  HistoryMessage,
  ToolExecution,
  ReplayTimelineEvent,
  ReplayState,
  PlaybackSpeed,
  HistorySession,
  ParsedConversationEntry,
  ParsedToolExecution,
} from 'shared/history-types'

const { App } = window

interface UseReplayOptions {
  sessionId: string
  onComplete?: () => void
}

interface UseReplayReturn {
  // State
  state: ReplayState | null
  session: HistorySession | null
  isLoading: boolean
  loadingProgress: number // 0-100
  error: string | null

  // Timeline helpers
  currentEvent: ReplayTimelineEvent | null
  visibleEvents: ReplayTimelineEvent[]
  progress: number // 0-100

  // Controls
  play: () => void
  pause: () => void
  stop: () => void
  setSpeed: (speed: PlaybackSpeed) => void
  seekTo: (index: number) => void
  stepForward: () => void
  stepBackward: () => void
}

/**
 * Get delay between events based on event type
 */
function getDelayForEvent(event: ReplayTimelineEvent): number {
  if (event.type === 'tool') {
    return 400 // Tools appear quickly
  }

  const message = event.data as HistoryMessage
  if (message.role === 'user') {
    return 500 // User messages appear quickly
  }
  if (message.role === 'assistant') {
    return 800 // Assistant messages have more "thinking" time
  }
  return 300 // System/tool messages are quick
}

/**
 * Convert parsed JSONL entries to HistoryMessage format
 */
function convertToHistoryMessage(
  entry: ParsedConversationEntry
): HistoryMessage {
  return {
    id: entry.id,
    sessionId: entry.sessionId,
    role: entry.role,
    content: entry.content,
    contentPreview: entry.contentPreview,
    timestamp: entry.timestamp,
    metadata: entry.toolName
      ? { toolName: entry.toolName, toolUseId: entry.toolUseId }
      : null,
    jsonlPath: entry.jsonlPath,
    jsonlOffset: entry.jsonlOffset,
    jsonlLength: entry.jsonlLength,
  }
}

/**
 * Convert parsed tool execution to ToolExecution format
 */
function convertToToolExecution(
  tool: ParsedToolExecution,
  sessionId: string
): ToolExecution {
  return {
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
  }
}

/**
 * Build sorted timeline from messages and tool executions
 */
function buildTimeline(
  messages: HistoryMessage[],
  toolExecutions: ToolExecution[]
): ReplayTimelineEvent[] {
  const events: ReplayTimelineEvent[] = []

  for (const msg of messages) {
    events.push({
      id: msg.id,
      type: 'message',
      timestamp: msg.timestamp,
      data: msg,
    })
  }

  for (const tool of toolExecutions) {
    events.push({
      id: tool.id,
      type: 'tool',
      timestamp: tool.startedAt,
      data: tool,
    })
  }

  // Sort chronologically (oldest first for replay)
  return events.sort((a, b) => a.timestamp - b.timestamp)
}

export function useReplay({
  sessionId,
  onComplete,
}: UseReplayOptions): UseReplayReturn {
  const [state, setState] = useState<ReplayState | null>(null)
  const [session, setSession] = useState<HistorySession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onCompleteRef = useRef(onComplete)

  // Keep onComplete ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Load session data
  useEffect(() => {
    let isCancelled = false

    async function loadSession() {
      setIsLoading(true)
      setLoadingProgress(0)
      setError(null)

      try {
        // 1. Load session metadata
        const sessionData = await App.history.getSession(sessionId)

        if (isCancelled) return

        if (!sessionData) {
          setError('Session not found')
          setIsLoading(false)
          return
        }

        setSession(sessionData)
        setLoadingProgress(20)

        // 2. Parse JSONL file directly to get user/assistant messages
        const jsonlData = await App.history.parseJsonlForReplay(sessionId)

        if (isCancelled) return

        setLoadingProgress(70)

        if (!jsonlData || jsonlData.entries.length === 0) {
          // Fallback to DB messages if no JSONL data
          const dbData = await App.history.getSessionWithMessages(sessionId)
          if (dbData && dbData.messages.length > 0) {
            const timeline = buildTimeline(
              dbData.messages,
              dbData.toolExecutions
            )
            if (timeline.length === 0) {
              setError('No events to replay')
              setIsLoading(false)
              return
            }

            const startTime = timeline[0].timestamp
            const endTime = timeline[timeline.length - 1].timestamp
            const totalDuration = endTime - startTime

            setState({
              sessionId,
              currentIndex: -1,
              isPlaying: false,
              speed: 1,
              timeline,
              startTime,
              totalDuration,
            })

            setLoadingProgress(100)
            setIsLoading(false)
            return
          }

          setError('No events to replay (JSONL file not found)')
          setIsLoading(false)
          return
        }

        setLoadingProgress(85)

        // 3. Convert JSONL entries to HistoryMessage format
        // Filter to only user and assistant messages for timeline
        const messages = jsonlData.entries
          .filter(entry => entry.role === 'user' || entry.role === 'assistant')
          .map(convertToHistoryMessage)

        // Convert tool executions
        const toolExecutions = jsonlData.toolExecutions.map(tool =>
          convertToToolExecution(tool, sessionId)
        )

        setLoadingProgress(95)

        // 4. Build timeline
        const timeline = buildTimeline(messages, toolExecutions)

        if (timeline.length === 0) {
          setError('No events to replay')
          setIsLoading(false)
          return
        }

        // 5. Calculate duration
        const startTime = timeline[0].timestamp
        const endTime = timeline[timeline.length - 1].timestamp
        const totalDuration = endTime - startTime

        // 6. Set initial state
        setState({
          sessionId,
          currentIndex: -1, // Start before first event
          isPlaying: false,
          speed: 1,
          timeline,
          startTime,
          totalDuration,
        })

        setLoadingProgress(100)
        setIsLoading(false)
      } catch (err) {
        if (!isCancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load session'
          )
          setIsLoading(false)
        }
      }
    }

    loadSession()

    return () => {
      isCancelled = true
    }
  }, [sessionId])

  // Playback loop
  useEffect(() => {
    if (!state?.isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const advanceToNext = () => {
      setState(prev => {
        if (!prev) return prev
        const nextIndex = prev.currentIndex + 1

        if (nextIndex >= prev.timeline.length) {
          // Reached end
          onCompleteRef.current?.()
          return { ...prev, isPlaying: false }
        }

        return { ...prev, currentIndex: nextIndex }
      })
    }

    // Get delay for next event
    const getNextDelay = () => {
      if (!state) return 500
      const nextIndex = state.currentIndex + 1
      if (nextIndex >= state.timeline.length) return 500
      const nextEvent = state.timeline[nextIndex]
      return getDelayForEvent(nextEvent) / state.speed
    }

    // Use timeout instead of interval for variable delays
    const scheduleNext = () => {
      intervalRef.current = setTimeout(() => {
        advanceToNext()
        // Re-schedule for next event (will be cleared if paused)
        if (state?.isPlaying) {
          scheduleNext()
        }
      }, getNextDelay())
    }

    scheduleNext()

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [state?.isPlaying, state?.currentIndex, state?.speed])

  // Controls
  const play = useCallback(() => {
    setState(prev => {
      if (!prev) return prev
      // If at end, restart from beginning
      if (prev.currentIndex >= prev.timeline.length - 1) {
        return { ...prev, currentIndex: -1, isPlaying: true }
      }
      return { ...prev, isPlaying: true }
    })
  }, [])

  const pause = useCallback(() => {
    setState(prev => (prev ? { ...prev, isPlaying: false } : prev))
  }, [])

  const stop = useCallback(() => {
    setState(prev =>
      prev ? { ...prev, isPlaying: false, currentIndex: -1 } : prev
    )
  }, [])

  const setSpeed = useCallback((speed: PlaybackSpeed) => {
    setState(prev => (prev ? { ...prev, speed } : prev))
  }, [])

  const seekTo = useCallback((index: number) => {
    setState(prev => {
      if (!prev) return prev
      const clampedIndex = Math.max(
        -1,
        Math.min(index, prev.timeline.length - 1)
      )
      return { ...prev, currentIndex: clampedIndex }
    })
  }, [])

  const stepForward = useCallback(() => {
    setState(prev => {
      if (!prev) return prev
      const nextIndex = Math.min(
        prev.currentIndex + 1,
        prev.timeline.length - 1
      )
      return { ...prev, currentIndex: nextIndex, isPlaying: false }
    })
  }, [])

  const stepBackward = useCallback(() => {
    setState(prev => {
      if (!prev) return prev
      const prevIndex = Math.max(prev.currentIndex - 1, -1)
      return { ...prev, currentIndex: prevIndex, isPlaying: false }
    })
  }, [])

  // Computed values
  const currentEvent = useMemo(() => {
    if (!state || state.currentIndex < 0) return null
    return state.timeline[state.currentIndex] ?? null
  }, [state])

  const visibleEvents = useMemo(() => {
    if (!state || state.currentIndex < 0) return []
    return state.timeline.slice(0, state.currentIndex + 1)
  }, [state])

  const progress = useMemo(() => {
    if (!state || state.timeline.length === 0) return 0
    return ((state.currentIndex + 1) / state.timeline.length) * 100
  }, [state])

  return {
    state,
    session,
    isLoading,
    loadingProgress,
    error,
    currentEvent,
    visibleEvents,
    progress,
    play,
    pause,
    stop,
    setSpeed,
    seekTo,
    stepForward,
    stepBackward,
  }
}
