import type * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from 'renderer/lib/utils'

const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 whitespace-nowrap
   rounded-lg text-sm font-medium
   transition-all duration-150 ease-out
   disabled:pointer-events-none disabled:opacity-40
   [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4
   shrink-0 [&_svg]:shrink-0
   outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
   focus-visible:ring-offset-background
   active:scale-[0.98]`,
  {
    variants: {
      variant: {
        default: `bg-primary text-primary-foreground
                  hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20`,
        destructive: `bg-destructive text-white
                      hover:bg-destructive/90 hover:shadow-lg hover:shadow-destructive/20`,
        outline: `border border-border bg-transparent text-foreground
                  hover:bg-secondary hover:border-border/80`,
        secondary: `bg-secondary text-secondary-foreground
                    hover:bg-secondary/80`,
        ghost: `text-muted-foreground hover:bg-secondary/80 hover:text-foreground`,
        link: `text-primary underline-offset-4 hover:underline`,
        gradient: `bg-gradient-to-r from-primary to-accent text-white
                   hover:opacity-90 hover:shadow-lg hover:shadow-primary/25`,
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 text-xs has-[>svg]:px-2.5',
        lg: 'h-11 rounded-lg px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      {...props}
    />
  )
}

export { Button, buttonVariants }
