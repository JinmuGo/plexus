import type { LucideIcon } from 'lucide-react'
import { Circle, Sparkles, Bell, RefreshCw, CircleOff, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import type { SessionPhase } from 'shared/hook-types'
import { cn } from 'renderer/lib/utils'

interface StatusIconConfig {
  icon: LucideIcon
  color: string
  bgColor: string
  stripColor: string
  glowClass: string
  label: string
  animationType?: 'spin' | 'pulse' | 'bounce' | 'glow'
}

export const STATUS_CONFIG: Record<SessionPhase, StatusIconConfig> = {
  idle: {
    icon: Circle,
    color: 'text-status-idle',
    bgColor: 'bg-status-idle/15',
    stripColor: 'border-l-status-idle',
    glowClass: '',
    label: 'Idle',
  },
  processing: {
    icon: Sparkles,
    color: 'text-status-thinking',
    bgColor: 'bg-status-thinking/15',
    stripColor: 'border-l-status-thinking',
    glowClass: 'glow-status-thinking',
    label: 'Thinking...',
    animationType: 'pulse',
  },
  waitingForInput: {
    icon: Zap,
    color: 'text-status-active',
    bgColor: 'bg-status-active/15',
    stripColor: 'border-l-status-active',
    glowClass: 'glow-status-active',
    label: 'Ready',
    animationType: 'glow',
  },
  waitingForApproval: {
    icon: Bell,
    color: 'text-status-approval',
    bgColor: 'bg-status-approval/15',
    stripColor: 'border-l-status-approval',
    glowClass: 'glow-status-approval',
    label: 'Approval',
    animationType: 'bounce',
  },
  compacting: {
    icon: RefreshCw,
    color: 'text-primary',
    bgColor: 'bg-primary/15',
    stripColor: 'border-l-primary',
    glowClass: '',
    label: 'Compacting',
    animationType: 'spin',
  },
  ended: {
    icon: CircleOff,
    color: 'text-status-idle',
    bgColor: 'bg-status-idle/10',
    stripColor: 'border-l-status-idle/50',
    glowClass: '',
    label: 'Ended',
  },
}

interface StatusIconProps {
  phase: SessionPhase
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
  showGlow?: boolean
}

const SIZES = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

// Animation variants for different status types
const animationVariants = {
  spin: {
    animate: { rotate: 360 },
    transition: {
      duration: 1.5,
      repeat: Number.POSITIVE_INFINITY,
      ease: 'linear' as const,
    },
  },
  pulse: {
    animate: { scale: [1, 1.2, 1], opacity: [1, 0.7, 1] },
    transition: {
      duration: 1.5,
      repeat: Number.POSITIVE_INFINITY,
      ease: 'easeInOut' as const,
    },
  },
  bounce: {
    animate: { y: [0, -3, 0], rotate: [0, 10, -10, 0] },
    transition: {
      duration: 0.8,
      repeat: Number.POSITIVE_INFINITY,
      ease: 'easeInOut' as const,
    },
  },
  glow: {
    animate: { scale: [1, 1.1, 1] },
    transition: {
      duration: 2,
      repeat: Number.POSITIVE_INFINITY,
      ease: 'easeInOut' as const,
    },
  },
}

export function StatusIcon({
  phase,
  size = 'sm',
  showLabel = false,
  className = '',
  showGlow = false,
}: StatusIconProps) {
  const config = STATUS_CONFIG[phase]
  const Icon = config.icon
  const animation = config.animationType
    ? animationVariants[config.animationType]
    : null

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('relative', showGlow && config.glowClass)}>
        {animation ? (
          <motion.span
            animate={animation.animate}
            className="inline-flex"
            transition={animation.transition}
          >
            <Icon className={cn(SIZES[size], config.color)} />
          </motion.span>
        ) : (
          <Icon className={cn(SIZES[size], config.color)} />
        )}
        {/* Animated ring for approval state */}
        {phase === 'waitingForApproval' && (
          <motion.span
            animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
            className="absolute inset-0 rounded-full border-2 border-status-approval"
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
      </span>
      {showLabel && (
        <span className={cn('text-xs font-medium', config.color)}>
          {config.label}
        </span>
      )}
    </span>
  )
}

/**
 * Compact status dot for minimal displays
 */
export function StatusDot({
  phase,
  size = 'sm',
  className = '',
}: {
  phase: SessionPhase
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const config = STATUS_CONFIG[phase]
  const dotSizes = { sm: 'h-2 w-2', md: 'h-2.5 w-2.5', lg: 'h-3 w-3' }

  return (
    <span className={cn('relative inline-flex', className)}>
      <span
        className={cn(
          'rounded-full',
          dotSizes[size],
          config.bgColor,
          'ring-2 ring-offset-1 ring-offset-background',
          phase === 'waitingForApproval' && 'ring-status-approval/50',
          phase === 'processing' && 'ring-status-thinking/50',
          phase === 'waitingForInput' && 'ring-status-active/50',
          phase === 'idle' && 'ring-status-idle/30',
          phase === 'ended' && 'ring-status-idle/20',
          phase === 'compacting' && 'ring-primary/50'
        )}
      />
      {/* Pulse animation for active states */}
      {(phase === 'waitingForApproval' || phase === 'processing') && (
        <motion.span
          animate={{ scale: [1, 2], opacity: [0.5, 0] }}
          className={cn(
            'absolute inset-0 rounded-full',
            phase === 'waitingForApproval'
              ? 'bg-status-approval'
              : 'bg-status-thinking'
          )}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
    </span>
  )
}
