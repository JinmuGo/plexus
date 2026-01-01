import type * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from 'renderer/lib/utils'

const badgeVariants = cva(
  `inline-flex items-center justify-center
   rounded-md border px-2 py-0.5
   text-xs font-medium
   w-fit whitespace-nowrap shrink-0
   [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none
   transition-colors duration-150 overflow-hidden`,
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
        outline: 'border-border text-muted-foreground',

        // Status variants - Raycast style (more vibrant)
        success:
          'border-status-active/30 bg-status-active/15 text-status-active',
        warning:
          'border-status-waiting/30 bg-status-waiting/15 text-status-waiting',
        info: 'border-status-thinking/30 bg-status-thinking/15 text-status-thinking',
        approval:
          'border-status-approval/30 bg-status-approval/15 text-status-approval animate-pulse',
        error: 'border-status-error/30 bg-status-error/15 text-status-error',
        idle: 'border-status-idle/20 bg-status-idle/10 text-status-idle',

        // Agent variants - colorful identity
        claude: 'border-agent-claude/30 bg-agent-claude/15 text-agent-claude',
        cursor: 'border-agent-cursor/30 bg-agent-cursor/15 text-agent-cursor',
        gemini: 'border-agent-gemini/30 bg-agent-gemini/15 text-agent-gemini',

        // Processing variant with glow
        processing:
          'border-status-thinking/30 bg-status-thinking/15 text-status-thinking',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      className={cn(badgeVariants({ variant }), className)}
      data-slot="badge"
      {...props}
    />
  )
}

export { Badge, badgeVariants }
