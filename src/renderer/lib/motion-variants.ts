import type { Variants } from 'framer-motion'
import { springs, durations, easings, stagger } from './motion'

/**
 * Card animations - refined entry/exit
 */
export const cardVariants: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springs.gentle,
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: { duration: durations.fast, ease: easings.sharp },
  },
}

/**
 * Container for staggered children
 */
export const containerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: stagger.fast,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: stagger.micro,
      staggerDirection: -1,
    },
  },
}

/**
 * Side panel slide animation
 */
export const sidePanelVariants: Variants = {
  initial: { x: '100%', opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: springs.smooth,
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { duration: durations.normal, ease: easings.easeIn },
  },
}

/**
 * Collapse/expand animation
 */
export const collapseVariants: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: 'auto',
    opacity: 1,
    transition: springs.gentle,
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: durations.fast },
  },
}

/**
 * Activity item animations
 */
export const activityItemVariants: Variants = {
  initial: { opacity: 0, x: -10 },
  animate: {
    opacity: 1,
    x: 0,
    transition: springs.gentle,
  },
  exit: { opacity: 0, transition: { duration: durations.instant } },
}

/**
 * Hover lift effect for cards - Raycast style
 */
export const hoverLift = {
  whileHover: {
    y: -3,
    scale: 1.01,
    transition: springs.snappy,
  },
  whileTap: { scale: 0.98 },
}

/**
 * List item animations with stagger support
 */
export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: springs.gentle,
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: durations.fast },
  },
}

/**
 * Modal/Dialog animations
 */
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: springs.bounce,
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 10,
    transition: { duration: durations.fast, ease: easings.easeIn },
  },
}
