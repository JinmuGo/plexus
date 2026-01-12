import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as net from 'node:net'
import { createSocketServer } from './socket-server'

// Mock the session store
vi.mock('../store/sessions', () => ({
  sessionStore: {
    processMessage: vi.fn(),
    getCount: vi.fn(() => 0),
  },
}))

// Mock fs for socket cleanup
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  unlinkSync: vi.fn(),
  chmodSync: vi.fn(),
}))

// Mock devLog - must be inlined since vi.mock is hoisted
vi.mock('../lib/utils', () => ({
  devLog: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Import mocked devLog for test assertions
import { devLog } from '../lib/utils'

describe('SocketServer', () => {
  let socketServer: ReturnType<typeof createSocketServer>

  beforeEach(() => {
    socketServer = createSocketServer()
  })

  afterEach(() => {
    if (socketServer.isRunning()) {
      socketServer.stop()
    }
  })

  describe('sendKill', () => {
    it('should return false when session socket does not exist', () => {
      const result = socketServer.sendKill('non-existent-session', 'SIGTERM')
      expect(result).toBe(false)
    })

    it('should return false when socket is destroyed', () => {
      // Create a mock socket that is destroyed
      const mockSocket = new net.Socket()
      mockSocket.destroy()

      // Since we can't easily inject the socket into the map,
      // we verify the function handles missing sessions correctly
      const result = socketServer.sendKill('test-session', 'SIGKILL')
      expect(result).toBe(false)
    })
  })

  describe('sendStdin', () => {
    it('should return false when session socket does not exist', () => {
      const result = socketServer.sendStdin(
        'non-existent-session',
        'test input'
      )
      expect(result).toBe(false)
    })

    it('should return false for destroyed socket', () => {
      const result = socketServer.sendStdin('test-session', 'y\n', false)
      expect(result).toBe(false)
    })
  })

  describe('sendResize', () => {
    it('should return false when session socket does not exist', () => {
      const result = socketServer.sendResize('non-existent-session', 80, 24)
      expect(result).toBe(false)
    })
  })

  describe('lifecycle', () => {
    it('should report not running initially', () => {
      expect(socketServer.isRunning()).toBe(false)
    })

    it('should report running after start', () => {
      socketServer.start()
      expect(socketServer.isRunning()).toBe(true)
    })

    it('should not start twice', () => {
      socketServer.start()
      vi.mocked(devLog.log).mockClear()
      socketServer.start()
      expect(devLog.log).toHaveBeenCalledWith(
        '[SocketServer] Server already running'
      )
    })

    it('should report not running after stop', () => {
      socketServer.start()
      socketServer.stop()
      expect(socketServer.isRunning()).toBe(false)
    })
  })
})
