/**
 * Prompt Normalizer
 *
 * Utilities for normalizing and grouping similar prompts.
 * Supports 3 levels of grouping:
 * - exact: Text normalization (lowercase, trim, punctuation)
 * - similar: Levenshtein-based similarity (80%+ threshold)
 * - semantic: AI embedding-based clustering
 *
 * Includes caching for performance optimization.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type {
  FrequentPrompt,
  GroupedPrompt,
  PromptVariant,
  GroupingMode,
  AIProvider,
} from 'shared/history-types'
import type { AgentType } from 'shared/hook-types'

// ============================================================================
// Caching System
// ============================================================================

interface CacheEntry<T> {
  data: T
  timestamp: number
  hash: string
}

interface GroupingCache {
  exact: Map<string, CacheEntry<GroupedPrompt[]>>
  similar: Map<string, CacheEntry<GroupedPrompt[]>>
  semantic: Map<string, CacheEntry<GroupedPrompt[]>>
}

// In-memory cache
const memoryCache: GroupingCache = {
  exact: new Map(),
  similar: new Map(),
  semantic: new Map(),
}

// Cache TTL (Time-To-Live) in milliseconds
const CACHE_TTL = {
  exact: 5 * 60 * 1000, // 5 minutes for exact (fast, but data might change)
  similar: 10 * 60 * 1000, // 10 minutes for similar
  semantic: 30 * 60 * 1000, // 30 minutes for semantic (expensive API calls)
}

// Max cache entries per mode
const MAX_CACHE_ENTRIES = 10

/**
 * Generate a hash for the prompt list to use as cache key
 */
function generateCacheKey(prompts: FrequentPrompt[], options?: object): string {
  const content = JSON.stringify({
    prompts: prompts.map(p => ({
      content: p.content.slice(0, 100), // Truncate for hash
      count: p.count,
    })),
    options,
  })
  return createHash('md5').update(content).digest('hex').slice(0, 16)
}

/**
 * Get cache file path
 */
function getCacheFilePath(): string {
  return join(app.getPath('home'), '.plexus', 'prompt-grouping-cache.json')
}

/**
 * Load cache from file (for semantic mode persistence)
 */
function loadFileCache(): void {
  try {
    const path = getCacheFilePath()
    if (!existsSync(path)) return

    const content = readFileSync(path, 'utf-8')
    const data = JSON.parse(content) as {
      semantic?: Array<[string, CacheEntry<GroupedPrompt[]>]>
    }

    // Only restore semantic cache (most expensive)
    if (data.semantic) {
      const now = Date.now()
      for (const [key, entry] of data.semantic) {
        // Only restore if not expired
        if (now - entry.timestamp < CACHE_TTL.semantic) {
          memoryCache.semantic.set(key, entry)
        }
      }
    }
  } catch {
    // Ignore cache load errors
  }
}

/**
 * Save semantic cache to file for persistence
 */
function saveFileCache(): void {
  try {
    const path = getCacheFilePath()
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }

    // Only save semantic cache (most valuable)
    const data = {
      semantic: Array.from(memoryCache.semantic.entries()),
    }

    writeFileSync(path, JSON.stringify(data), { mode: 0o600 })
  } catch {
    // Ignore cache save errors
  }
}

/**
 * Get cached result if valid
 */
function getFromCache(mode: GroupingMode, key: string): GroupedPrompt[] | null {
  const cache = memoryCache[mode]
  const entry = cache.get(key)

  if (!entry) return null

  // Check if expired
  const ttl = CACHE_TTL[mode]
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key)
    return null
  }

  return entry.data
}

/**
 * Store result in cache
 */
function setInCache(
  mode: GroupingMode,
  key: string,
  data: GroupedPrompt[]
): void {
  const cache = memoryCache[mode]

  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }

  cache.set(key, {
    data,
    timestamp: Date.now(),
    hash: key,
  })

  // Persist semantic cache to file
  if (mode === 'semantic') {
    saveFileCache()
  }
}

/**
 * Clear all caches
 */
export function clearGroupingCache(): void {
  memoryCache.exact.clear()
  memoryCache.similar.clear()
  memoryCache.semantic.clear()
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  exact: number
  similar: number
  semantic: number
} {
  return {
    exact: memoryCache.exact.size,
    similar: memoryCache.similar.size,
    semantic: memoryCache.semantic.size,
  }
}

// Load file cache on module initialization
loadFileCache()

// ============================================================================
// Level 1: Text Normalization
// ============================================================================

/**
 * Normalize a prompt for exact matching
 * - Lowercase
 * - Trim whitespace
 * - Remove trailing punctuation
 * - Collapse multiple spaces
 */
export function normalizePrompt(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"]+$/g, '') // Remove trailing punctuation
    .replace(/\s+/g, ' ') // Collapse multiple spaces
}

/**
 * Group prompts by normalized text (exact mode)
 */
export function groupByExact(prompts: FrequentPrompt[]): GroupedPrompt[] {
  const groups = new Map<
    string,
    {
      variants: PromptVariant[]
      agents: Set<AgentType>
      lastUsed: number
      totalCount: number
    }
  >()

  for (const prompt of prompts) {
    const normalized = normalizePrompt(prompt.content)

    let group = groups.get(normalized)
    if (!group) {
      group = {
        variants: [],
        agents: new Set(),
        lastUsed: 0,
        totalCount: 0,
      }
      groups.set(normalized, group)
    }

    group.variants.push({
      content: prompt.content,
      count: prompt.count,
      normalizedContent: normalized,
    })
    group.totalCount += prompt.count
    group.lastUsed = Math.max(group.lastUsed, prompt.lastUsed)
    for (const agent of prompt.agents) {
      group.agents.add(agent)
    }
  }

  // Convert to GroupedPrompt array
  const result: GroupedPrompt[] = []
  for (const [, group] of groups) {
    // Sort variants by count descending
    group.variants.sort((a, b) => b.count - a.count)

    result.push({
      representative: group.variants[0].content,
      variants: group.variants,
      totalCount: group.totalCount,
      agents: Array.from(group.agents),
      lastUsed: group.lastUsed,
      groupedBy: 'exact',
    })
  }

  // Sort by total count descending
  result.sort((a, b) => b.totalCount - a.totalCount)

  return result
}

// ============================================================================
// Level 2: Token-based Similarity (Fast)
// ============================================================================

/**
 * Tokenize a prompt into a set of meaningful words
 * O(n) complexity where n is string length
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter(t => t.length > 2) // Filter out short words
  )
}

/**
 * Calculate Jaccard similarity between two token sets
 * O(m + n) complexity where m, n are set sizes
 * @returns 0-1 where 1 is identical, 0 is completely different
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0

  let intersectionSize = 0
  const smaller = a.size <= b.size ? a : b
  const larger = a.size <= b.size ? b : a

  for (const token of smaller) {
    if (larger.has(token)) {
      intersectionSize++
    }
  }

  const unionSize = a.size + b.size - intersectionSize
  return unionSize === 0 ? 0 : intersectionSize / unionSize
}

/**
 * Pre-tokenized prompt for efficient similarity comparison
 */
interface TokenizedPrompt {
  prompt: FrequentPrompt
  tokens: Set<string>
  normalizedContent: string
}

/**
 * Group prompts by token-based similarity (fast mode)
 * Uses Jaccard similarity which is O(m+n) per comparison vs O(m*n) for Levenshtein
 * @param prompts Array of frequent prompts to group
 * @param threshold Jaccard similarity threshold (0.4-0.6 recommended for token-based)
 */
export function groupBySimilarityFast(
  prompts: FrequentPrompt[],
  threshold: number = 0.5
): GroupedPrompt[] {
  // Step 1: Pre-tokenize all prompts (O(n) total)
  const tokenized: TokenizedPrompt[] = prompts.map(p => ({
    prompt: p,
    tokens: tokenize(p.content),
    normalizedContent: normalizePrompt(p.content),
  }))

  // Sort by count descending so most frequent prompts become group representatives
  tokenized.sort((a, b) => b.prompt.count - a.prompt.count)

  const groups: GroupedPrompt[] = []
  const assigned = new Set<number>()

  // Step 2: Greedy clustering with token-based similarity
  for (let i = 0; i < tokenized.length; i++) {
    if (assigned.has(i)) continue

    const current = tokenized[i]
    const group: GroupedPrompt = {
      representative: current.prompt.content,
      variants: [
        {
          content: current.prompt.content,
          count: current.prompt.count,
          similarity: 1,
        },
      ],
      totalCount: current.prompt.count,
      agents: new Set(current.prompt.agents) as unknown as AgentType[],
      lastUsed: current.prompt.lastUsed,
      groupedBy: 'similar',
    }

    const agentSet = new Set(current.prompt.agents)
    assigned.add(i)

    // Find similar prompts
    for (let j = i + 1; j < tokenized.length; j++) {
      if (assigned.has(j)) continue

      const other = tokenized[j]

      // Quick exact match check first
      if (current.normalizedContent === other.normalizedContent) {
        group.variants.push({
          content: other.prompt.content,
          count: other.prompt.count,
          similarity: 1,
        })
        group.totalCount += other.prompt.count
        group.lastUsed = Math.max(group.lastUsed, other.prompt.lastUsed)
        for (const agent of other.prompt.agents) {
          agentSet.add(agent)
        }
        assigned.add(j)
        continue
      }

      // Token-based similarity check
      const similarity = jaccardSimilarity(current.tokens, other.tokens)
      if (similarity >= threshold) {
        group.variants.push({
          content: other.prompt.content,
          count: other.prompt.count,
          similarity,
        })
        group.totalCount += other.prompt.count
        group.lastUsed = Math.max(group.lastUsed, other.prompt.lastUsed)
        for (const agent of other.prompt.agents) {
          agentSet.add(agent)
        }
        assigned.add(j)
      }
    }

    // Convert agent set to array
    group.agents = Array.from(agentSet)

    // Sort variants by count
    group.variants.sort((a, b) => b.count - a.count)

    groups.push(group)
  }

  // Sort groups by total count
  groups.sort((a, b) => b.totalCount - a.totalCount)

  return groups
}

// ============================================================================
// Level 2 (Legacy): Levenshtein Similarity
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 * @deprecated Use groupBySimilarityFast with Jaccard similarity for better performance
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate similarity between two strings (0-1)
 * 1 = identical, 0 = completely different
 */
export function calculateSimilarity(a: string, b: string): number {
  // Normalize both strings first
  const normA = normalizePrompt(a)
  const normB = normalizePrompt(b)

  if (normA === normB) return 1

  const distance = levenshteinDistance(normA, normB)
  const maxLength = Math.max(normA.length, normB.length)

  return maxLength === 0 ? 1 : 1 - distance / maxLength
}

/**
 * Group prompts by similarity (similar mode)
 * Uses a greedy clustering approach with the given threshold
 */
export function groupBySimilarity(
  prompts: FrequentPrompt[],
  threshold: number = 0.8
): GroupedPrompt[] {
  // Sort by count descending so most frequent prompts become group representatives
  const sorted = [...prompts].sort((a, b) => b.count - a.count)

  const groups: GroupedPrompt[] = []
  const assigned = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    if (assigned.has(i)) continue

    const prompt = sorted[i]
    const group: GroupedPrompt = {
      representative: prompt.content,
      variants: [
        {
          content: prompt.content,
          count: prompt.count,
          similarity: 1,
        },
      ],
      totalCount: prompt.count,
      agents: new Set(prompt.agents) as unknown as AgentType[],
      lastUsed: prompt.lastUsed,
      groupedBy: 'similar',
    }

    // Use Set for agents during construction
    const agentSet = new Set(prompt.agents)

    assigned.add(i)

    // Find similar prompts
    for (let j = i + 1; j < sorted.length; j++) {
      if (assigned.has(j)) continue

      const other = sorted[j]
      const similarity = calculateSimilarity(prompt.content, other.content)

      if (similarity >= threshold) {
        group.variants.push({
          content: other.content,
          count: other.count,
          similarity,
        })
        group.totalCount += other.count
        group.lastUsed = Math.max(group.lastUsed, other.lastUsed)
        for (const agent of other.agents) {
          agentSet.add(agent)
        }
        assigned.add(j)
      }
    }

    // Convert agent set to array
    group.agents = Array.from(agentSet)

    // Sort variants by count
    group.variants.sort((a, b) => b.count - a.count)

    groups.push(group)
  }

  // Sort groups by total count
  groups.sort((a, b) => b.totalCount - a.totalCount)

  return groups
}

// ============================================================================
// Level 3: Semantic Grouping (AI-based)
// ============================================================================

// API endpoints for semantic grouping
const SEMANTIC_API_ENDPOINTS = {
  claude: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini:
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
} as const

// Models for semantic grouping
const SEMANTIC_MODELS = {
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
} as const

// System prompt for semantic grouping
const SEMANTIC_GROUPING_PROMPT = `You are a prompt categorization expert. Given a list of user prompts, group them by semantic meaning.

Rules:
1. Group prompts that ask for the same thing, even if worded differently
2. Each prompt can only belong to one group
3. Create groups based on the INTENT, not surface text similarity
4. Respond ONLY with valid JSON, no other text

Input format: Array of {id, text} objects
Output format:
{
  "groups": [
    {
      "name": "Brief description of this group's intent",
      "promptIds": [0, 1, 2]
    }
  ]
}

Example:
Input: [{"id":0,"text":"fix bug"},{"id":1,"text":"debug the issue"},{"id":2,"text":"add test"}]
Output: {"groups":[{"name":"Bug fixing","promptIds":[0,1]},{"name":"Testing","promptIds":[2]}]}`

interface SemanticGroupingResponse {
  groups: Array<{
    name: string
    promptIds: number[]
  }>
}

/**
 * Call Claude API for semantic grouping
 */
async function callClaudeForGrouping(
  prompts: Array<{ id: number; text: string }>,
  apiKey: string
): Promise<SemanticGroupingResponse> {
  const response = await fetch(SEMANTIC_API_ENDPOINTS.claude, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: SEMANTIC_MODELS.claude,
      max_tokens: 4096,
      system: SEMANTIC_GROUPING_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Group these prompts semantically:\n\n${JSON.stringify(prompts)}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const text = data.content?.[0]?.text || ''
  return parseSemanticResponse(text)
}

/**
 * Call OpenAI API for semantic grouping
 */
async function callOpenAIForGrouping(
  prompts: Array<{ id: number; text: string }>,
  apiKey: string
): Promise<SemanticGroupingResponse> {
  const response = await fetch(SEMANTIC_API_ENDPOINTS.openai, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: SEMANTIC_MODELS.openai,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SEMANTIC_GROUPING_PROMPT },
        {
          role: 'user',
          content: `Group these prompts semantically:\n\n${JSON.stringify(prompts)}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content || ''
  return parseSemanticResponse(text)
}

/**
 * Call Gemini API for semantic grouping
 */
async function callGeminiForGrouping(
  prompts: Array<{ id: number; text: string }>,
  apiKey: string
): Promise<SemanticGroupingResponse> {
  const response = await fetch(SEMANTIC_API_ENDPOINTS.gemini, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SEMANTIC_GROUPING_PROMPT }] },
      contents: [
        {
          parts: [
            {
              text: `Group these prompts semantically:\n\n${JSON.stringify(prompts)}`,
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 4096 },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text =
    data.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      .map(p => p.text)
      .join('') || ''
  return parseSemanticResponse(text)
}

/**
 * Parse the semantic grouping response from AI
 */
function parseSemanticResponse(text: string): SemanticGroupingResponse {
  // Remove markdown code blocks if present
  const cleanText = text
    .replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1')
    .trim()

  // Find JSON in response
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in semantic grouping response')
  }

  const parsed = JSON.parse(jsonMatch[0]) as SemanticGroupingResponse
  if (!parsed.groups || !Array.isArray(parsed.groups)) {
    throw new Error('Invalid semantic grouping response format')
  }

  return parsed
}

/**
 * Group prompts by semantic similarity using AI
 */
export async function groupBySemantic(
  prompts: FrequentPrompt[],
  provider: AIProvider,
  apiKey: string
): Promise<GroupedPrompt[]> {
  // Limit to 50 prompts for API efficiency
  const limitedPrompts = prompts.slice(0, 50)

  // Prepare prompts for API call
  const promptsForApi = limitedPrompts.map((p, idx) => ({
    id: idx,
    text: p.content.slice(0, 200), // Truncate long prompts
  }))

  try {
    let semanticGroups: SemanticGroupingResponse

    switch (provider) {
      case 'claude':
        semanticGroups = await callClaudeForGrouping(promptsForApi, apiKey)
        break
      case 'openai':
        semanticGroups = await callOpenAIForGrouping(promptsForApi, apiKey)
        break
      case 'gemini':
        semanticGroups = await callGeminiForGrouping(promptsForApi, apiKey)
        break
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }

    // Convert semantic groups to GroupedPrompt format
    const result: GroupedPrompt[] = []

    for (const group of semanticGroups.groups) {
      if (group.promptIds.length === 0) continue

      const groupPrompts = group.promptIds
        .filter(id => id >= 0 && id < limitedPrompts.length)
        .map(id => limitedPrompts[id])

      if (groupPrompts.length === 0) continue

      const agentSet = new Set<AgentType>()
      const variants: PromptVariant[] = []
      let totalCount = 0
      let lastUsed = 0

      for (const p of groupPrompts) {
        variants.push({
          content: p.content,
          count: p.count,
          similarity: 1, // Semantic grouping doesn't have numerical similarity
        })
        totalCount += p.count
        lastUsed = Math.max(lastUsed, p.lastUsed)
        for (const agent of p.agents) {
          agentSet.add(agent)
        }
      }

      // Sort variants by count
      variants.sort((a, b) => b.count - a.count)

      result.push({
        representative: variants[0].content,
        variants,
        totalCount,
        agents: Array.from(agentSet),
        lastUsed,
        groupedBy: 'semantic',
      })
    }

    // Sort groups by total count
    result.sort((a, b) => b.totalCount - a.totalCount)

    return result
  } catch {
    // Fall back to similarity-based grouping on error
    return groupBySimilarity(prompts, 0.7)
  }
}

// ============================================================================
// Main Grouping Function
// ============================================================================

/**
 * Group prompts based on the specified mode (with caching)
 * Note: 'similar' mode now uses fast token-based Jaccard similarity
 */
export async function groupPrompts(
  prompts: FrequentPrompt[],
  mode: GroupingMode,
  options?: {
    similarityThreshold?: number
    aiProvider?: AIProvider
    apiKey?: string
    skipCache?: boolean
    useLegacyLevenshtein?: boolean // For backwards compatibility
  }
): Promise<GroupedPrompt[]> {
  // Default thresholds differ by algorithm:
  // - Jaccard (token-based): 0.5 is a good balance
  // - Levenshtein (legacy): 0.8 works better for character-level similarity
  const defaultThreshold = options?.useLegacyLevenshtein ? 0.8 : 0.5
  const threshold = options?.similarityThreshold ?? defaultThreshold

  // Generate cache key based on prompts and options
  const cacheKey = generateCacheKey(prompts, { mode, threshold })

  // Check cache first (unless skipCache is set)
  if (!options?.skipCache) {
    const cached = getFromCache(mode, cacheKey)
    if (cached) {
      return cached
    }
  }

  let result: GroupedPrompt[]

  switch (mode) {
    case 'exact':
      result = groupByExact(prompts)
      break

    case 'similar':
      // Use fast token-based similarity by default
      if (options?.useLegacyLevenshtein) {
        result = groupBySimilarity(prompts, threshold)
      } else {
        result = groupBySimilarityFast(prompts, threshold)
      }
      break

    case 'semantic':
      if (!options?.aiProvider || !options?.apiKey) {
        // Fall back to fast similar mode if no AI provider/key
        result = groupBySimilarityFast(prompts, threshold)
      } else {
        result = await groupBySemantic(
          prompts,
          options.aiProvider,
          options.apiKey
        )
      }
      break

    default:
      result = groupByExact(prompts)
  }

  // Store result in cache
  setInCache(mode, cacheKey, result)

  return result
}

// ============================================================================
// Smart Grouping Mode Selection
// ============================================================================

/**
 * Intelligently select grouping mode based on data characteristics
 * @param prompts - Array of frequent prompts to analyze
 * @returns Recommended grouping mode and diversity metric
 */
export function selectSmartGroupingMode(prompts: FrequentPrompt[]): {
  recommendedMode: GroupingMode
  diversity: number
} {
  const totalPrompts = prompts.length

  if (totalPrompts === 0) {
    return { recommendedMode: 'exact', diversity: 0 }
  }

  // Calculate diversity: ratio of unique normalized prompts to total
  const uniqueNormalized = new Set(prompts.map(p => normalizePrompt(p.content)))
    .size
  const diversity = uniqueNormalized / totalPrompts

  // Heuristic rules:
  // - Low volume (< 10): Use exact (no grouping needed)
  // - High volume (> 50): Use similar (reduce noise)
  // - High diversity (> 0.7): Use similar (prompts are varied)
  // - Default: Use exact (clear patterns)

  if (totalPrompts < 10) {
    return { recommendedMode: 'exact', diversity }
  }

  if (totalPrompts > 50) {
    return { recommendedMode: 'similar', diversity }
  }

  if (diversity > 0.7) {
    return { recommendedMode: 'similar', diversity }
  }

  return { recommendedMode: 'exact', diversity }
}
