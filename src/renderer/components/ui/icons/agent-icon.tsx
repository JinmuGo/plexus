import type { AgentType } from 'shared/hook-types'
import { ClaudeIcon } from './claude-icon'
import { GeminiIcon } from './gemini-icon'
import { CursorIcon } from './cursor-icon'
import { cn } from 'renderer/lib/utils'

interface AgentIconProps {
  agent: AgentType
  size?: 'sm' | 'md' | 'lg' | number
  className?: string
  showBackground?: boolean
}

const SIZE_MAP = {
  sm: 14,
  md: 20,
  lg: 24,
} as const

type IconComponent = React.ComponentType<{ className?: string; size?: number }>

interface AgentConfig {
  Icon: IconComponent
  bgColor: string
  textColor: string
}

const AGENT_CONFIG: Record<AgentType, AgentConfig> = {
  claude: {
    Icon: ClaudeIcon,
    bgColor: 'bg-orange-500/20',
    textColor: 'text-orange-400',
  },
  gemini: {
    Icon: GeminiIcon,
    bgColor: 'bg-blue-500/20',
    textColor: 'text-blue-400',
  },
  cursor: {
    Icon: CursorIcon,
    bgColor: 'bg-purple-500/20',
    textColor: 'text-purple-400',
  },
}

export function AgentIcon({
  agent,
  size = 'md',
  className,
  showBackground = false,
}: AgentIconProps) {
  const numericSize = typeof size === 'number' ? size : SIZE_MAP[size]
  const config = AGENT_CONFIG[agent]
  const { Icon, bgColor, textColor } = config

  if (showBackground) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg shrink-0',
          bgColor,
          textColor,
          className
        )}
        style={{
          width: numericSize * 1.6,
          height: numericSize * 1.6,
        }}
      >
        <Icon size={numericSize} />
      </div>
    )
  }

  return (
    <span className={cn('shrink-0', textColor, className)}>
      <Icon size={numericSize} />
    </span>
  )
}
