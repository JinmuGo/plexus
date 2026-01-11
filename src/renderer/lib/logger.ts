/**
 * Renderer Logger
 *
 * Dev-only logging utilities for the renderer process.
 * These functions only output in development mode.
 */

// Check if we're in development mode (Vite)
const isDev = import.meta.env.DEV

/**
 * Dev-only console logging utilities.
 * These functions only output in development mode.
 */
export const devLog = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args)
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args)
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args)
  },
  error: (...args: unknown[]) => {
    // Errors are always logged regardless of mode
    console.error(...args)
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args)
  },
  time: (label: string) => {
    if (isDev) console.time(label)
  },
  timeEnd: (label: string) => {
    if (isDev) console.timeEnd(label)
  },
  group: (label: string) => {
    if (isDev) console.group(label)
  },
  groupCollapsed: (label: string) => {
    if (isDev) console.groupCollapsed(label)
  },
  groupEnd: () => {
    if (isDev) console.groupEnd()
  },
  table: (data: unknown) => {
    if (isDev) console.table(data)
  },
}
