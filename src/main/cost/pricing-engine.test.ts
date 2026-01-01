/**
 * Pricing Engine Tests
 *
 * Tests for cost calculation, model lookup, and formatting functions.
 */

import { describe, it, expect } from 'vitest'
import {
  getModelPricing,
  calculateCostFromPricing,
  calculateCostByAgent,
} from './pricing-engine'
import type { ParsedUsage } from 'shared/cost-types'

// ============================================================================
// Test Fixtures
// ============================================================================

const createUsage = (overrides: Partial<ParsedUsage> = {}): ParsedUsage => ({
  model: 'claude-sonnet-4-20250514',
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  timestamp: Date.now(),
  ...overrides,
})

// ============================================================================
// Model Pricing Lookup Tests
// ============================================================================

describe('getModelPricing', () => {
  describe('direct lookup', () => {
    it('should find exact model match', () => {
      const pricing = getModelPricing('claude-sonnet-4-20250514')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Claude Sonnet 4')
      expect(pricing?.inputPricePerMillion).toBe(3)
      expect(pricing?.outputPricePerMillion).toBe(15)
    })

    it('should find Gemini model', () => {
      const pricing = getModelPricing('gemini-2.5-pro')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Gemini 2.5 Pro')
      expect(pricing?.inputPricePerMillion).toBe(1.25)
    })

    it('should find Cursor model', () => {
      const pricing = getModelPricing('cursor-small')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Cursor Small')
    })
  })

  describe('partial match', () => {
    it('should match model with date suffix variation', () => {
      const pricing = getModelPricing('claude-opus-4-20250514-custom')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Claude Opus 4')
    })
  })

  describe('family matching', () => {
    it('should match opus-4-5 variant', () => {
      const pricing = getModelPricing('my-opus-4-5-model')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Claude Opus 4.5')
    })

    it('should match opus-4.5 variant', () => {
      const pricing = getModelPricing('opus-4.5-custom')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Claude Opus 4.5')
    })

    it('should match generic opus to Opus 4', () => {
      const pricing = getModelPricing('some-opus-model')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Claude Opus 4')
    })

    it('should match sonnet-4-5 variant', () => {
      const pricing = getModelPricing('sonnet-4-5-custom')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Claude Sonnet 4.5')
    })

    it('should match generic sonnet', () => {
      const pricing = getModelPricing('my-sonnet-model')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Claude Sonnet 4')
    })

    it('should match haiku-4-5 variant', () => {
      const pricing = getModelPricing('haiku-4-5-test')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Claude Haiku 4.5')
    })

    it('should match generic haiku to 3.5 Haiku', () => {
      const pricing = getModelPricing('some-haiku-model')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Claude 3.5 Haiku')
    })

    it('should match gemini-2.5-flash', () => {
      const pricing = getModelPricing('gemini-2.5-flash-latest')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Gemini 2.5 Flash')
    })

    it('should match gemini-2.5 to Pro', () => {
      const pricing = getModelPricing('gemini-2.5-custom')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Gemini 2.5 Pro')
    })

    it('should match gemini-2.0 to Flash', () => {
      const pricing = getModelPricing('gemini-2.0-latest')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Gemini 2.0 Flash')
    })

    it('should match gemini-1.5-flash', () => {
      const pricing = getModelPricing('gemini-1.5-flash-002')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Gemini 1.5 Flash')
    })

    it('should match gemini-1.5 to Pro', () => {
      const pricing = getModelPricing('gemini-1.5-latest')
      expect(pricing).not.toBeNull()
      expect(pricing?.displayName).toBe('Gemini 1.5 Pro')
    })
  })

  describe('unknown models', () => {
    it('should return null for completely unknown model', () => {
      const pricing = getModelPricing('gpt-4-turbo')
      expect(pricing).toBeNull()
    })

    it('should return null for empty string', () => {
      const pricing = getModelPricing('')
      expect(pricing).toBeNull()
    })
  })
})

// ============================================================================
// Cost Calculation Tests
// ============================================================================

describe('calculateCostFromPricing', () => {
  it('should calculate basic input/output cost', () => {
    const usage = createUsage({
      inputTokens: 1_000_000, // 1M tokens
      outputTokens: 500_000, // 0.5M tokens
    })
    const pricing = getModelPricing('claude-sonnet-4-20250514')
    if (!pricing) throw new Error('Expected pricing to be defined')

    const cost = calculateCostFromPricing(usage, pricing)

    // Input: 1M * $3/M = $3
    // Output: 0.5M * $15/M = $7.5
    // Total: $10.5
    expect(cost).toBe(10.5)
  })

  it('should include cache read cost', () => {
    const usage = createUsage({
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
    })
    const pricing = getModelPricing('claude-sonnet-4-20250514')
    if (!pricing) throw new Error('Expected pricing to be defined')

    const cost = calculateCostFromPricing(usage, pricing)

    // Input: 1M * $3/M = $3
    // Cache read: 1M * $0.3/M = $0.3
    // Total: $3.3
    expect(cost).toBe(3.3)
  })

  it('should include cache creation cost', () => {
    const usage = createUsage({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 1_000_000,
    })
    const pricing = getModelPricing('claude-sonnet-4-20250514')
    if (!pricing) throw new Error('Expected pricing to be defined')

    const cost = calculateCostFromPricing(usage, pricing)

    // Cache creation: 1M * $3.75/M = $3.75
    expect(cost).toBe(3.75)
  })

  it('should handle zero tokens', () => {
    const usage = createUsage({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    })
    const pricing = getModelPricing('claude-sonnet-4-20250514')
    if (!pricing) throw new Error('Expected pricing to be defined')

    const cost = calculateCostFromPricing(usage, pricing)
    expect(cost).toBe(0)
  })

  it('should handle models without cache pricing', () => {
    const usage = createUsage({
      model: 'cursor-small',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000, // Should be ignored
    })
    const pricing = getModelPricing('cursor-small')
    if (!pricing) throw new Error('Expected pricing to be defined')

    const cost = calculateCostFromPricing(usage, pricing)

    // Input: 1M * $0.1/M = $0.1
    // Output: 1M * $0.3/M = $0.3
    // Cache: ignored (no pricing)
    // Total: $0.4
    expect(cost).toBe(0.4)
  })

  it('should calculate Opus 4.5 pricing correctly (cheaper than Opus 4)', () => {
    const usage = createUsage({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    const opus45 = getModelPricing('claude-opus-4-5-20251101')
    const opus4 = getModelPricing('claude-opus-4-20250514')
    if (!opus45) throw new Error('Expected opus45 pricing to be defined')
    if (!opus4) throw new Error('Expected opus4 pricing to be defined')

    const cost45 = calculateCostFromPricing(usage, opus45)
    const cost4 = calculateCostFromPricing(usage, opus4)

    // Opus 4.5: 1M * $5 + 1M * $25 = $30
    // Opus 4: 1M * $15 + 1M * $75 = $90
    expect(cost45).toBe(30)
    expect(cost4).toBe(90)
    expect(cost45).toBeLessThan(cost4)
  })
})

describe('calculateCostByAgent', () => {
  it('should use direct model pricing when available', () => {
    const usage = createUsage({
      model: 'claude-opus-4-5-20251101',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })

    const cost = calculateCostByAgent(usage, 'claude')
    expect(cost).toBe(30) // Opus 4.5 pricing
  })

  it('should fallback to Sonnet 4 for unknown Claude model', () => {
    const usage = createUsage({
      model: 'unknown-claude-model',
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    })

    const cost = calculateCostByAgent(usage, 'claude')
    // Uses Sonnet 4 fallback: $3 + $7.5 = $10.5
    expect(cost).toBe(10.5)
  })

  it('should fallback to Gemini 2.0 Flash for unknown Gemini model', () => {
    const usage = createUsage({
      model: 'unknown-gemini-model',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })

    const cost = calculateCostByAgent(usage, 'gemini')
    // Uses Gemini 2.0 Flash fallback: $0.1 + $0.4 = $0.5
    expect(cost).toBe(0.5)
  })

  it('should fallback to Cursor Small for unknown Cursor model', () => {
    const usage = createUsage({
      model: 'unknown-cursor-model',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })

    const cost = calculateCostByAgent(usage, 'cursor')
    // Uses Cursor Small fallback: $0.1 + $0.3 = $0.4
    expect(cost).toBe(0.4)
  })
})
