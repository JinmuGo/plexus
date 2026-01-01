import { describe, it, expect } from 'vitest'
import { stripOutput, getLastLines, matchesAnyPattern } from './ansi-stripper'

describe('stripOutput', () => {
  describe('ANSI color code stripping', () => {
    it('should strip basic color codes', () => {
      const input = '\x1b[31mred text\x1b[0m'
      const result = stripOutput(input)
      expect(result.text).toBe('red text')
    })

    it('should strip bold and style codes', () => {
      const input = '\x1b[1mBold\x1b[0m \x1b[4mUnderline\x1b[0m'
      const result = stripOutput(input)
      expect(result.text).toBe('Bold Underline')
    })

    it('should strip 256-color codes', () => {
      const input = '\x1b[38;5;196mColorful\x1b[0m'
      const result = stripOutput(input)
      expect(result.text).toBe('Colorful')
    })

    it('should strip RGB color codes', () => {
      const input = '\x1b[38;2;255;0;0mRGB Red\x1b[0m'
      const result = stripOutput(input)
      expect(result.text).toBe('RGB Red')
    })
  })

  describe('cursor control sequence stripping', () => {
    it('should strip cursor hide/show sequences', () => {
      const input = '\x1b[?25lHidden\x1b[?25h'
      const result = stripOutput(input)
      expect(result.text).toBe('Hidden')
    })

    it('should strip cursor movement sequences', () => {
      const input = 'Line 1\x1b[2ALine 2'
      const result = stripOutput(input)
      expect(result.text).toBe('Line 1Line 2')
    })

    it('should strip clear line sequences', () => {
      const input = 'Progress: 50%\x1b[2KProgress: 100%'
      const result = stripOutput(input)
      expect(result.text).toBe('Progress: 50%Progress: 100%')
    })
  })

  describe('carriage return handling', () => {
    it('should strip carriage returns', () => {
      const input = 'Loading...\rDone!'
      const result = stripOutput(input)
      expect(result.text).toBe('Loading...Done!')
    })
  })

  describe('spinner detection', () => {
    it('should detect braille spinner characters', () => {
      const input = '⠋ Loading'
      const result = stripOutput(input)
      expect(result.hasSpinner).toBe(true)
    })

    it('should detect dot spinner characters', () => {
      const input = '◐ Processing'
      const result = stripOutput(input)
      expect(result.hasSpinner).toBe(true)
    })

    it('should return false when no spinner present', () => {
      const input = 'Normal text output'
      const result = stripOutput(input)
      expect(result.hasSpinner).toBe(false)
    })

    it('should detect spinner even with ANSI codes', () => {
      const input = '\x1b[36m⠙\x1b[0m Working...'
      const result = stripOutput(input)
      expect(result.hasSpinner).toBe(true)
    })
  })

  describe('progress extraction', () => {
    it('should extract percentage from output', () => {
      const input = 'Downloading... 50%'
      const result = stripOutput(input)
      expect(result.progress).toBe(50)
    })

    it('should extract 100% completion', () => {
      const input = 'Build: 100% complete'
      const result = stripOutput(input)
      expect(result.progress).toBe(100)
    })

    it('should return null when no percentage present', () => {
      const input = 'No progress info here'
      const result = stripOutput(input)
      expect(result.progress).toBe(null)
    })

    it('should handle percentage with ANSI codes', () => {
      const input = '\x1b[32m75%\x1b[0m done'
      const result = stripOutput(input)
      expect(result.progress).toBe(75)
    })
  })

  describe('whitespace normalization', () => {
    it('should collapse multiple spaces', () => {
      const input = 'word1    word2     word3'
      const result = stripOutput(input)
      expect(result.text).toBe('word1 word2 word3')
    })

    it('should collapse multiple newlines', () => {
      const input = 'line1\n\n\n\nline2'
      const result = stripOutput(input)
      expect(result.text).toBe('line1\n\nline2')
    })

    it('should trim leading and trailing whitespace', () => {
      const input = '   some text   '
      const result = stripOutput(input)
      expect(result.text).toBe('some text')
    })
  })

  describe('original preservation', () => {
    it('should preserve original input in result', () => {
      const input = '\x1b[31mred\x1b[0m'
      const result = stripOutput(input)
      expect(result.original).toBe(input)
    })
  })

  describe('real-world Claude output', () => {
    it('should handle Claude tool output with colors', () => {
      const input = '\x1b[36m[Bash]\x1b[0m \x1b[33mls -la\x1b[0m'
      const result = stripOutput(input)
      expect(result.text).toBe('[Bash] ls -la')
      expect(result.hasSpinner).toBe(false)
    })

    it('should handle Claude thinking indicator', () => {
      const input = '⠙ Claude is thinking...'
      const result = stripOutput(input)
      expect(result.hasSpinner).toBe(true)
      expect(result.text).toContain('thinking')
    })
  })
})

describe('getLastLines', () => {
  it('should return last N lines', () => {
    const text = 'line1\nline2\nline3\nline4\nline5'
    const result = getLastLines(text, 3)
    expect(result).toEqual(['line3', 'line4', 'line5'])
  })

  it('should return all lines if less than N', () => {
    const text = 'line1\nline2'
    const result = getLastLines(text, 5)
    expect(result).toEqual(['line1', 'line2'])
  })

  it('should filter empty lines', () => {
    const text = 'line1\n\n\nline2\n\nline3'
    const result = getLastLines(text, 5)
    expect(result).toEqual(['line1', 'line2', 'line3'])
  })

  it('should handle single line', () => {
    const text = 'single line'
    const result = getLastLines(text, 3)
    expect(result).toEqual(['single line'])
  })

  it('should handle empty string', () => {
    const text = ''
    const result = getLastLines(text, 3)
    expect(result).toEqual([])
  })
})

describe('matchesAnyPattern', () => {
  const patterns = [/error/i, /warning/i, /failed/i]

  it('should return matching pattern', () => {
    const result = matchesAnyPattern('An Error occurred', patterns)
    expect(result).toEqual(/error/i)
  })

  it('should return first matching pattern when multiple match', () => {
    const result = matchesAnyPattern('Error and Warning', patterns)
    expect(result).toEqual(/error/i)
  })

  it('should return null when no pattern matches', () => {
    const result = matchesAnyPattern('All good here', patterns)
    expect(result).toBe(null)
  })

  it('should handle case insensitive patterns', () => {
    const result = matchesAnyPattern('WARNING: something', patterns)
    expect(result).toEqual(/warning/i)
  })
})
