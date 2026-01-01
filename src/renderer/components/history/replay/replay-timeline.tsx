import { useMemo, useCallback, useRef } from 'react'
import { Terminal, MessageSquare } from 'lucide-react'
import { cn } from 'renderer/lib/utils'
import type { ReplayTimelineEvent, HistoryMessage } from 'shared/history-types'

interface ReplayTimelineProps {
  timeline: ReplayTimelineEvent[]
  currentIndex: number
  startTime: number
  totalDuration: number
  onSeek: (index: number) => void
}

function getEventIcon(event: ReplayTimelineEvent) {
  if (event.type === 'tool') {
    return <Terminal className="w-2.5 h-2.5" />
  }
  return <MessageSquare className="w-2.5 h-2.5" />
}

function getEventColor(event: ReplayTimelineEvent, isPast: boolean) {
  if (event.type === 'tool') {
    return isPast ? 'bg-blue-400' : 'bg-blue-400/40'
  }

  const message = event.data as HistoryMessage
  if (message.role === 'user') {
    return isPast ? 'bg-primary' : 'bg-primary/40'
  }
  if (message.role === 'assistant') {
    return isPast ? 'bg-emerald-400' : 'bg-emerald-400/40'
  }
  return isPast ? 'bg-muted-foreground' : 'bg-muted-foreground/40'
}

export function ReplayTimeline({
  timeline,
  currentIndex,
  startTime,
  totalDuration,
  onSeek,
}: ReplayTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  // Calculate position for each event
  const eventPositions = useMemo(() => {
    if (totalDuration === 0) {
      // If all events happen at the same time, distribute evenly
      return timeline.map((_, idx) => (idx / (timeline.length - 1 || 1)) * 100)
    }

    return timeline.map(event => {
      return ((event.timestamp - startTime) / totalDuration) * 100
    })
  }, [timeline, startTime, totalDuration])

  // Calculate progress percentage
  const progressPercent = useMemo(() => {
    if (currentIndex < 0 || timeline.length === 0) return 0
    if (totalDuration === 0) {
      return ((currentIndex + 1) / timeline.length) * 100
    }
    const currentEvent = timeline[currentIndex]
    return ((currentEvent.timestamp - startTime) / totalDuration) * 100
  }, [currentIndex, timeline, startTime, totalDuration])

  // Handle click on track to seek
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return

      const rect = trackRef.current.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickPercent = (clickX / rect.width) * 100

      // Find the closest event to the click position
      let closestIndex = 0
      let closestDistance = Math.abs(eventPositions[0] - clickPercent)

      for (let i = 1; i < eventPositions.length; i++) {
        const distance = Math.abs(eventPositions[i] - clickPercent)
        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = i
        }
      }

      onSeek(closestIndex)
    },
    [eventPositions, onSeek]
  )

  // Limit markers for performance (show dots for >50 events)
  const showCompact = timeline.length > 50

  return (
    <div className="px-4 py-3 border-t">
      {/* Track */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard navigation handled via buttons */}
      <div
        aria-label="Timeline scrubber"
        aria-valuemax={timeline.length}
        aria-valuemin={1}
        aria-valuenow={currentIndex + 1}
        className="relative h-6 cursor-pointer group"
        onClick={handleTrackClick}
        ref={trackRef}
        role="slider"
        tabIndex={-1}
      >
        {/* Background track */}
        <div className="absolute inset-y-2 inset-x-0 bg-muted rounded-full" />

        {/* Progress fill */}
        <div
          className="absolute inset-y-2 left-0 bg-primary/30 rounded-full transition-all duration-150"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Current position indicator */}
        {currentIndex >= 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary transition-all duration-150"
            style={{ left: `${progressPercent}%` }}
          >
            {/* Handle */}
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary shadow-md" />
          </div>
        )}

        {/* Event markers */}
        {timeline.map((event, idx) => {
          const isPast = idx <= currentIndex
          const isCurrent = idx === currentIndex
          const position = eventPositions[idx]

          if (showCompact) {
            // Compact mode: just dots
            return (
              <button
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
                  'w-1.5 h-1.5 rounded-full transition-all',
                  'hover:scale-150',
                  isCurrent && 'ring-2 ring-primary ring-offset-1',
                  getEventColor(event, isPast)
                )}
                key={event.id}
                onClick={e => {
                  e.stopPropagation()
                  onSeek(idx)
                }}
                style={{ left: `${position}%` }}
                title={`Event ${idx + 1}`}
                type="button"
              />
            )
          }

          // Full mode: icons
          return (
            <button
              className={cn(
                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
                'flex items-center justify-center',
                'w-5 h-5 rounded-full transition-all',
                'hover:scale-110',
                isCurrent && 'ring-2 ring-primary ring-offset-1',
                getEventColor(event, isPast),
                isPast ? 'text-white' : 'text-white/60'
              )}
              key={event.id}
              onClick={e => {
                e.stopPropagation()
                onSeek(idx)
              }}
              style={{ left: `${position}%` }}
              title={`Event ${idx + 1}: ${event.type === 'tool' ? 'Tool' : (event.data as HistoryMessage).role}`}
              type="button"
            >
              {getEventIcon(event)}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span>User</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span>Tool</span>
        </div>
      </div>
    </div>
  )
}
