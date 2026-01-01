import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { X } from 'lucide-react'
import { SessionActionBar } from './session-action-bar'
import type { AgentSession } from 'shared/ipc-protocol'
import type { AgentStatus } from 'shared/types'

const { App } = window

interface LogViewerProps {
  session: AgentSession
  output: string[]
  onClose: () => void
}

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string }> = {
  idle: { label: 'Idle', color: 'text-green-400' },
  thinking: { label: 'Thinking', color: 'text-blue-400' },
  awaiting: { label: 'Awaiting Input', color: 'text-orange-400' },
  tool_use: { label: 'Tool Use', color: 'text-purple-400' },
  error: { label: 'Error', color: 'text-red-400' },
}

export function LogViewer({ session, output, onClose }: LogViewerProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstanceRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastOutputLengthRef = useRef(0)
  const statusConfig = STATUS_CONFIG[session.status]

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return

    const terminal = new Terminal({
      theme: {
        background: 'rgba(0, 0, 0, 0.5)',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#000000',
      },
      fontSize: 12,
      fontFamily: 'ui-monospace, monospace',
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 1000,
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(terminalRef.current)
    fitAddon.fit()

    // Handle keyboard input - send to PTY
    const onDataDisposable = terminal.onData(data => {
      App.sessions.stdin(session.id, data).catch(err => {
        console.error('Error sending stdin:', err)
      })
    })

    // Send terminal size to CLI when resized
    const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
      App.sessions.resize(session.id, cols, rows).catch(() => {
        // Ignore resize errors
      })
    })

    terminalInstanceRef.current = terminal
    fitAddonRef.current = fitAddon
    lastOutputLengthRef.current = 0

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(terminalRef.current)

    // Send initial size to CLI
    App.sessions.resize(session.id, terminal.cols, terminal.rows).catch(() => {
      // Ignore initial resize errors
    })

    return () => {
      onDataDisposable.dispose()
      onResizeDisposable.dispose()
      resizeObserver.disconnect()
      terminal.dispose()
      terminalInstanceRef.current = null
      fitAddonRef.current = null
    }
  }, [session.id])

  // Write new output to terminal
  useEffect(() => {
    const terminal = terminalInstanceRef.current
    if (!terminal) return

    // Only write new output chunks (incremental updates)
    const newChunks = output.slice(lastOutputLengthRef.current)
    if (newChunks.length > 0) {
      // Write each raw chunk directly - xterm.js handles ANSI/carriage returns
      for (const chunk of newChunks) {
        terminal.write(chunk)
      }
      lastOutputLengthRef.current = output.length
    }
  }, [output])

  // Reset terminal when session changes
  useEffect(() => {
    const terminal = terminalInstanceRef.current
    if (terminal) {
      terminal.clear()
      lastOutputLengthRef.current = 0
      // Write all existing output chunks
      if (output.length > 0) {
        for (const chunk of output) {
          terminal.write(chunk)
        }
        lastOutputLengthRef.current = output.length
      }
    }
  }, [session.id])

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">
              {session.command} {session.args.join(' ')}
            </CardTitle>
            <Badge className={statusConfig.color} variant="outline">
              {statusConfig.label}
            </Badge>
          </div>
          <button
            className="p-1 rounded hover:bg-accent transition-colors"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          <span>PID: {session.pid}</span>
          <span className="mx-2">•</span>
          <span className="truncate">{session.cwd}</span>
        </div>
        {/* Action bar for HITL control */}
        <SessionActionBar session={session} />
      </CardHeader>
      <CardContent className="flex-1 pt-0 min-h-0 pb-3">
        <div
          className="h-full w-full rounded overflow-hidden"
          ref={terminalRef}
        />
      </CardContent>
    </Card>
  )
}
