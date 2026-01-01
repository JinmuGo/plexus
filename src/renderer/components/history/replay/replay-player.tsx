import { useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, FolderOpen, Clock, Play } from 'lucide-react'
import { Button } from 'renderer/components/ui/button'
import { cn } from 'renderer/lib/utils'
import { useReplay } from './use-replay'
import { ReplayControls } from './replay-controls'
import { ReplayTimeline } from './replay-timeline'
import { MessageBubble, ToolCard, SystemMessage } from '../messages'
import type { HistoryMessage, ToolExecution } from 'shared/history-types'

interface ReplayPlayerProps {
  sessionId: string
  onClose?: () => void
}

export function ReplayPlayer({ sessionId, onClose }: ReplayPlayerProps) {
  const {
    state,
    session,
    isLoading,
    loadingProgress,
    error,
    visibleEvents,
    play,
    pause,
    stop,
    setSpeed,
    seekTo,
    stepForward,
    stepBackward,
  } = useReplay({
    sessionId,
    onComplete: () => {
      // Optional: auto-close or show completion message
    },
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new events appear
  useEffect(() => {
    if (bottomRef.current && state?.isPlaying) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [visibleEvents.length, state?.isPlaying])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focus is on an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (state?.isPlaying) {
            pause()
          } else {
            play()
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          stepBackward()
          break
        case 'ArrowRight':
          e.preventDefault()
          stepForward()
          break
        case 'Digit1':
          e.preventDefault()
          setSpeed(0.5)
          break
        case 'Digit2':
          e.preventDefault()
          setSpeed(1)
          break
        case 'Digit3':
          e.preventDefault()
          setSpeed(1.5)
          break
        case 'Digit4':
          e.preventDefault()
          setSpeed(2)
          break
        case 'Escape':
          onClose?.()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    state?.isPlaying,
    play,
    pause,
    stepBackward,
    stepForward,
    setSpeed,
    onClose,
  ])

  // Calculate current time based on visible events
  const currentTime = useMemo(() => {
    if (!state || visibleEvents.length === 0) return 0
    const lastEvent = visibleEvents[visibleEvents.length - 1]
    return lastEvent.timestamp - state.startTime
  }, [state, visibleEvents])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration: 1.5,
            repeat: Number.POSITIVE_INFINITY,
            ease: 'linear',
          }}
        >
          <Loader2 className="w-8 h-8 text-primary" />
        </motion.div>
        <div className="text-sm text-muted-foreground">
          Loading session data...
        </div>
        <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            animate={{ width: `${loadingProgress}%` }}
            className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full"
            initial={{ width: 0 }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
        <div className="text-destructive text-sm">{error}</div>
        <Button onClick={onClose} size="sm" variant="outline">
          Close
        </Button>
      </div>
    )
  }

  // No state loaded
  if (!state || !session) {
    return null
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Session Header */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="relative px-6 py-4 border-b bg-gradient-to-b from-muted/20 to-transparent"
        initial={{ opacity: 0, y: -10 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              {session.displayTitle || session.id.slice(0, 8)}
            </h2>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3 h-3" />
                {session.cwd}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(session.startedAt).toLocaleString()}
              </span>
            </div>
          </div>
          {session.durationMs && (
            <div className="text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full">
              {Math.round(session.durationMs / 1000)}s session
            </div>
          )}
        </div>
      </motion.div>

      {/* Message Area */}
      <div className="flex-1 min-h-0 relative">
        {/* Top gradient */}
        <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />

        <div className="h-full overflow-y-auto px-4 py-6" ref={scrollRef}>
          {visibleEvents.length === 0 && !state.isPlaying ? (
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 text-center"
              initial={{ opacity: 0, scale: 0.95 }}
            >
              <div
                className={cn(
                  'w-16 h-16 rounded-full flex items-center justify-center mb-4',
                  'bg-gradient-to-br from-primary/20 to-primary/5',
                  'border border-primary/20'
                )}
              >
                <Play className="w-6 h-6 text-primary ml-0.5" />
              </div>
              <div className="text-lg font-medium text-foreground mb-1">
                Ready to replay
              </div>
              <div className="text-sm text-muted-foreground">
                Press Play or Space to start the session replay
              </div>
            </motion.div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {visibleEvents.map((event, idx) => {
                  const isLast = idx === visibleEvents.length - 1

                  return (
                    <motion.div
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0.5 }}
                      initial={{ opacity: 0, y: 16, scale: 0.98 }}
                      key={event.id}
                      layout
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                      }}
                    >
                      {event.type === 'message' ? (
                        (event.data as HistoryMessage).role === 'system' ? (
                          <SystemMessage
                            message={event.data as HistoryMessage}
                          />
                        ) : (
                          <MessageBubble
                            isActive={isLast && state.isPlaying}
                            message={event.data as HistoryMessage}
                            showCopyButton={false}
                          />
                        )
                      ) : (
                        <ToolCard
                          execution={event.data as ToolExecution}
                          isActive={isLast && state.isPlaying}
                        />
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Bottom gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none" />
      </div>

      {/* Timeline */}
      <ReplayTimeline
        currentIndex={state.currentIndex}
        onSeek={seekTo}
        startTime={state.startTime}
        timeline={state.timeline}
        totalDuration={state.totalDuration}
      />

      {/* Controls */}
      <ReplayControls
        currentIndex={state.currentIndex}
        currentTime={currentTime}
        isPlaying={state.isPlaying}
        onPause={pause}
        onPlay={play}
        onSpeedChange={setSpeed}
        onStepBackward={stepBackward}
        onStepForward={stepForward}
        onStop={stop}
        speed={state.speed}
        totalDuration={state.totalDuration}
        totalEvents={state.timeline.length}
      />
    </div>
  )
}
