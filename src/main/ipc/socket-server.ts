import * as net from 'node:net'
import * as fs from 'node:fs'

import {
  getSocketPath,
  createIpcMessage,
  type IpcMessage,
  type AppStatusMessage,
  type SessionStdinMessage,
  type SessionResizeMessage,
  type SessionKillMessage,
} from 'shared/ipc-protocol'
import { sessionStore } from '../store/sessions'

interface SocketServerManager {
  start: () => void
  stop: () => void
  isRunning: () => boolean
  sendStdin: (sessionId: string, data: string, raw?: boolean) => boolean
  sendResize: (sessionId: string, cols: number, rows: number) => boolean
  sendKill: (sessionId: string, signal: 'SIGTERM' | 'SIGKILL') => boolean
}

export function createSocketServer(): SocketServerManager {
  let server: net.Server | null = null
  const socketPath = getSocketPath()

  // Map to track session ID → socket connection for stdin relay
  const sessionSocketMap = new Map<string, net.Socket>()

  const handleConnection = (socket: net.Socket) => {
    console.log('[SocketServer] Client connected')
    let buffer = ''
    let registeredSessionId: string | null = null

    socket.on('data', (data: Buffer) => {
      buffer += data.toString()

      // Process complete JSON messages (newline-delimited)
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)

        if (line.trim()) {
          try {
            const message: IpcMessage = JSON.parse(line)

            // Track session registration to map socket
            if (message.type === 'session:register') {
              registeredSessionId = message.sessionId
              sessionSocketMap.set(message.sessionId, socket)
              console.log(
                `[SocketServer] Session ${message.sessionId} registered with socket`
              )
            }

            processMessage(message, socket)
          } catch (error) {
            console.error('[SocketServer] Failed to parse message:', error)
          }
        }
        newlineIndex = buffer.indexOf('\n')
      }
    })

    socket.on('close', () => {
      console.log('[SocketServer] Client disconnected')
      // Clean up session socket mapping
      if (registeredSessionId) {
        sessionSocketMap.delete(registeredSessionId)
        console.log(
          `[SocketServer] Session ${registeredSessionId} socket removed`
        )
      }
    })

    socket.on('error', error => {
      console.error('[SocketServer] Socket error:', error)
    })
  }

  const processMessage = (message: IpcMessage, socket: net.Socket) => {
    // Legacy IPC processing - hook-based detection is now primary
    // This socket server is kept for backward compatibility with CLI wrapper
    console.log(
      `[SocketServer] Legacy IPC message: ${message.type} from ${message.sessionId}`
    )

    // Send acknowledgment for registration
    if (message.type === 'session:register') {
      const response = createIpcMessage<AppStatusMessage>(
        'app:status',
        message.sessionId,
        {
          connected: true,
          sessionsCount: sessionStore.getCount(),
        }
      )
      socket.write(`${JSON.stringify(response)}\n`)
    }
  }

  const cleanupSocket = () => {
    // Remove existing socket file if it exists
    try {
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath)
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  const start = () => {
    if (server) {
      console.log('[SocketServer] Server already running')
      return
    }

    cleanupSocket()

    server = net.createServer(handleConnection)

    server.on('error', error => {
      console.error('[SocketServer] Server error:', error)
    })

    server.listen(socketPath, () => {
      console.log(`[SocketServer] Listening on ${socketPath}`)
      // Set socket permissions (readable/writable by owner)
      try {
        fs.chmodSync(socketPath, 0o600)
      } catch {
        // Ignore permission errors on Windows
      }
    })
  }

  const stop = () => {
    if (server) {
      server.close(() => {
        console.log('[SocketServer] Server stopped')
      })
      cleanupSocket()
      server = null
    }
  }

  const isRunning = () => server !== null

  // Send stdin input to a specific session
  const sendStdin = (sessionId: string, data: string, raw = false): boolean => {
    const socket = sessionSocketMap.get(sessionId)
    if (!socket || socket.destroyed) {
      return false
    }

    const message = createIpcMessage<SessionStdinMessage>(
      'session:stdin',
      sessionId,
      { data, raw }
    )

    try {
      socket.write(`${JSON.stringify(message)}\n`)
      return true
    } catch {
      return false
    }
  }

  // Send resize to a specific session
  const sendResize = (
    sessionId: string,
    cols: number,
    rows: number
  ): boolean => {
    const socket = sessionSocketMap.get(sessionId)
    if (!socket || socket.destroyed) {
      return false
    }

    const message = createIpcMessage<SessionResizeMessage>(
      'session:resize',
      sessionId,
      { cols, rows }
    )

    try {
      socket.write(`${JSON.stringify(message)}\n`)
      return true
    } catch {
      return false
    }
  }

  // Send kill signal to a specific session
  const sendKill = (
    sessionId: string,
    signal: 'SIGTERM' | 'SIGKILL'
  ): boolean => {
    const socket = sessionSocketMap.get(sessionId)
    if (!socket || socket.destroyed) {
      return false
    }

    const message = createIpcMessage<SessionKillMessage>(
      'session:kill',
      sessionId,
      { signal }
    )

    try {
      socket.write(`${JSON.stringify(message)}\n`)
      return true
    } catch {
      return false
    }
  }

  return {
    start,
    stop,
    isRunning,
    sendStdin,
    sendResize,
    sendKill,
  }
}
