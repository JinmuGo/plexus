/**
 * Pricing Engine
 *
 * Calculates costs based on token usage and model pricing.
 * Supports Claude (Anthropic), Gemini (Google), and Cursor models.
 *
 * Pricing as of January 2025.
 */

import type { ModelPricing, ParsedUsage } from 'shared/cost-types'
import type { AgentType } from 'shared/hook-types'

// ============================================================================
// Model Pricing Data
// ============================================================================

/**
 * Claude (Anthropic) model pricing per million tokens (USD)
 *
 * Cache pricing formula:
 * - 5-minute cache write: 1.25x base input price
 * - 1-hour cache write: 2x base input price
 * - Cache read/hits: 0.1x base input price
 *
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 * Last updated: 2025-01
 */
const CLAUDE_PRICING: ModelPricing[] = [
  // Opus models
  {
    model: 'claude-opus-4-5-20251101',
    inputPricePerMillion: 5, // 67% cheaper than Opus 4!
    outputPricePerMillion: 25,
    cacheReadPricePerMillion: 0.5,
    cacheCreatePricePerMillion: 6.25,
    displayName: 'Claude Opus 4.5',
    provider: 'anthropic',
  },
  {
    model: 'claude-opus-4-20250514',
    inputPricePerMillion: 15,
    outputPricePerMillion: 75,
    cacheReadPricePerMillion: 1.5,
    cacheCreatePricePerMillion: 18.75,
    displayName: 'Claude Opus 4',
    provider: 'anthropic',
  },
  // Sonnet models
  {
    model: 'claude-sonnet-4-5-20250514',
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    cacheReadPricePerMillion: 0.3,
    cacheCreatePricePerMillion: 3.75,
    displayName: 'Claude Sonnet 4.5',
    provider: 'anthropic',
  },
  {
    model: 'claude-sonnet-4-20250514',
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    cacheReadPricePerMillion: 0.3,
    cacheCreatePricePerMillion: 3.75,
    displayName: 'Claude Sonnet 4',
    provider: 'anthropic',
  },
  {
    model: 'claude-3-5-sonnet-20241022',
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    cacheReadPricePerMillion: 0.3,
    cacheCreatePricePerMillion: 3.75,
    displayName: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
  },
  // Haiku models
  {
    model: 'claude-haiku-4-5-20250514',
    inputPricePerMillion: 1,
    outputPricePerMillion: 5,
    cacheReadPricePerMillion: 0.1,
    cacheCreatePricePerMillion: 1.25,
    displayName: 'Claude Haiku 4.5',
    provider: 'anthropic',
  },
  {
    model: 'claude-3-5-haiku-20241022',
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4,
    cacheReadPricePerMillion: 0.08,
    cacheCreatePricePerMillion: 1,
    displayName: 'Claude 3.5 Haiku',
    provider: 'anthropic',
  },
]

/**
 * Gemini (Google) model pricing per million tokens (USD)
 *
 * Note: Prices shown are for standard context (≤200k tokens)
 * Long context (>200k) is charged at 2x rates
 *
 * Source: https://ai.google.dev/gemini-api/docs/pricing
 * Last updated: 2025-01
 */
const GEMINI_PRICING: ModelPricing[] = [
  // 2.5 series
  {
    model: 'gemini-2.5-pro',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10,
    cacheReadPricePerMillion: 0.3125, // 25% of input price
    displayName: 'Gemini 2.5 Pro',
    provider: 'google',
  },
  {
    model: 'gemini-2.5-flash',
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 2.5,
    cacheReadPricePerMillion: 0.075,
    displayName: 'Gemini 2.5 Flash',
    provider: 'google',
  },
  // 2.0 series
  {
    model: 'gemini-2.0-flash',
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.4,
    cacheReadPricePerMillion: 0.025,
    displayName: 'Gemini 2.0 Flash',
    provider: 'google',
  },
  {
    model: 'gemini-2.0-flash-exp',
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.4,
    cacheReadPricePerMillion: 0.025,
    displayName: 'Gemini 2.0 Flash (Exp)',
    provider: 'google',
  },
  // 1.5 series (legacy)
  {
    model: 'gemini-1.5-pro',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5,
    cacheReadPricePerMillion: 0.3125,
    displayName: 'Gemini 1.5 Pro',
    provider: 'google',
  },
  {
    model: 'gemini-1.5-flash',
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    cacheReadPricePerMillion: 0.0375,
    displayName: 'Gemini 1.5 Flash',
    provider: 'google',
  },
]

/**
 * Cursor model pricing (fallback estimates when API cost not available)
 * Cursor typically uses underlying models (Claude, GPT) with markup
 */
const CURSOR_PRICING: ModelPricing[] = [
  {
    model: 'cursor-small',
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.3,
    displayName: 'Cursor Small',
    provider: 'cursor',
  },
]

/**
 * All available pricing data
 */
const ALL_PRICING = [...CLAUDE_PRICING, ...GEMINI_PRICING, ...CURSOR_PRICING]

// Create a lookup map for faster access
const PRICING_MAP = new Map<string, ModelPricing>()
for (const pricing of ALL_PRICING) {
  PRICING_MAP.set(pricing.model, pricing)
}

// ============================================================================
// Pricing Lookup Functions
// ============================================================================

/**
 * Get pricing for a specific model
 *
 * @param model - Model identifier
 * @returns Pricing info or null if unknown
 */
export function getModelPricing(model: string): ModelPricing | null {
  // Handle empty or whitespace-only input
  if (!model || !model.trim()) return null

  // Direct lookup
  const direct = PRICING_MAP.get(model)
  if (direct) return direct

  // Try partial match (e.g., "claude-opus-4" matches "claude-opus-4-20250514")
  for (const pricing of ALL_PRICING) {
    if (model.includes(pricing.model) || pricing.model.includes(model)) {
      return pricing
    }
  }

  // Model family match
  const modelLower = model.toLowerCase()

  // Claude model family matching
  if (modelLower.includes('opus-4-5') || modelLower.includes('opus-4.5')) {
    return PRICING_MAP.get('claude-opus-4-5-20251101') || null
  }
  if (modelLower.includes('opus')) {
    return PRICING_MAP.get('claude-opus-4-20250514') || null
  }
  if (modelLower.includes('sonnet-4-5') || modelLower.includes('sonnet-4.5')) {
    return PRICING_MAP.get('claude-sonnet-4-5-20250514') || null
  }
  if (modelLower.includes('sonnet')) {
    return PRICING_MAP.get('claude-sonnet-4-20250514') || null
  }
  if (modelLower.includes('haiku-4-5') || modelLower.includes('haiku-4.5')) {
    return PRICING_MAP.get('claude-haiku-4-5-20250514') || null
  }
  if (modelLower.includes('haiku')) {
    return PRICING_MAP.get('claude-3-5-haiku-20241022') || null
  }

  // Gemini model family matching
  if (modelLower.includes('gemini-2.5-flash')) {
    return PRICING_MAP.get('gemini-2.5-flash') || null
  }
  if (modelLower.includes('gemini-2.5')) {
    return PRICING_MAP.get('gemini-2.5-pro') || null
  }
  if (
    modelLower.includes('gemini-2.0') ||
    modelLower.includes('gemini-2-flash')
  ) {
    return PRICING_MAP.get('gemini-2.0-flash') || null
  }
  if (modelLower.includes('gemini-1.5-flash')) {
    return PRICING_MAP.get('gemini-1.5-flash') || null
  }
  if (modelLower.includes('gemini-1.5')) {
    return PRICING_MAP.get('gemini-1.5-pro') || null
  }

  return null
}

// ============================================================================
// Cost Calculation Functions
// ============================================================================

/**
 * Calculate cost for token usage based on pricing
 *
 * @param usage - Token usage data
 * @param pricing - Model pricing
 * @returns Cost in USD
 */
export function calculateCostFromPricing(
  usage: ParsedUsage,
  pricing: ModelPricing
): number {
  const inputCost =
    (usage.inputTokens / 1_000_000) * pricing.inputPricePerMillion
  const outputCost =
    (usage.outputTokens / 1_000_000) * pricing.outputPricePerMillion

  let cacheReadCost = 0
  if (pricing.cacheReadPricePerMillion) {
    cacheReadCost =
      (usage.cacheReadTokens / 1_000_000) * pricing.cacheReadPricePerMillion
  }

  let cacheCreateCost = 0
  if (pricing.cacheCreatePricePerMillion) {
    cacheCreateCost =
      (usage.cacheCreationTokens / 1_000_000) *
      pricing.cacheCreatePricePerMillion
  }

  return inputCost + outputCost + cacheReadCost + cacheCreateCost
}

/**
 * Calculate cost based on agent type (for fallback pricing)
 *
 * @param usage - Token usage data
 * @param agent - Agent type (claude, gemini, cursor)
 * @returns Cost in USD
 */
export function calculateCostByAgent(
  usage: ParsedUsage,
  agent: AgentType
): number {
  // First try direct model lookup
  const pricing = getModelPricing(usage.model)
  if (pricing) {
    return calculateCostFromPricing(usage, pricing)
  }

  // Fallback to default pricing by agent type
  let fallbackPricing: ModelPricing | undefined

  switch (agent) {
    case 'claude':
      fallbackPricing = PRICING_MAP.get('claude-sonnet-4-20250514')
      break
    case 'gemini':
      fallbackPricing = PRICING_MAP.get('gemini-2.0-flash')
      break
    case 'cursor':
      fallbackPricing = PRICING_MAP.get('cursor-small')
      break
  }

  if (fallbackPricing) {
    return calculateCostFromPricing(usage, fallbackPricing)
  }

  return 0
}
