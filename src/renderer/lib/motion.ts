import type { Transition } from 'framer-motion'

/**
 * Check if reduced motion is preferred
 * This respects user's system preference for accessibility
 */
export const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Get duration based on reduced motion preference
 */
export function getOptimizedDuration(duration: number): number {
  return prefersReducedMotion ? 0 : duration
}

/**
 * Spring configurations for different use cases
 * Refined for premium SaaS feel
 */
export const springs = {
  // Micro interactions - fast and precise (buttons, toggles)
  micro: { type: 'spring', stiffness: 600, damping: 35 } as Transition,
  // Gentle spring for UI elements (cards, panels)
  gentle: { type: 'spring', stiffness: 280, damping: 28 } as Transition,
  // Bouncy spring for modals and overlays
  bounce: { type: 'spring', stiffness: 400, damping: 25 } as Transition,
  // Smooth for layout animations
  smooth: { type: 'spring', stiffness: 200, damping: 24 } as Transition,
  // Snappy for quick interactions
  snappy: { type: 'spring', stiffness: 500, damping: 30 } as Transition,
} as const

/**
 * Duration constants (in seconds)
 * Calibrated for responsive feel
 */
export const durations = {
  instant: 0.1,
  fast: 0.15,
  normal: 0.25,
  slow: 0.35,
  panel: 0.4,
} as const

/**
 * Easing curves for tween animations
 * Based on Material Design and Apple HIG
 */
export const easings = {
  // Standard ease out - quick start, smooth end
  easeOut: [0.0, 0.0, 0.2, 1] as const,
  // Ease in - slow start, quick end
  easeIn: [0.4, 0.0, 1, 1] as const,
  // Ease in-out - smooth both ends
  easeInOut: [0.4, 0.0, 0.2, 1] as const,
  // Emphasis with overshoot
  emphasis: [0.34, 1.56, 0.64, 1] as const,
  // Natural deceleration
  decelerate: [0.0, 0.0, 0.0, 1] as const,
  // Sharp for dismissals
  sharp: [0.4, 0.0, 0.6, 1] as const,
} as const

/**
 * Stagger configuration for lists and grids
 */
export const stagger = {
  micro: 0.02,
  fast: 0.04,
  normal: 0.06,
  slow: 0.1,
} as const

/**
 * Common transition presets
 */
export const transitions = {
  // For hover effects
  hover: {
    duration: durations.fast,
    ease: easings.easeOut,
  },
  // For enter animations
  enter: {
    ...springs.gentle,
  },
  // For exit animations
  exit: {
    duration: durations.fast,
    ease: easings.sharp,
  },
  // For layout changes
  layout: {
    ...springs.smooth,
  },
} as const

/**
 * Reduced motion variants - instant transitions for accessibility
 */
export const reducedMotionTransition: Transition = {
  duration: 0,
}

/**
 * Get optimized spring based on reduced motion preference
 */
export function getOptimizedSpring(spring: Transition): Transition {
  return prefersReducedMotion ? reducedMotionTransition : spring
}

/**
 * Performance-optimized animation properties
 * Uses only transform and opacity for GPU compositing
 */
export const gpuOptimizedProps = {
  // These properties trigger GPU compositing and are the most performant
  transform: true,
  opacity: true,
  // Hint for browser optimization
  willChange: 'transform, opacity',
} as const
