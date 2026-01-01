import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  ChevronDown,
} from 'lucide-react'
import { Button } from 'renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'renderer/components/ui/dropdown-menu'
import { cn } from 'renderer/lib/utils'
import type { PlaybackSpeed } from 'shared/history-types'

interface ReplayControlsProps {
  isPlaying: boolean
  speed: PlaybackSpeed
  currentIndex: number
  totalEvents: number
  currentTime: number
  totalDuration: number
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onSpeedChange: (speed: PlaybackSpeed) => void
  onStepBackward: () => void
  onStepForward: () => void
}

const SPEED_OPTIONS: PlaybackSpeed[] = [0.5, 1, 1.5, 2]

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function ReplayControls({
  isPlaying,
  speed,
  currentIndex,
  totalEvents,
  currentTime,
  totalDuration,
  onPlay,
  onPause,
  onStop,
  onSpeedChange,
  onStepBackward,
  onStepForward,
}: ReplayControlsProps) {
  const canStepBackward = currentIndex > -1
  const canStepForward = currentIndex < totalEvents - 1
  const isAtEnd = currentIndex >= totalEvents - 1

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-t bg-muted/30">
      {/* Left: Time display */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-[100px]">
        <span className="font-mono">{formatDuration(currentTime)}</span>
        <span>/</span>
        <span className="font-mono">{formatDuration(totalDuration)}</span>
      </div>

      {/* Center: Playback controls */}
      <div className="flex items-center gap-1">
        {/* Step backward */}
        <Button
          className="h-8 w-8"
          disabled={!canStepBackward}
          onClick={onStepBackward}
          size="icon"
          title="Previous event (←)"
          variant="ghost"
        >
          <SkipBack className="w-4 h-4" />
        </Button>

        {/* Play/Pause */}
        <Button
          className={cn(
            'h-10 w-10 rounded-full',
            isPlaying &&
              'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
          onClick={isPlaying ? onPause : onPlay}
          size="icon"
          title={
            isPlaying
              ? 'Pause (Space)'
              : isAtEnd
                ? 'Restart (Space)'
                : 'Play (Space)'
          }
          variant={isPlaying ? 'default' : 'outline'}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" />
          )}
        </Button>

        {/* Stop */}
        <Button
          className="h-8 w-8"
          disabled={currentIndex === -1 && !isPlaying}
          onClick={onStop}
          size="icon"
          title="Stop"
          variant="ghost"
        >
          <Square className="w-4 h-4" />
        </Button>

        {/* Step forward */}
        <Button
          className="h-8 w-8"
          disabled={!canStepForward}
          onClick={onStepForward}
          size="icon"
          title="Next event (→)"
          variant="ghost"
        >
          <SkipForward className="w-4 h-4" />
        </Button>
      </div>

      {/* Right: Speed selector + Event counter */}
      <div className="flex items-center gap-3 min-w-[100px] justify-end">
        {/* Event counter */}
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} / {totalEvents}
        </span>

        {/* Speed selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-7 px-2 text-xs gap-1"
              size="sm"
              variant="outline"
            >
              {speed}x
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SPEED_OPTIONS.map(s => (
              <DropdownMenuItem
                className={cn('text-xs', s === speed && 'bg-accent')}
                key={s}
                onClick={() => onSpeedChange(s)}
              >
                {s}x {s === 1 && '(Normal)'}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
