/**
 * Session Title Extractor Tests
 *
 * Tests for title computation and extraction logic.
 * Note: extractClaudeTitle is not tested as it requires file system access.
 */

import { describe, it, expect } from 'vitest'
import {
  computeDisplayTitle,
  hasMeaningfulTitle,
} from './session-title-extractor'

// ============================================================================
// computeDisplayTitle Tests
// ============================================================================

describe('computeDisplayTitle', () => {
  describe('priority order', () => {
    it('should prefer sessionSummary over all others', () => {
      const title = computeDisplayTitle(
        'AI Summary',
        'User Prompt',
        'ProjectName',
        '/home/user/project'
      )
      expect(title).toBe('AI Summary')
    })

    it('should use firstUserPrompt when no summary', () => {
      const title = computeDisplayTitle(
        undefined,
        'User Prompt',
        'ProjectName',
        '/home/user/project'
      )
      expect(title).toBe('User Prompt')
    })

    it('should use projectName when no summary or prompt', () => {
      const title = computeDisplayTitle(
        undefined,
        undefined,
        'ProjectName',
        '/home/user/project'
      )
      expect(title).toBe('ProjectName')
    })

    it('should use cwd basename when no other sources', () => {
      const title = computeDisplayTitle(
        undefined,
        undefined,
        undefined,
        '/home/user/my-project'
      )
      expect(title).toBe('my-project')
    })

    it('should return "Session" when no sources available', () => {
      const title = computeDisplayTitle(
        undefined,
        undefined,
        undefined,
        undefined
      )
      expect(title).toBe('Session')
    })
  })

  describe('truncation', () => {
    it('should truncate long summaries to 60 chars', () => {
      const longSummary =
        'This is a very long session summary that exceeds the maximum allowed character limit for display'
      const title = computeDisplayTitle(longSummary)

      expect(title.length).toBeLessThanOrEqual(60)
      expect(title.endsWith('...')).toBe(true)
    })

    it('should truncate long prompts to 60 chars', () => {
      const longPrompt =
        'Please help me with this very long request that goes on and on and on and exceeds the limit'
      const title = computeDisplayTitle(undefined, longPrompt)

      expect(title.length).toBeLessThanOrEqual(60)
      expect(title.endsWith('...')).toBe(true)
    })

    it('should not truncate short titles', () => {
      const shortSummary = 'Fix bug in auth'
      const title = computeDisplayTitle(shortSummary)

      expect(title).toBe(shortSummary)
      expect(title.endsWith('...')).toBe(false)
    })

    it('should handle exactly 60 char titles without truncation', () => {
      const exact60 = 'A'.repeat(60)
      const title = computeDisplayTitle(exact60)

      expect(title).toBe(exact60)
      expect(title.length).toBe(60)
    })
  })

  describe('whitespace handling', () => {
    it('should normalize multiple spaces', () => {
      const spaceyTitle = 'Fix   the   bug   in   auth'
      const title = computeDisplayTitle(spaceyTitle)

      expect(title).toBe('Fix the bug in auth')
    })

    it('should convert newlines to spaces', () => {
      const multilineTitle = 'Fix the bug\nin the auth\nmodule'
      const title = computeDisplayTitle(multilineTitle)

      expect(title).toBe('Fix the bug in the auth module')
    })

    it('should trim leading and trailing whitespace', () => {
      const paddedTitle = '  Fix the bug  '
      const title = computeDisplayTitle(paddedTitle)

      expect(title).toBe('Fix the bug')
    })

    it('should handle tabs and mixed whitespace', () => {
      const messyTitle = 'Fix\t\tthe\n  bug'
      const title = computeDisplayTitle(messyTitle)

      expect(title).toBe('Fix the bug')
    })
  })

  describe('cwd parsing', () => {
    it('should extract basename from absolute path', () => {
      const title = computeDisplayTitle(
        undefined,
        undefined,
        undefined,
        '/Users/developer/projects/my-app'
      )
      expect(title).toBe('my-app')
    })

    it('should handle root directory', () => {
      const title = computeDisplayTitle(undefined, undefined, undefined, '/')
      expect(title).toBe('/')
    })

    it('should handle trailing slash', () => {
      const title = computeDisplayTitle(
        undefined,
        undefined,
        undefined,
        '/home/user/project/'
      )
      // Split on '/' gives empty string at end, so we get 'project' or empty
      // Based on implementation: parts[parts.length - 1] would be ''
      // So it returns cwd itself
      expect(title).toBe('/home/user/project/')
    })

    it('should handle single directory', () => {
      const title = computeDisplayTitle(
        undefined,
        undefined,
        undefined,
        '/project'
      )
      expect(title).toBe('project')
    })
  })

  describe('edge cases', () => {
    it('should handle empty string summary', () => {
      const title = computeDisplayTitle('', 'User Prompt')
      // Empty string is falsy, so should fall through to prompt
      expect(title).toBe('User Prompt')
    })

    it('should handle whitespace-only summary', () => {
      const title = computeDisplayTitle('   ', 'User Prompt')
      // '   ' is truthy, so truncateTitle is called and trims to empty string
      expect(title).toBe('')
    })
  })
})

// ============================================================================
// hasMeaningfulTitle Tests
// ============================================================================

describe('hasMeaningfulTitle', () => {
  it('should return true when sessionSummary exists', () => {
    expect(hasMeaningfulTitle('AI Summary', undefined)).toBe(true)
  })

  it('should return true when firstUserPrompt exists', () => {
    expect(hasMeaningfulTitle(undefined, 'User Prompt')).toBe(true)
  })

  it('should return true when both exist', () => {
    expect(hasMeaningfulTitle('AI Summary', 'User Prompt')).toBe(true)
  })

  it('should return false when neither exists', () => {
    expect(hasMeaningfulTitle(undefined, undefined)).toBe(false)
  })

  it('should return false for empty strings', () => {
    expect(hasMeaningfulTitle('', '')).toBe(false)
  })

  it('should return true for whitespace strings (truthy check)', () => {
    // '   ' is truthy, so this returns true
    expect(hasMeaningfulTitle('   ', undefined)).toBe(true)
  })
})
