/**
 * Info Tooltip Component
 *
 * Displays an info icon with hover tooltip for additional context.
 */

import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { cn } from 'renderer/lib/utils'

interface InfoTooltipProps {
  content: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function InfoTooltip({
  content,
  side = 'top',
  className,
}: InfoTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center justify-center cursor-help opacity-50 hover:opacity-100 transition-opacity',
            className
          )}
          type="button"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-xs p-2 text-xs text-muted-foreground"
        side={side}
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
