import { describe, it, expect } from 'vitest'
import {
  createIpcMessage,
  getSocketPath,
  type SessionKillMessage,
  type SessionStdinMessage,
  type SessionResizeMessage,
} from './ipc-protocol'

describe('IPC Protocol', () => {
  describe('createIpcMessage', () => {
    it('should create a session:kill message with SIGTERM', () => {
      const sessionId = 'test-session-123'
      const message = createIpcMessage<SessionKillMessage>(
        'session:kill',
        sessionId,
        { signal: 'SIGTERM' }
      )

      expect(message.type).toBe('session:kill')
      expect(message.sessionId).toBe(sessionId)
      expect(message.payload.signal).toBe('SIGTERM')
      expect(message.timestamp).toBeDefined()
      expect(typeof message.timestamp).toBe('number')
    })

    it('should create a session:kill message with SIGKILL', () => {
      const sessionId = 'test-session-456'
      const message = createIpcMessage<SessionKillMessage>(
        'session:kill',
        sessionId,
        { signal: 'SIGKILL' }
      )

      expect(message.type).toBe('session:kill')
      expect(message.sessionId).toBe(sessionId)
      expect(message.payload.signal).toBe('SIGKILL')
    })

    it('should create a session:stdin message', () => {
      const sessionId = 'test-session-789'
      const message = createIpcMessage<SessionStdinMessage>(
        'session:stdin',
        sessionId,
        { data: 'y\n', raw: false }
      )

      expect(message.type).toBe('session:stdin')
      expect(message.sessionId).toBe(sessionId)
      expect(message.payload.data).toBe('y\n')
      expect(message.payload.raw).toBe(false)
    })

    it('should create a session:resize message', () => {
      const sessionId = 'test-session-resize'
      const message = createIpcMessage<SessionResizeMessage>(
        'session:resize',
        sessionId,
        { cols: 120, rows: 40 }
      )

      expect(message.type).toBe('session:resize')
      expect(message.sessionId).toBe(sessionId)
      expect(message.payload.cols).toBe(120)
      expect(message.payload.rows).toBe(40)
    })

    it('should include a valid timestamp', () => {
      const before = Date.now()
      const message = createIpcMessage<SessionKillMessage>(
        'session:kill',
        'test',
        { signal: 'SIGTERM' }
      )
      const after = Date.now()

      expect(message.timestamp).toBeGreaterThanOrEqual(before)
      expect(message.timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('getSocketPath', () => {
    it('should return a valid socket path', () => {
      const socketPath = getSocketPath()

      expect(socketPath).toBeDefined()
      expect(typeof socketPath).toBe('string')
      expect(socketPath).toContain('plexus.sock')
    })

    it('should return platform-appropriate path', () => {
      const socketPath = getSocketPath()

      if (process.platform === 'win32') {
        expect(socketPath).toMatch(/\\plexus\.sock$/)
      } else {
        expect(socketPath).toBe('/tmp/plexus.sock')
      }
    })
  })
})
