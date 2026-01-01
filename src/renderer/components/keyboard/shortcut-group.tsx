/**
 * ShortcutGroup Component
 *
 * Card-based grouping for shortcuts with gradient accents and 3D keyboard styling.
 * Combines shortcuts with the same description into a single row with multiple keys.
 */

import { useMemo } from 'react'
import { cn } from 'renderer/lib/utils'
import { formatShortcut, type ShortcutDefinition } from 'renderer/lib/keyboard'

interface ShortcutGroupProps {
  /** Category title */
  title: string
  /** Icon (emoji or Lucide icon) */
  icon?: string
  /** Shortcuts in this group */
  shortcuts: ShortcutDefinition[]
  /** Gradient color class */
  color?: string
  /** Additional class names */
  className?: string
}

/** Grouped shortcut with multiple keys for the same action */
interface GroupedShortcut {
  description: string
  keys: Array<{
    key: string
    modifiers?: ShortcutDefinition['modifiers']
    displayKey?: string
  }>
}

export function ShortcutGroup({
  title,
  icon,
  shortcuts,
  color = 'from-slate-500/20 to-slate-600/10',
  className,
}: ShortcutGroupProps) {
  // Group shortcuts by description
  const groupedShortcuts = useMemo(() => {
    const groups = new Map<string, GroupedShortcut>()

    for (const shortcut of shortcuts) {
      const existing = groups.get(shortcut.description)
      if (existing) {
        existing.keys.push({
          key: shortcut.key,
          modifiers: shortcut.modifiers,
          displayKey: shortcut.displayKey,
        })
      } else {
        groups.set(shortcut.description, {
          description: shortcut.description,
          keys: [
            {
              key: shortcut.key,
              modifiers: shortcut.modifiers,
              displayKey: shortcut.displayKey,
            },
          ],
        })
      }
    }

    return Array.from(groups.values())
  }, [shortcuts])

  if (shortcuts.length === 0) return null

  return (
    <div
      className={cn(
        'rounded-xl overflow-hidden',
        'bg-muted/30',
        'border border-border',
        className
      )}
    >
      {/* Header with gradient */}
      <div
        className={cn(
          'px-3 py-2 flex items-center gap-2',
          'bg-gradient-to-r',
          color,
          'border-b border-border/50'
        )}
      >
        {icon && <span className="text-sm">{icon}</span>}
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      </div>

      {/* Shortcuts list */}
      <div className="p-2 space-y-1">
        {groupedShortcuts.map(grouped => (
          <ShortcutItem grouped={grouped} key={grouped.description} />
        ))}
      </div>
    </div>
  )
}

interface ShortcutItemProps {
  grouped: GroupedShortcut
}

function ShortcutItem({ grouped }: ShortcutItemProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg',
        'hover:bg-muted/50 transition-colors duration-150'
      )}
    >
      {/* Description first for better scanning */}
      <span className="text-xs text-muted-foreground flex-1 truncate">
        {grouped.description}
      </span>

      {/* Multiple keyboard keys */}
      <div className="flex items-center gap-1 shrink-0">
        {grouped.keys.map((keyDef, index) => (
          <span
            className="flex items-center gap-1"
            key={`${keyDef.key}-${index}`}
          >
            {index > 0 && (
              <span className="text-xs text-muted-foreground">,</span>
            )}
            <kbd className="kbd-3d">
              {keyDef.displayKey ??
                formatShortcut(keyDef.key, keyDef.modifiers)}
            </kbd>
          </span>
        ))}
      </div>
    </div>
  )
}
