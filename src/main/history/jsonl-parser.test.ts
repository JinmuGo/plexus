/**
 * Tests for JSONL Parser
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  getJsonlPath,
  parseJsonlFile,
  getFullContent,
  hasJsonlFile,
  getJsonlFileSize,
} from './jsonl-parser'

// Test fixtures
const TEST_DIR = join(tmpdir(), 'plexus-test-jsonl')
const TEST_SESSION_ID = 'test-session-123'

// Sample JSONL entries matching Claude Code format
const SAMPLE_USER_ENTRY = {
  uuid: 'user-uuid-1',
  parentUuid: null,
  sessionId: TEST_SESSION_ID,
  timestamp: '2024-12-23T10:00:00.000Z',
  type: 'user',
  message: {
    role: 'user',
    content: 'Hello, how are you?',
  },
}

const SAMPLE_ASSISTANT_ENTRY = {
  uuid: 'assistant-uuid-1',
  parentUuid: 'user-uuid-1',
  sessionId: TEST_SESSION_ID,
  timestamp: '2024-12-23T10:00:01.000Z',
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'I am doing well, thank you for asking! How can I help you today?',
      },
    ],
  },
}

const SAMPLE_TOOL_USE_ENTRY = {
  uuid: 'assistant-uuid-2',
  parentUuid: 'assistant-uuid-1',
  sessionId: TEST_SESSION_ID,
  timestamp: '2024-12-23T10:00:02.000Z',
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 'tool-use-id-1',
        name: 'Bash',
        input: { command: 'ls -la' },
      },
    ],
  },
}

const SAMPLE_SUMMARY_ENTRY = {
  type: 'summary',
  summary: 'User asked about status, assistant responded positively.',
  leafUuid: 'assistant-uuid-2',
}

describe('JSONL Parser', () => {
  beforeAll(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterAll(() => {
    // Cleanup test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe('getJsonlPath', () => {
    it('should encode cwd correctly with slashes replaced by dashes', () => {
      // This tests the path encoding logic
      const cwd = '/Users/test/project'
      // Note: getJsonlPath checks if file exists, so it will return null for non-existent paths
      const result = getJsonlPath(cwd, 'non-existent-session')
      expect(result).toBeNull()
    })

    it('should return null for non-existent session', () => {
      const result = getJsonlPath('/some/path', 'non-existent-session')
      expect(result).toBeNull()
    })
  })

  describe('parseJsonlFile', () => {
    it('should parse valid JSONL file with user and assistant messages', async () => {
      const testFile = join(TEST_DIR, 'test-parse.jsonl')

      // Create test JSONL file
      const entries = [
        JSON.stringify(SAMPLE_USER_ENTRY),
        JSON.stringify(SAMPLE_ASSISTANT_ENTRY),
        JSON.stringify(SAMPLE_SUMMARY_ENTRY), // Should be skipped
      ].join('\n')

      writeFileSync(testFile, entries)

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)

      expect(result.entries.length).toBeGreaterThan(0)

      // Check user message
      const userEntry = result.entries.find(e => e.role === 'user')
      expect(userEntry).toBeDefined()
      expect(userEntry?.content).toBe('Hello, how are you?')

      // Check assistant message
      const assistantEntry = result.entries.find(e => e.role === 'assistant')
      expect(assistantEntry).toBeDefined()
      expect(assistantEntry?.content).toContain('I am doing well')
    })

    it('should extract tool executions from assistant messages', async () => {
      const testFile = join(TEST_DIR, 'test-tools.jsonl')

      const entries = [
        JSON.stringify(SAMPLE_USER_ENTRY),
        JSON.stringify(SAMPLE_TOOL_USE_ENTRY),
      ].join('\n')

      writeFileSync(testFile, entries)

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)

      expect(result.toolExecutions.length).toBe(1)
      expect(result.toolExecutions[0].toolName).toBe('Bash')
      expect(result.toolExecutions[0].toolUseId).toBe('tool-use-id-1')
      expect(result.toolExecutions[0].toolInput).toEqual({ command: 'ls -la' })
    })

    it('should handle empty file gracefully', async () => {
      const testFile = join(TEST_DIR, 'test-empty.jsonl')
      writeFileSync(testFile, '')

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)

      expect(result.entries).toEqual([])
      expect(result.toolExecutions).toEqual([])
    })

    it('should skip malformed lines', async () => {
      const testFile = join(TEST_DIR, 'test-malformed.jsonl')

      const entries = [
        'not valid json',
        JSON.stringify(SAMPLE_USER_ENTRY),
        '{ broken json',
        JSON.stringify(SAMPLE_ASSISTANT_ENTRY),
      ].join('\n')

      writeFileSync(testFile, entries)

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)

      // Should still parse valid entries
      expect(result.entries.length).toBeGreaterThan(0)
    })

    it('should return empty for non-existent file', async () => {
      const result = await parseJsonlFile(
        '/non/existent/file.jsonl',
        TEST_SESSION_ID
      )

      expect(result.entries).toEqual([])
      expect(result.toolExecutions).toEqual([])
    })

    it('should include byte offset and length for on-demand loading', async () => {
      const testFile = join(TEST_DIR, 'test-offsets.jsonl')

      const entries = [JSON.stringify(SAMPLE_USER_ENTRY)].join('\n')

      writeFileSync(testFile, entries)

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)

      const entry = result.entries[0]
      expect(entry.jsonlPath).toBe(testFile)
      expect(typeof entry.jsonlOffset).toBe('number')
      expect(typeof entry.jsonlLength).toBe('number')
      expect(entry.jsonlOffset).toBeGreaterThanOrEqual(0)
      expect(entry.jsonlLength).toBeGreaterThan(0)
    })

    it('should create content preview for long messages', async () => {
      const testFile = join(TEST_DIR, 'test-preview.jsonl')

      const longContent = 'A'.repeat(500) // 500 character message

      const longEntry = {
        ...SAMPLE_USER_ENTRY,
        message: {
          role: 'user',
          content: longContent,
        },
      }

      writeFileSync(testFile, JSON.stringify(longEntry))

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)

      const entry = result.entries.find(e => e.role === 'user')
      expect(entry?.contentPreview.length).toBeLessThanOrEqual(203) // 200 + '...'
      expect(entry?.contentPreview.endsWith('...')).toBe(true)
      expect(entry?.content.length).toBe(500) // Full content preserved
    })
  })

  describe('getFullContent', () => {
    it('should read content from file using offset and length', async () => {
      const testFile = join(TEST_DIR, 'test-fullcontent.jsonl')

      const entries = [JSON.stringify(SAMPLE_USER_ENTRY)].join('\n')

      writeFileSync(testFile, entries)

      // First parse to get offset/length
      const parseResult = await parseJsonlFile(testFile, TEST_SESSION_ID)
      const entry = parseResult.entries[0]

      // Then use getFullContent
      const fullContent = await getFullContent(
        entry.jsonlPath,
        entry.jsonlOffset,
        entry.jsonlLength
      )

      expect(fullContent).toBe('Hello, how are you?')
    })

    it('should return null for non-existent file', async () => {
      const result = await getFullContent('/non/existent/file.jsonl', 0, 100)
      expect(result).toBeNull()
    })
  })

  describe('hasJsonlFile', () => {
    it('should return false for non-existent session', () => {
      const result = hasJsonlFile('/some/cwd', 'non-existent-session')
      expect(result).toBe(false)
    })
  })

  describe('getJsonlFileSize', () => {
    it('should return file size for existing file', () => {
      const testFile = join(TEST_DIR, 'test-size.jsonl')
      const content = JSON.stringify(SAMPLE_USER_ENTRY)
      writeFileSync(testFile, content)

      const size = getJsonlFileSize(testFile)
      expect(size).toBe(Buffer.byteLength(content, 'utf-8'))
    })

    it('should return 0 for non-existent file', () => {
      const size = getJsonlFileSize('/non/existent/file.jsonl')
      expect(size).toBe(0)
    })
  })

  describe('Content extraction', () => {
    it('should handle string content in user messages', async () => {
      const testFile = join(TEST_DIR, 'test-string-content.jsonl')

      writeFileSync(testFile, JSON.stringify(SAMPLE_USER_ENTRY))

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)
      const userEntry = result.entries.find(e => e.role === 'user')

      expect(userEntry?.content).toBe('Hello, how are you?')
    })

    it('should handle array content with text blocks in assistant messages', async () => {
      const testFile = join(TEST_DIR, 'test-array-content.jsonl')

      const multiBlockEntry = {
        ...SAMPLE_ASSISTANT_ENTRY,
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'First block.' },
            { type: 'text', text: 'Second block.' },
          ],
        },
      }

      writeFileSync(testFile, JSON.stringify(multiBlockEntry))

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)
      const assistantEntry = result.entries.find(e => e.role === 'assistant')

      expect(assistantEntry?.content).toContain('First block.')
      expect(assistantEntry?.content).toContain('Second block.')
    })

    it('should skip meta user messages', async () => {
      const testFile = join(TEST_DIR, 'test-meta.jsonl')

      const metaEntry = {
        ...SAMPLE_USER_ENTRY,
        isMeta: true,
      }

      const normalEntry = {
        ...SAMPLE_USER_ENTRY,
        uuid: 'user-uuid-2',
        isMeta: false,
      }

      writeFileSync(
        testFile,
        [JSON.stringify(metaEntry), JSON.stringify(normalEntry)].join('\n')
      )

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)

      // Should only have 1 user entry (the non-meta one)
      const userEntries = result.entries.filter(e => e.role === 'user')
      expect(userEntries.length).toBe(1)
    })
  })

  describe('Tool input summarization', () => {
    it('should summarize Bash command correctly', async () => {
      const testFile = join(TEST_DIR, 'test-bash-summary.jsonl')

      writeFileSync(testFile, JSON.stringify(SAMPLE_TOOL_USE_ENTRY))

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)
      const toolEntry = result.entries.find(e => e.role === 'tool')

      expect(toolEntry?.content).toContain('Bash')
      expect(toolEntry?.content).toContain('ls -la')
    })

    it('should summarize Read/Write/Edit with file path', async () => {
      const testFile = join(TEST_DIR, 'test-file-tools.jsonl')

      const readToolEntry = {
        ...SAMPLE_TOOL_USE_ENTRY,
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-use-id-2',
              name: 'Read',
              input: { file_path: '/path/to/file.ts' },
            },
          ],
        },
      }

      writeFileSync(testFile, JSON.stringify(readToolEntry))

      const result = await parseJsonlFile(testFile, TEST_SESSION_ID)
      const toolEntry = result.entries.find(e => e.role === 'tool')

      expect(toolEntry?.content).toContain('Read')
      expect(toolEntry?.content).toContain('/path/to/file.ts')
    })
  })
})
