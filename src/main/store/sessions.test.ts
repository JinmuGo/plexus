import { describe, it, expect, beforeEach, vi } from 'vitest'

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

import { sessionStore } from './sessions'
import type { HookEvent } from 'shared/hook-types'

describe('SessionStore', () => {
  beforeEach(() => {
    // Clear all sessions before each test
    for (const s of sessionStore.getAll()) {
      sessionStore.remove(s.id)
    }
  })

  describe('Phase Transitions', () => {
    it('should transition idle → processing on UserPromptSubmit', () => {
      const event: HookEvent = {
        sessionId: 'test-session-1',
        cwd: '/test',
        event: 'UserPromptSubmit',
        status: 'processing',
        agent: 'claude',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-session-1')

      expect(session).toBeDefined()
      expect(session?.phase).toBe('processing')
    })

    it('should transition processing → processing on PreToolUse', () => {
      // First create session
      const startEvent: HookEvent = {
        sessionId: 'test-session-2',
        cwd: '/test',
        event: 'SessionStart',
        status: 'waiting_for_input',
        agent: 'claude',
      }
      sessionStore.processHookEvent(startEvent)

      // Then trigger tool
      const toolEvent: HookEvent = {
        sessionId: 'test-session-2',
        cwd: '/test',
        event: 'PreToolUse',
        status: 'running_tool',
        agent: 'claude',
        tool: 'Bash',
        toolInput: { command: 'ls -la' },
        toolUseId: 'tool-123',
      }
      sessionStore.processHookEvent(toolEvent)

      const session = sessionStore.get('test-session-2')
      expect(session?.phase).toBe('processing') // Note: status 'running_tool' maps to 'processing' phase
    })

    it('should transition to waitingForApproval on permission request', () => {
      const event: HookEvent = {
        sessionId: 'test-session-3',
        cwd: '/test',
        event: 'PermissionRequest',
        status: 'waiting_for_approval',
        agent: 'claude',
        tool: 'Bash',
        toolInput: { command: 'rm -rf /' },
        toolUseId: 'tool-456',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-session-3')

      expect(session?.phase).toBe('waitingForApproval')
      expect(session?.activePermission).toBeDefined()
      expect(session?.activePermission?.toolName).toBe('Bash')
    })

    it('should transition waitingForApproval → processing after approval', () => {
      // Setup permission state
      const permEvent: HookEvent = {
        sessionId: 'test-session-4',
        cwd: '/test',
        event: 'PreToolUse',
        status: 'waiting_for_approval',
        agent: 'claude',
        tool: 'Bash',
        toolInput: { command: 'test' },
        toolUseId: 'tool-789',
      }
      sessionStore.processHookEvent(permEvent)

      // Approve
      sessionStore.clearPermission('test-session-4', 'tool-789')

      const session = sessionStore.get('test-session-4')
      expect(session?.phase).toBe('processing')
      expect(session?.activePermission).toBeUndefined()
    })

    it('should transition to waitingForInput on Stop', () => {
      const event: HookEvent = {
        sessionId: 'test-session-5',
        cwd: '/test',
        event: 'Stop',
        status: 'waiting_for_input',
        agent: 'claude',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-session-5')

      expect(session?.phase).toBe('waitingForInput')
    })

    it('should transition to ended on SessionEnd', () => {
      const event: HookEvent = {
        sessionId: 'test-session-6',
        cwd: '/test',
        event: 'SessionEnd',
        status: 'ended',
        agent: 'claude',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-session-6')

      expect(session?.phase).toBe('ended')
    })
  })

  describe('Message Extraction - Claude', () => {
    it('should populate lastMessage on PreToolUse with Bash command', () => {
      const event: HookEvent = {
        sessionId: 'test-claude-1',
        cwd: '/test',
        event: 'PreToolUse',
        status: 'running_tool',
        agent: 'claude',
        tool: 'Bash',
        toolInput: { command: 'pnpm test' },
        toolUseId: 'tool-abc',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-claude-1')

      expect(session?.lastMessage).toBe('[Bash] pnpm test')
      expect(session?.lastMessageRole).toBe('tool')
      expect(session?.lastToolName).toBe('Bash')
    })

    it('should populate lastMessage on PreToolUse with Read file path', () => {
      const event: HookEvent = {
        sessionId: 'test-claude-2',
        cwd: '/test',
        event: 'PreToolUse',
        status: 'running_tool',
        agent: 'claude',
        tool: 'Read',
        toolInput: { file_path: '/src/main/index.ts' },
        toolUseId: 'tool-def',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-claude-2')

      expect(session?.lastMessage).toBe('[Read] /src/main/index.ts')
      expect(session?.lastMessageRole).toBe('tool')
    })

    it('should populate lastMessage on UserPromptSubmit', () => {
      const event: HookEvent = {
        sessionId: 'test-claude-3',
        cwd: '/test',
        event: 'UserPromptSubmit',
        status: 'processing',
        agent: 'claude',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-claude-3')

      expect(session?.lastMessage).toBe('User submitted prompt')
      expect(session?.lastMessageRole).toBe('user')
    })

    it('should populate lastMessage on Stop event', () => {
      const event: HookEvent = {
        sessionId: 'test-claude-4',
        cwd: '/test',
        event: 'Stop',
        status: 'waiting_for_input',
        agent: 'claude',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-claude-4')

      expect(session?.lastMessage).toBe('Assistant response complete')
      expect(session?.lastMessageRole).toBe('assistant')
    })
  })

  describe('Message Extraction - Gemini', () => {
    it('should handle Gemini BeforeTool event (mapped to PreToolUse)', () => {
      const event: HookEvent = {
        sessionId: 'test-gemini-1',
        cwd: '/test',
        event: 'PreToolUse', // Mapped from BeforeTool
        status: 'running_tool',
        agent: 'gemini',
        tool: 'Bash',
        toolInput: { command: 'npm install' },
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-gemini-1')

      expect(session?.phase).toBe('processing')
      expect(session?.lastMessage).toBe('[Bash] npm install')
      expect(session?.agent).toBe('gemini')
    })

    it('should handle Gemini AfterAgent event (mapped to Stop)', () => {
      const event: HookEvent = {
        sessionId: 'test-gemini-2',
        cwd: '/test',
        event: 'Stop', // Mapped from AfterAgent
        status: 'waiting_for_input',
        agent: 'gemini',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-gemini-2')

      expect(session?.phase).toBe('waitingForInput')
      expect(session?.lastMessage).toBe('Assistant response complete')
    })

    it('should handle Gemini session lifecycle', () => {
      const events: HookEvent[] = [
        {
          sessionId: 'gemini-lifecycle',
          cwd: '/test',
          event: 'SessionStart',
          status: 'waiting_for_input',
          agent: 'gemini',
        },
        {
          sessionId: 'gemini-lifecycle',
          cwd: '/test',
          event: 'UserPromptSubmit', // Mapped from BeforeAgent
          status: 'processing',
          agent: 'gemini',
        },
        {
          sessionId: 'gemini-lifecycle',
          cwd: '/test',
          event: 'PreToolUse', // Mapped from BeforeTool
          status: 'running_tool',
          agent: 'gemini',
          tool: 'Read',
          toolInput: { file_path: '/test.txt' },
        },
        {
          sessionId: 'gemini-lifecycle',
          cwd: '/test',
          event: 'PostToolUse', // Mapped from AfterTool
          status: 'processing',
          agent: 'gemini',
          tool: 'Read',
        },
        {
          sessionId: 'gemini-lifecycle',
          cwd: '/test',
          event: 'Stop', // Mapped from AfterAgent
          status: 'waiting_for_input',
          agent: 'gemini',
        },
      ]

      for (const event of events) {
        sessionStore.processHookEvent(event)
      }

      const session = sessionStore.get('gemini-lifecycle')
      expect(session?.phase).toBe('waitingForInput')
      expect(session?.lastMessage).toBe('Assistant response complete')
    })
  })

  describe('Message Extraction - Cursor', () => {
    it('should handle Cursor shell execution', () => {
      const event: HookEvent = {
        sessionId: 'test-cursor-1',
        cwd: '/test',
        event: 'PreToolUse', // Mapped from beforeShellExecution
        status: 'waiting_for_approval',
        agent: 'cursor',
        tool: 'Bash',
        toolInput: { command: 'git push' },
        toolUseId: 'cursor-tool-1',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-cursor-1')

      expect(session?.phase).toBe('waitingForApproval')
      expect(session?.lastMessage).toBe('[Bash] git push')
    })

    it('should handle Cursor file read', () => {
      const event: HookEvent = {
        sessionId: 'test-cursor-2',
        cwd: '/test',
        event: 'PreToolUse', // Mapped from beforeReadFile
        status: 'running_tool',
        agent: 'cursor',
        tool: 'Read',
        toolInput: { file_path: '/config.json' },
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-cursor-2')

      expect(session?.phase).toBe('processing')
      expect(session?.lastMessage).toBe('[Read] /config.json')
    })

    it('should handle Cursor session lifecycle', () => {
      const events: HookEvent[] = [
        {
          sessionId: 'cursor-lifecycle',
          cwd: '/test',
          event: 'UserPromptSubmit', // Mapped from beforeSubmitPrompt
          status: 'processing',
          agent: 'cursor',
        },
        {
          sessionId: 'cursor-lifecycle',
          cwd: '/test',
          event: 'PreToolUse', // Mapped from beforeShellExecution
          status: 'waiting_for_approval',
          agent: 'cursor',
          tool: 'Bash',
          toolInput: { command: 'npm run build' },
          toolUseId: 'cursor-tool-2',
        },
      ]

      for (const event of events) {
        sessionStore.processHookEvent(event)
      }

      const session = sessionStore.get('cursor-lifecycle')
      expect(session?.phase).toBe('waitingForApproval')
      expect(session?.lastMessage).toBe('[Bash] npm run build')
      expect(session?.activePermission).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing tool input gracefully', () => {
      const event: HookEvent = {
        sessionId: 'test-edge-1',
        cwd: '/test',
        event: 'PreToolUse',
        status: 'running_tool',
        agent: 'claude',
        tool: 'Bash',
        // toolInput missing
        toolUseId: 'tool-edge-1',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-edge-1')

      expect(session?.lastMessage).toBe('[Bash]')
    })

    it('should handle unknown tool gracefully', () => {
      const event: HookEvent = {
        sessionId: 'test-edge-2',
        cwd: '/test',
        event: 'PreToolUse',
        status: 'running_tool',
        agent: 'claude',
        tool: 'CustomTool',
        toolInput: { param1: 'value1' },
        toolUseId: 'tool-edge-2',
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-edge-2')

      expect(session?.lastMessage).toContain('[CustomTool]')
    })

    it('should update lastMessage on subsequent events', () => {
      const event1: HookEvent = {
        sessionId: 'test-edge-3',
        cwd: '/test',
        event: 'PreToolUse',
        status: 'running_tool',
        agent: 'claude',
        tool: 'Bash',
        toolInput: { command: 'first command' },
        toolUseId: 'tool-1',
      }

      const event2: HookEvent = {
        sessionId: 'test-edge-3',
        cwd: '/test',
        event: 'PreToolUse',
        status: 'running_tool',
        agent: 'claude',
        tool: 'Read',
        toolInput: { file_path: '/test.txt' },
        toolUseId: 'tool-2',
      }

      sessionStore.processHookEvent(event1)
      let session = sessionStore.get('test-edge-3')
      expect(session?.lastMessage).toBe('[Bash] first command')

      sessionStore.processHookEvent(event2)
      session = sessionStore.get('test-edge-3')
      expect(session?.lastMessage).toBe('[Read] /test.txt')
    })
  })

  describe('Auto Cleanup', () => {
    it('should reset compacting phase to waitingForInput after timeout', () => {
      const event: HookEvent = {
        sessionId: 'test-compacting-1',
        cwd: '/test',
        event: 'PreCompact',
        status: 'compacting',
        agent: 'gemini',
        pid: process.pid,
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-compacting-1')

      expect(session?.phase).toBe('compacting')

      // Mock Date.now to simulate timeout (90s + 1ms)
      const originalNow = Date.now
      try {
        const startTime = Date.now()
        Date.now = () => startTime + 90001

        // Trigger cleanup
        // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
        ;(sessionStore as any).cleanupStaleSessions()

        const updatedSession = sessionStore.get('test-compacting-1')
        expect(updatedSession?.phase).toBe('waitingForInput')
      } finally {
        Date.now = originalNow
      }
    })

    it('should NOT reset compacting phase before timeout', () => {
      const event: HookEvent = {
        sessionId: 'test-compacting-2',
        cwd: '/test',
        event: 'PreCompact',
        status: 'compacting',
        agent: 'gemini',
        pid: process.pid,
      }

      sessionStore.processHookEvent(event)
      const session = sessionStore.get('test-compacting-2')

      expect(session?.phase).toBe('compacting')

      // Mock Date.now to simulate time passing (89s - before timeout)
      const originalNow = Date.now
      try {
        const startTime = Date.now()
        Date.now = () => startTime + 89000

        // Trigger cleanup
        // biome-ignore lint/suspicious/noExplicitAny: accessing private method for testing
        ;(sessionStore as any).cleanupStaleSessions()

        const updatedSession = sessionStore.get('test-compacting-2')
        expect(updatedSession?.phase).toBe('compacting')
      } finally {
        Date.now = originalNow
      }
    })
  })
})
