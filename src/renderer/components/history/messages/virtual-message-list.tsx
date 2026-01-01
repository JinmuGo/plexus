import { useRef, useCallback, memo, useEffect, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDown } from 'lucide-react'
import { cn } from 'renderer/lib/utils'
import { Button } from 'renderer/components/ui/button'
import { MessageBubble } from './message-bubble'
import { ToolCard } from './tool-card'
import { ThinkingCard } from './thinking-card'
import { SystemMessage } from './system-message'
import type { TimelineItem } from './types'

interface VirtualMessageListProps {
  items: TimelineItem[]
  currentIndex?: number // For replay mode
  showScrollToBottom?: boolean
  autoScroll?: boolean
  onCopy?: (text: string) => void
}

// Estimate item heights for virtualization
const estimateSize = (item: TimelineItem) => {
  if (item.type === 'tool') return 56 // Collapsed tool card
  if (item.type === 'thinking') return 56 // Collapsed thinking card
  if (item.data.role === 'system') return 48
  // Estimate based on content length
  const contentLength = item.data.content?.length || 0
  const lines = Math.ceil(contentLength / 60) + 1
  return Math.max(80, lines * 24 + 60)
}

export const VirtualMessageList = memo(function VirtualMessageList({
  items,
  currentIndex,
  showScrollToBottom = true,
  autoScroll = false,
  onCopy,
}: VirtualMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasScrolledUp, setHasScrolledUp] = useState(false)
  const hasInitialScrolled = useRef(false)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: index => estimateSize(items[index]),
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Handle scroll position tracking
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 100
    setIsAtBottom(atBottom)

    if (!atBottom) {
      setHasScrolledUp(true)
    }
  }, [])

  // Custom smooth scroll animation using requestAnimationFrame
  const smoothScrollToBottom = useCallback(() => {
    if (!parentRef.current) return

    const element = parentRef.current
    const targetScroll = element.scrollHeight - element.clientHeight
    const startScroll = element.scrollTop
    const distance = targetScroll - startScroll

    if (distance <= 0) return

    const duration = Math.min(800, Math.max(400, distance * 0.5)) // 400-800ms based on distance
    const startTime = performance.now()

    const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOutCubic(progress)

      element.scrollTop = startScroll + distance * easedProgress

      if (progress < 1) {
        requestAnimationFrame(animateScroll)
      }
    }

    requestAnimationFrame(animateScroll)
  }, [])

  // Initial scroll to bottom when items first load
  useEffect(() => {
    if (items.length > 0 && !hasInitialScrolled.current) {
      // Small delay to ensure virtualizer has calculated sizes
      const timer = setTimeout(() => {
        smoothScrollToBottom()
        hasInitialScrolled.current = true
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [items.length, smoothScrollToBottom])

  // Auto-scroll when new items appear (for replay mode)
  useEffect(() => {
    if (autoScroll && isAtBottom && items.length > 0) {
      virtualizer.scrollToIndex(items.length - 1, { behavior: 'auto' })
    }
  }, [items.length, autoScroll, isAtBottom, virtualizer])

  // Scroll to current index in replay mode
  useEffect(() => {
    if (currentIndex !== undefined && currentIndex >= 0) {
      virtualizer.scrollToIndex(currentIndex, {
        behavior: 'auto',
        align: 'end',
      })
    }
  }, [currentIndex, virtualizer])

  const scrollToBottom = () => {
    virtualizer.scrollToIndex(items.length - 1, { behavior: 'auto' })
    setHasScrolledUp(false)
  }

  return (
    <div className="relative h-full">
      {/* Gradient fade at top */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none',
          'bg-gradient-to-b from-background via-background/80 to-transparent'
        )}
      />

      {/* Scrollable container */}
      <div
        className="h-full overflow-auto px-4 py-6"
        onScroll={handleScroll}
        ref={parentRef}
      >
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualItems.map(virtualRow => {
            const item = items[virtualRow.index]
            const isActive = currentIndex === virtualRow.index

            return (
              <div
                className="absolute top-0 left-0 w-full"
                data-index={virtualRow.index}
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="py-2">
                  <AnimatePresence mode="wait">
                    {item.type === 'message' ? (
                      item.data.role === 'system' ? (
                        <SystemMessage key={item.data.id} message={item.data} />
                      ) : (
                        <MessageBubble
                          isActive={isActive}
                          key={item.data.id}
                          message={item.data}
                          onCopy={onCopy}
                        />
                      )
                    ) : item.type === 'tool' ? (
                      <ToolCard
                        execution={item.data}
                        isActive={isActive}
                        key={item.data.id}
                      />
                    ) : (
                      <ThinkingCard
                        isActive={isActive}
                        key={item.data.id}
                        thinking={item.data}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Gradient fade at bottom */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none',
          'bg-gradient-to-t from-background via-background/80 to-transparent'
        )}
      />

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollToBottom && hasScrolledUp && !isAtBottom && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
            exit={{ opacity: 0, y: 10 }}
            initial={{ opacity: 0, y: 10 }}
          >
            <Button
              className={cn(
                'rounded-full shadow-lg gap-1.5 px-4',
                'bg-primary/90 hover:bg-primary',
                'text-primary-foreground text-xs'
              )}
              onClick={scrollToBottom}
              size="sm"
            >
              <ArrowDown className="w-3 h-3" />
              Scroll to bottom
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
