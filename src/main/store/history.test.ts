/**
 * Tests for History Store
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  beforeAll,
} from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock electron app module
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(tmpdir()),
  },
}))

// Import after mock
import { historyStore } from './history'

// Test fixtures
const TEST_DIR = join(tmpdir(), 'plexus-test-history')
const TEST_DB_PATH = join(TEST_DIR, 'test-history.db')

describe('HistoryStore', () => {
  beforeAll(() => {
    // Ensure test directory exists
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  beforeEach(() => {
    // Remove existing test database
    if (existsSync(TEST_DB_PATH)) {
      rmSync(TEST_DB_PATH, { force: true })
    }
    // Also remove WAL files
    if (existsSync(`${TEST_DB_PATH}-wal`)) {
      rmSync(`${TEST_DB_PATH}-wal`, { force: true })
    }
    if (existsSync(`${TEST_DB_PATH}-shm`)) {
      rmSync(`${TEST_DB_PATH}-shm`, { force: true })
    }

    // Initialize with test database
    historyStore.initialize(TEST_DB_PATH)
  })

  afterEach(() => {
    historyStore.close()
  })

  describe('Session Operations', () => {
    it('should create a session', () => {
      const session = historyStore.createSession({
        id: 'test-session-1',
        agent: 'claude',
        cwd: '/test/project',
        displayTitle: 'Test Project',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: Date.now(),
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })

      expect(session.id).toBe('test-session-1')
      expect(session.agent).toBe('claude')
      expect(session.cwd).toBe('/test/project')
      expect(session.createdAt).toBeDefined()
    })

    it('should get a session by ID', () => {
      historyStore.createSession({
        id: 'test-session-2',
        agent: 'gemini',
        cwd: '/test/another',
        displayTitle: 'Another Project',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: Date.now(),
        endedAt: null,
        durationMs: null,
        isInTmux: true,
        tmuxSession: 'main',
        tmuxWindow: '0',
        tmuxPane: '0',
        metadata: { key: 'value' },
      })

      const retrieved = historyStore.getSession('test-session-2')

      expect(retrieved).not.toBeNull()
      expect(retrieved?.agent).toBe('gemini')
      expect(retrieved?.isInTmux).toBe(true)
      expect(retrieved?.tmuxSession).toBe('main')
      expect(retrieved?.metadata).toEqual({ key: 'value' })
    })

    it('should return null for non-existent session', () => {
      const result = historyStore.getSession('non-existent')
      expect(result).toBeNull()
    })

    it('should check if session exists', () => {
      historyStore.createSession({
        id: 'exists-session',
        agent: 'claude',
        cwd: '/test',
        displayTitle: 'Test',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: Date.now(),
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })

      expect(historyStore.hasSession('exists-session')).toBe(true)
      expect(historyStore.hasSession('not-exists')).toBe(false)
    })

    it('should update a session', () => {
      const startedAt = Date.now()
      historyStore.createSession({
        id: 'update-session',
        agent: 'claude',
        cwd: '/test',
        displayTitle: 'Original',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt,
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })

      historyStore.updateSession('update-session', {
        displayTitle: 'Updated Title',
        isInTmux: true,
        tmuxSession: 'new-session',
      })

      const updated = historyStore.getSession('update-session')
      expect(updated?.displayTitle).toBe('Updated Title')
      expect(updated?.isInTmux).toBe(true)
      expect(updated?.tmuxSession).toBe('new-session')
    })

    it('should end a session', () => {
      const startedAt = Date.now() - 5000 // Started 5 seconds ago
      historyStore.createSession({
        id: 'end-session',
        agent: 'claude',
        cwd: '/test',
        displayTitle: 'Test',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt,
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })

      historyStore.endSession('end-session')

      const ended = historyStore.getSession('end-session')
      expect(ended?.endedAt).not.toBeNull()
      expect(ended?.durationMs).toBeGreaterThan(0)
    })

    it('should delete a session', () => {
      historyStore.createSession({
        id: 'delete-session',
        agent: 'claude',
        cwd: '/test',
        displayTitle: 'Test',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: Date.now(),
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })

      expect(historyStore.hasSession('delete-session')).toBe(true)

      historyStore.deleteSession('delete-session')

      expect(historyStore.hasSession('delete-session')).toBe(false)
    })

    it('should get sessions with filtering', () => {
      const now = Date.now()

      // Create multiple sessions
      historyStore.createSession({
        id: 'session-claude-1',
        agent: 'claude',
        cwd: '/project/a',
        displayTitle: 'Project A',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: now - 1000,
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })

      historyStore.createSession({
        id: 'session-gemini-1',
        agent: 'gemini',
        cwd: '/project/b',
        displayTitle: 'Project B',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: now - 2000,
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })

      historyStore.createSession({
        id: 'session-claude-2',
        agent: 'claude',
        cwd: '/project/c',
        displayTitle: 'Project C',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: now - 3000,
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })

      // Filter by agent
      const claudeSessions = historyStore.getSessions({
        filters: { agents: ['claude'] },
      })
      expect(claudeSessions.length).toBe(2)
      expect(claudeSessions.every(s => s.agent === 'claude')).toBe(true)

      // Filter by cwd
      const cwdSessions = historyStore.getSessions({
        filters: { cwd: 'project/b' },
      })
      expect(cwdSessions.length).toBe(1)
      expect(cwdSessions[0].cwd).toBe('/project/b')

      // Pagination
      const paginatedSessions = historyStore.getSessions({
        pagination: { limit: 2, offset: 0 },
      })
      expect(paginatedSessions.length).toBe(2)
    })
  })

  describe('Message Operations', () => {
    beforeEach(() => {
      historyStore.createSession({
        id: 'msg-session',
        agent: 'claude',
        cwd: '/test',
        displayTitle: 'Test',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: Date.now(),
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })
    })

    it('should add a message', () => {
      const message = historyStore.addMessage({
        sessionId: 'msg-session',
        role: 'user',
        content: 'Hello, how are you?',
        contentPreview: 'Hello, how are you?',
        timestamp: Date.now(),
        metadata: null,
        jsonlPath: null,
        jsonlOffset: null,
        jsonlLength: null,
      })

      expect(message.id).toBeDefined()
      expect(message.role).toBe('user')
      expect(message.content).toBe('Hello, how are you?')
    })

    it('should auto-generate content preview if not provided', () => {
      const longContent = 'A'.repeat(300)
      const message = historyStore.addMessage({
        sessionId: 'msg-session',
        role: 'assistant',
        content: longContent,
        contentPreview: '', // Empty, should be generated
        timestamp: Date.now(),
        metadata: null,
        jsonlPath: null,
        jsonlOffset: null,
        jsonlLength: null,
      })

      expect(message.contentPreview).toBeDefined()
      expect(message.contentPreview?.length).toBeLessThanOrEqual(203) // 200 + '...'
    })

    it('should get messages for a session', () => {
      const now = Date.now()

      historyStore.addMessage({
        sessionId: 'msg-session',
        role: 'user',
        content: 'First message',
        contentPreview: 'First message',
        timestamp: now,
        metadata: null,
        jsonlPath: null,
        jsonlOffset: null,
        jsonlLength: null,
      })

      historyStore.addMessage({
        sessionId: 'msg-session',
        role: 'assistant',
        content: 'Second message',
        contentPreview: 'Second message',
        timestamp: now + 1000,
        metadata: null,
        jsonlPath: null,
        jsonlOffset: null,
        jsonlLength: null,
      })

      const messages = historyStore.getMessages('msg-session')

      expect(messages.length).toBe(2)
      expect(messages[0].role).toBe('user')
      expect(messages[1].role).toBe('assistant')
    })

    it('should get a message by ID', () => {
      const created = historyStore.addMessage({
        sessionId: 'msg-session',
        role: 'system',
        content: 'System message',
        contentPreview: 'System message',
        timestamp: Date.now(),
        metadata: { type: 'init' },
        jsonlPath: null,
        jsonlOffset: null,
        jsonlLength: null,
      })

      const retrieved = historyStore.getMessage(created.id)

      expect(retrieved).not.toBeNull()
      expect(retrieved?.role).toBe('system')
      expect(retrieved?.metadata).toEqual({ type: 'init' })
    })

    it('should add messages from JSONL (batch insert)', () => {
      const messages = [
        {
          role: 'user' as const,
          content: 'User prompt 1',
          contentPreview: 'User prompt 1',
          timestamp: Date.now(),
          jsonlPath: '/test/file.jsonl',
          jsonlOffset: 0,
          jsonlLength: 100,
        },
        {
          role: 'assistant' as const,
          content: 'Assistant response 1',
          contentPreview: 'Assistant response 1',
          timestamp: Date.now() + 1000,
          jsonlPath: '/test/file.jsonl',
          jsonlOffset: 100,
          jsonlLength: 200,
        },
      ]

      historyStore.addMessagesFromJsonl('msg-session', messages)

      const retrieved = historyStore.getMessages('msg-session')
      expect(retrieved.length).toBe(2)
      expect(retrieved[0].jsonlPath).toBe('/test/file.jsonl')
      expect(retrieved[0].jsonlOffset).toBe(0)
    })
  })

  describe('Tool Execution Operations', () => {
    beforeEach(() => {
      historyStore.createSession({
        id: 'tool-session',
        agent: 'claude',
        cwd: '/test',
        displayTitle: 'Test',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: Date.now(),
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })
    })

    it('should add a tool execution', () => {
      const tool = historyStore.addToolExecution({
        sessionId: 'tool-session',
        toolUseId: 'tool-use-123',
        toolName: 'Bash',
        toolInput: { command: 'ls -la' },
        toolOutput: null,
        status: 'running',
        startedAt: Date.now(),
        completedAt: null,
        durationMs: null,
      })

      expect(tool.id).toBeDefined()
      expect(tool.toolName).toBe('Bash')
      expect(tool.status).toBe('running')
    })

    it('should complete a tool execution', () => {
      const startTime = Date.now()

      historyStore.addToolExecution({
        sessionId: 'tool-session',
        toolUseId: 'tool-complete-123',
        toolName: 'Read',
        toolInput: { file_path: '/test/file.ts' },
        toolOutput: null,
        status: 'running',
        startedAt: startTime,
        completedAt: null,
        durationMs: null,
      })

      historyStore.completeToolExecution(
        'tool-complete-123',
        'success',
        'File contents...'
      )

      const tools = historyStore.getToolExecutions('tool-session')
      const completed = tools.find(t => t.toolUseId === 'tool-complete-123')

      expect(completed?.status).toBe('success')
      expect(completed?.toolOutput).toBe('File contents...')
      expect(completed?.completedAt).toBeDefined()
    })

    it('should get tool executions for a session', () => {
      const now = Date.now()

      historyStore.addToolExecution({
        sessionId: 'tool-session',
        toolUseId: 'tool-1',
        toolName: 'Bash',
        toolInput: { command: 'pwd' },
        toolOutput: '/test',
        status: 'success',
        startedAt: now,
        completedAt: now + 100,
        durationMs: 100,
      })

      historyStore.addToolExecution({
        sessionId: 'tool-session',
        toolUseId: 'tool-2',
        toolName: 'Read',
        toolInput: { file_path: '/test.ts' },
        toolOutput: 'content',
        status: 'success',
        startedAt: now + 200,
        completedAt: now + 300,
        durationMs: 100,
      })

      const tools = historyStore.getToolExecutions('tool-session')

      expect(tools.length).toBe(2)
      expect(tools[0].toolName).toBe('Bash')
      expect(tools[1].toolName).toBe('Read')
    })
  })

  describe('Search Operations', () => {
    beforeEach(() => {
      historyStore.createSession({
        id: 'search-session',
        agent: 'claude',
        cwd: '/test/project',
        displayTitle: 'Test Project',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: Date.now(),
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })

      historyStore.addMessage({
        sessionId: 'search-session',
        role: 'user',
        content: 'How do I implement authentication in React?',
        contentPreview: 'How do I implement authentication in React?',
        timestamp: Date.now(),
        metadata: null,
        jsonlPath: null,
        jsonlOffset: null,
        jsonlLength: null,
      })

      historyStore.addMessage({
        sessionId: 'search-session',
        role: 'assistant',
        content:
          'To implement authentication in React, you can use Context API or a state management library like Redux.',
        contentPreview: 'To implement authentication in React...',
        timestamp: Date.now() + 1000,
        metadata: null,
        jsonlPath: null,
        jsonlOffset: null,
        jsonlLength: null,
      })
    })

    it('should search messages by keyword', () => {
      const results = historyStore.searchMessages('authentication')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].snippet).toContain('authentication')
    })

    it('should search with filters', () => {
      const results = historyStore.searchMessages('React', {
        agents: ['claude'],
      })

      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('Statistics Operations', () => {
    beforeEach(() => {
      const now = Date.now()

      // Create sessions with different agents
      for (let i = 0; i < 5; i++) {
        historyStore.createSession({
          id: `stats-session-${i}`,
          agent: i % 2 === 0 ? 'claude' : 'gemini',
          cwd: `/test/project-${i}`,
          displayTitle: `Project ${i}`,
          sessionSummary: null,
          firstUserPrompt: null,
          projectRoot: null,
          projectName: null,
          gitBranch: null,
          startedAt: now - i * 60000, // Each 1 minute apart
          endedAt: now - i * 60000 + 30000, // 30 second sessions
          durationMs: 30000,
          isInTmux: false,
          tmuxSession: null,
          tmuxWindow: null,
          tmuxPane: null,
          metadata: null,
        })

        // Add some messages
        historyStore.addMessage({
          sessionId: `stats-session-${i}`,
          role: 'user',
          content: 'Test message',
          contentPreview: 'Test message',
          timestamp: now - i * 60000,
          metadata: null,
          jsonlPath: null,
          jsonlOffset: null,
          jsonlLength: null,
        })

        // Add some tool executions
        historyStore.addToolExecution({
          sessionId: `stats-session-${i}`,
          toolUseId: `tool-${i}`,
          toolName: i % 2 === 0 ? 'Bash' : 'Read',
          toolInput: { command: 'test' },
          toolOutput: 'output',
          status: 'success',
          startedAt: now - i * 60000,
          completedAt: now - i * 60000 + 100,
          durationMs: 100,
        })
      }
    })

    it('should get overall statistics', () => {
      const stats = historyStore.getStatistics()

      expect(stats.totalSessions).toBe(5)
      expect(stats.totalMessages).toBe(5)
      expect(stats.totalToolExecutions).toBe(5)
      expect(stats.averageSessionDurationMs).toBe(30000)
      expect(stats.successRate).toBe(1) // All sessions ended
    })

    it('should get statistics with time range', () => {
      const now = Date.now()
      const stats = historyStore.getStatistics({
        start: now - 120000, // Last 2 minutes
        end: now,
      })

      expect(stats.totalSessions).toBeGreaterThanOrEqual(1)
    })

    it('should get top tools', () => {
      const stats = historyStore.getStatistics()

      expect(stats.topTools.length).toBeGreaterThan(0)
      expect(stats.topTools[0].toolName).toBeDefined()
      expect(stats.topTools[0].count).toBeGreaterThan(0)
    })

    it('should get most used tools', () => {
      const tools = historyStore.getMostUsedTools(5)

      expect(tools.length).toBeGreaterThan(0)
      // Bash and Read were each used ~2-3 times
      const bashTool = tools.find(t => t.toolName === 'Bash')
      const readTool = tools.find(t => t.toolName === 'Read')

      expect(bashTool || readTool).toBeDefined()
    })
  })

  describe('Maintenance Operations', () => {
    beforeEach(() => {
      const now = Date.now()

      // Create some old sessions
      for (let i = 0; i < 10; i++) {
        historyStore.createSession({
          id: `cleanup-session-${i}`,
          agent: 'claude',
          cwd: '/test',
          displayTitle: 'Test',
          sessionSummary: null,
          firstUserPrompt: null,
          projectRoot: null,
          projectName: null,
          gitBranch: null,
          // Sessions progressively older
          startedAt: now - (i + 1) * 24 * 60 * 60 * 1000, // i+1 days ago
          endedAt: now - (i + 1) * 24 * 60 * 60 * 1000 + 30000,
          durationMs: 30000,
          isInTmux: false,
          tmuxSession: null,
          tmuxWindow: null,
          tmuxPane: null,
          metadata: null,
        })
      }
    })

    it('should cleanup old sessions by age', () => {
      const initialSessions = historyStore.getSessions()
      expect(initialSessions.length).toBe(10)

      const deleted = historyStore.cleanup({ maxAgeDays: 3 })

      // Some sessions should be deleted
      expect(deleted).toBeGreaterThan(0)

      const remaining = historyStore.getSessions()
      expect(remaining.length).toBeLessThan(10)
      expect(remaining.length + deleted).toBe(10)
    })

    it('should cleanup sessions by max count', () => {
      const deleted = historyStore.cleanup({ maxSessions: 3 })

      // 7 oldest sessions should be deleted
      expect(deleted).toBe(7)

      const remaining = historyStore.getSessions()
      expect(remaining.length).toBe(3)
    })

    it('should get database size', () => {
      const size = historyStore.getDatabaseSize()
      expect(size).toBeGreaterThan(0)
    })

    it('should vacuum database', () => {
      // Just verify it doesn't throw
      expect(() => historyStore.vacuum()).not.toThrow()
    })
  })

  describe('Cascade Delete', () => {
    it('should delete messages when session is deleted', () => {
      historyStore.createSession({
        id: 'cascade-session',
        agent: 'claude',
        cwd: '/test',
        displayTitle: 'Test',
        sessionSummary: null,
        firstUserPrompt: null,
        projectRoot: null,
        projectName: null,
        gitBranch: null,
        startedAt: Date.now(),
        endedAt: null,
        durationMs: null,
        isInTmux: false,
        tmuxSession: null,
        tmuxWindow: null,
        tmuxPane: null,
        metadata: null,
      })

      historyStore.addMessage({
        sessionId: 'cascade-session',
        role: 'user',
        content: 'Test message',
        contentPreview: 'Test message',
        timestamp: Date.now(),
        metadata: null,
        jsonlPath: null,
        jsonlOffset: null,
        jsonlLength: null,
      })

      historyStore.addToolExecution({
        sessionId: 'cascade-session',
        toolUseId: 'cascade-tool',
        toolName: 'Bash',
        toolInput: { command: 'test' },
        toolOutput: null,
        status: 'running',
        startedAt: Date.now(),
        completedAt: null,
        durationMs: null,
      })

      // Delete session
      historyStore.deleteSession('cascade-session')

      // Messages and tool executions should also be deleted
      const messages = historyStore.getMessages('cascade-session')
      const tools = historyStore.getToolExecutions('cascade-session')

      expect(messages.length).toBe(0)
      expect(tools.length).toBe(0)
    })
  })
})
