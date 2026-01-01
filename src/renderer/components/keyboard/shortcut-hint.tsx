/**
 * ShortcutHint Component
 *
 * Small badge showing keyboard shortcut next to buttons.
 * Platform-aware (shows symbols on Mac, text on Windows/Linux).
 */

import { cn } from 'renderer/lib/utils'
import { formatShortcut, type Modifier } from 'renderer/lib/keyboard'

interface ShortcutHintProps {
  /** The key(s) for the shortcut (e.g., 'y', 'Escape', 'gg') */
  shortcut: string
  /** Modifier keys (e.g., ['meta', 'shift']) */
  modifiers?: Modifier[]
  /** Size variant */
  size?: 'sm' | 'md'
  /** Additional class names */
  className?: string
}

export function ShortcutHint({
  shortcut,
  modifiers,
  size = 'sm',
  className,
}: ShortcutHintProps) {
  const formatted = formatShortcut(shortcut, modifiers)

  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded',
        'bg-muted/50 text-muted-foreground font-mono',
        'border border-border/50',
        size === 'sm' && 'px-1 py-0.5 text-xs min-w-4 h-4',
        size === 'md' && 'px-1.5 py-0.5 text-xs min-w-5 h-5',
        className
      )}
    >
      {formatted}
    </kbd>
  )
}

/**
 * Inline shortcut hint for use inside buttons
 */
interface InlineShortcutHintProps {
  shortcut: string
  modifiers?: Modifier[]
  className?: string
}

export function InlineShortcutHint({
  shortcut,
  modifiers,
  className,
}: InlineShortcutHintProps) {
  const formatted = formatShortcut(shortcut, modifiers)

  return (
    <span
      className={cn(
        'ml-1.5 text-xs text-muted-foreground/70 font-mono',
        className
      )}
    >
      ({formatted})
    </span>
  )
}
