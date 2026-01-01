/**
 * Cheatsheet Overlay Component
 *
 * Full-screen overlay showing all available keyboard shortcuts.
 * Opened with '?' key, closed with Escape or clicking outside.
 */

import { useEffect, useMemo } from 'react'
import { X, Keyboard } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from 'renderer/lib/utils'
import {
  useShortcutContext,
  type ShortcutCategory,
  type ShortcutDefinition,
} from 'renderer/lib/keyboard'
import { ShortcutGroup } from './shortcut-group'

interface CheatsheetOverlayProps {
  className?: string
}

const CATEGORY_CONFIG: Record<
  ShortcutCategory,
  { title: string; icon: string; order: number; color: string }
> = {
  navigation: {
    title: 'Navigation',
    icon: '🧭',
    order: 1,
    color: 'from-sky-500/15 to-transparent',
  },
  list: {
    title: 'List',
    icon: '↕️',
    order: 2,
    color: 'from-teal-500/15 to-transparent',
  },
  permission: {
    title: 'Permission',
    icon: '🔐',
    order: 3,
    color: 'from-orange-500/15 to-transparent',
  },
  actions: {
    title: 'Actions',
    icon: '⚡',
    order: 4,
    color: 'from-violet-500/15 to-transparent',
  },
  playback: {
    title: 'Playback',
    icon: '▶️',
    order: 5,
    color: 'from-pink-500/15 to-transparent',
  },
  system: {
    title: 'System',
    icon: '⚙️',
    order: 6,
    color: 'from-zinc-500/15 to-transparent',
  },
}

export function CheatsheetOverlay({ className }: CheatsheetOverlayProps) {
  const { showCheatsheet, closeCheatsheet, registry, activeScope } =
    useShortcutContext()

  // Get shortcuts organized by category
  // Re-compute when cheatsheet opens to get latest registered shortcuts
  const shortcutsByCategory = useMemo(() => {
    if (!showCheatsheet) return []

    const all = registry.getAll()
    const filtered = all.filter(
      s => s.scope === 'global' || s.scope === activeScope
    )

    const byCategory = new Map<ShortcutCategory, ShortcutDefinition[]>()

    for (const shortcut of filtered) {
      // Skip the cheatsheet toggle itself
      if (shortcut.key === '?') continue

      const existing = byCategory.get(shortcut.category) ?? []
      byCategory.set(shortcut.category, [...existing, shortcut])
    }

    // Sort categories by order
    return Array.from(byCategory.entries()).sort(
      ([a], [b]) => CATEGORY_CONFIG[a].order - CATEGORY_CONFIG[b].order
    )
  }, [registry, activeScope, showCheatsheet])

  // Close on Escape
  useEffect(() => {
    if (!showCheatsheet) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault()
        closeCheatsheet()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showCheatsheet, closeCheatsheet])

  return (
    <AnimatePresence>
      {showCheatsheet && (
        <>
          {/* Backdrop */}
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={closeCheatsheet}
            transition={{ duration: 0.2 }}
          />

          {/* Modal */}
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn(
              'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
              'w-full max-w-2xl max-h-[85vh] overflow-hidden',
              // Solid background
              'bg-background',
              'rounded-2xl',
              'border border-border',
              'shadow-2xl shadow-black/25',
              className
            )}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Keyboard Shortcuts
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {activeScope === 'global' ? 'Global' : activeScope} view
                  </p>
                </div>
              </div>
              <button
                className={cn(
                  'p-2 rounded-xl transition-all duration-200',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-muted',
                  'active:scale-95'
                )}
                onClick={closeCheatsheet}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto max-h-[calc(85vh-120px)]">
              <div className="grid grid-cols-2 gap-4">
                {shortcutsByCategory.map(([category, shortcuts]) => (
                  <ShortcutGroup
                    color={CATEGORY_CONFIG[category].color}
                    icon={CATEGORY_CONFIG[category].icon}
                    key={category}
                    shortcuts={shortcuts}
                    title={CATEGORY_CONFIG[category].title}
                  />
                ))}
              </div>

              {shortcutsByCategory.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Keyboard className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">No shortcuts for this view</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border bg-muted/30">
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                Press
                <kbd className="kbd-3d text-xs">?</kbd>
                or
                <kbd className="kbd-3d text-xs">Esc</kbd>
                to close
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
