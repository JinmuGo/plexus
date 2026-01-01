import type { LucideIcon } from 'lucide-react'
import {
  Pencil,
  FileText,
  FilePlus,
  Terminal,
  Search,
  FolderSearch,
  Globe,
  Download,
  GitBranch,
  Code,
  FileCode,
  MessageSquare,
  HelpCircle,
} from 'lucide-react'

interface ToolIconConfig {
  icon: LucideIcon
  color: string
  bgColor: string
}

const TOOL_ICONS: Record<string, ToolIconConfig> = {
  Edit: { icon: Pencil, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  Read: { icon: FileText, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  Write: {
    icon: FilePlus,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
  },
  Bash: {
    icon: Terminal,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
  Grep: { icon: Search, color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
  Glob: {
    icon: FolderSearch,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
  },
  WebSearch: { icon: Globe, color: 'text-sky-400', bgColor: 'bg-sky-500/20' },
  WebFetch: {
    icon: Download,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/20',
  },
  Task: {
    icon: GitBranch,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/20',
  },
  NotebookEdit: {
    icon: FileCode,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
  },
  NotebookRead: {
    icon: FileCode,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  TodoWrite: {
    icon: MessageSquare,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
  },
  AskUserQuestion: {
    icon: HelpCircle,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
  },
  AskFollowupQuestion: {
    icon: HelpCircle,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
  },
}

// Default config for unknown tools
const DEFAULT_CONFIG: ToolIconConfig = {
  icon: Code,
  color: 'text-gray-400',
  bgColor: 'bg-gray-500/20',
}

interface ToolIconProps {
  toolName: string
  size?: 'sm' | 'md' | 'lg'
  showBackground?: boolean
  className?: string
}

const SIZES = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

const BG_SIZES = {
  sm: 'p-1',
  md: 'p-1.5',
  lg: 'p-2',
}

export function ToolIcon({
  toolName,
  size = 'sm',
  showBackground = false,
  className = '',
}: ToolIconProps) {
  const config = TOOL_ICONS[toolName] || DEFAULT_CONFIG
  const Icon = config.icon

  if (showBackground) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded ${config.bgColor} ${BG_SIZES[size]} ${className}`}
      >
        <Icon className={`${SIZES[size]} ${config.color}`} />
      </span>
    )
  }

  return <Icon className={`${SIZES[size]} ${config.color} ${className}`} />
}

export function getToolConfig(toolName: string): ToolIconConfig {
  return TOOL_ICONS[toolName] || DEFAULT_CONFIG
}

// Format tool input for display
export function formatToolInput(
  toolName: string,
  toolInput?: Record<string, unknown>
): string | null {
  if (!toolInput) return null

  // Extract relevant info based on tool type
  switch (toolName) {
    case 'Edit':
    case 'Read':
    case 'Write':
      if (toolInput.file_path && typeof toolInput.file_path === 'string') {
        const path = toolInput.file_path
        const parts = path.split('/')
        return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : path
      }
      break
    case 'Bash':
      if (toolInput.command && typeof toolInput.command === 'string') {
        const cmd = toolInput.command
        return cmd.length > 30 ? `${cmd.slice(0, 30)}...` : cmd
      }
      break
    case 'Grep':
    case 'Glob':
      if (toolInput.pattern && typeof toolInput.pattern === 'string') {
        return toolInput.pattern
      }
      break
    case 'WebSearch':
    case 'WebFetch':
      if (toolInput.url && typeof toolInput.url === 'string') {
        try {
          const url = new URL(toolInput.url)
          return url.hostname
        } catch {
          return null
        }
      }
      if (toolInput.query && typeof toolInput.query === 'string') {
        return toolInput.query
      }
      break
  }

  return null
}
