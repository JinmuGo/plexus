/**
 * Cursor API Client
 *
 * Fetches token usage and cost data from Cursor Admin API.
 * API Documentation: https://cursor.com/docs/account/teams/admin-api
 *
 * Rate Limit: 20 requests/minute
 * Recommended: Cache for 1 hour
 */

import type {
  CursorApiConfig,
  CursorUsageEvent,
  CursorUsageResponse,
  ParsedUsage,
} from 'shared/cost-types'
import {
  CURSOR_DEFAULT_BASE_URL,
  CURSOR_DEFAULT_PAGE_SIZE,
  CURSOR_CACHE_TTL_MS,
} from '../constants/cost'

// Cache for rate limiting (1 hour TTL)
interface CacheEntry {
  data: CursorUsageResponse
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create Basic Auth header from API key
 * Cursor uses Basic Auth with apiKey as username and empty password
 */
function createAuthHeader(apiKey: string): string {
  // Cursor API key format: key_xxxxx
  // Basic auth: base64(apiKey:)
  const credentials = `${apiKey}:`
  const encoded = Buffer.from(credentials).toString('base64')
  return `Basic ${encoded}`
}

/**
 * Generate cache key for a request
 */
function getCacheKey(
  startDate: number,
  endDate: number,
  page: number,
  pageSize: number
): string {
  return `${startDate}-${endDate}-${page}-${pageSize}`
}

/**
 * Check if cache entry is valid
 */
function getCachedResponse(key: string): CursorUsageResponse | null {
  const entry = cache.get(key)
  if (!entry) return null

  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }

  return entry.data
}

/**
 * Store response in cache
 */
function setCachedResponse(key: string, data: CursorUsageResponse): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + CURSOR_CACHE_TTL_MS,
  })
}

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Fetch usage events from Cursor Admin API
 *
 * @param config - API configuration with key
 * @param startDate - Start timestamp (ms)
 * @param endDate - End timestamp (ms)
 * @param options - Pagination options
 * @returns Usage response with events and pagination info
 */
export async function fetchCursorUsageEvents(
  config: CursorApiConfig,
  startDate: number,
  endDate: number,
  options?: { page?: number; pageSize?: number }
): Promise<CursorUsageResponse> {
  const baseUrl = config.baseUrl || CURSOR_DEFAULT_BASE_URL
  const page = options?.page || 1
  const pageSize = options?.pageSize || CURSOR_DEFAULT_PAGE_SIZE

  // Check cache first
  const cacheKey = getCacheKey(startDate, endDate, page, pageSize)
  const cached = getCachedResponse(cacheKey)
  if (cached) {
    return cached
  }

  const url = `${baseUrl}/teams/filtered-usage-events`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: createAuthHeader(config.apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      page,
      pageSize,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Cursor API error: ${response.status} ${response.statusText} - ${errorText}`
    )
  }

  const data = (await response.json()) as CursorUsageResponse

  // Cache the response
  setCachedResponse(cacheKey, data)

  return data
}

/**
 * Fetch all usage events across all pages
 * Handles pagination automatically
 *
 * @param config - API configuration
 * @param startDate - Start timestamp (ms)
 * @param endDate - End timestamp (ms)
 * @param maxPages - Maximum pages to fetch (default: 10)
 * @returns All usage events within the date range
 */
export async function fetchAllCursorUsageEvents(
  config: CursorApiConfig,
  startDate: number,
  endDate: number,
  maxPages = 10
): Promise<CursorUsageEvent[]> {
  const allEvents: CursorUsageEvent[] = []
  let currentPage = 1

  while (currentPage <= maxPages) {
    const response = await fetchCursorUsageEvents(config, startDate, endDate, {
      page: currentPage,
    })

    allEvents.push(...response.usageEvents)

    if (!response.pagination.hasNextPage) {
      break
    }

    currentPage++
  }

  return allEvents
}

/**
 * Convert Cursor usage events to ParsedUsage format
 *
 * @param events - Cursor usage events
 * @returns Parsed usage records
 */
export function convertCursorEventsToUsage(
  events: CursorUsageEvent[]
): ParsedUsage[] {
  return events.map(event => ({
    inputTokens: event.tokenUsage.inputTokens,
    outputTokens: event.tokenUsage.outputTokens,
    cacheCreationTokens: event.tokenUsage.cacheWriteTokens,
    cacheReadTokens: event.tokenUsage.cacheReadTokens,
    model: event.model,
    timestamp: new Date(event.timestamp).getTime(),
  }))
}

/**
 * Calculate total cost from Cursor events
 * Cursor provides totalCents and cursorTokenFee directly
 *
 * @param events - Cursor usage events
 * @returns Total cost in USD
 */
export function calculateCursorCost(events: CursorUsageEvent[]): number {
  let totalCents = 0

  for (const event of events) {
    // totalCents from token usage + cursorTokenFee (platform fee)
    totalCents += event.tokenUsage.totalCents + (event.cursorTokenFee || 0)
  }

  // Convert cents to USD
  return totalCents / 100
}

/**
 * Get Cursor usage summary for a date range
 *
 * @param config - API configuration
 * @param startDate - Start timestamp (ms)
 * @param endDate - End timestamp (ms)
 * @returns Usage summary with totals
 */
export async function getCursorUsageSummary(
  config: CursorApiConfig,
  startDate: number,
  endDate: number
): Promise<{
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheWriteTokens: number
  totalCacheReadTokens: number
  totalCostUsd: number
  eventCount: number
  modelBreakdown: Map<string, number>
}> {
  const events = await fetchAllCursorUsageEvents(config, startDate, endDate)

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheWriteTokens = 0
  let totalCacheReadTokens = 0
  const modelBreakdown = new Map<string, number>()

  for (const event of events) {
    totalInputTokens += event.tokenUsage.inputTokens
    totalOutputTokens += event.tokenUsage.outputTokens
    totalCacheWriteTokens += event.tokenUsage.cacheWriteTokens
    totalCacheReadTokens += event.tokenUsage.cacheReadTokens

    const modelCost = modelBreakdown.get(event.model) || 0
    modelBreakdown.set(
      event.model,
      modelCost + event.tokenUsage.totalCents / 100
    )
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheWriteTokens,
    totalCacheReadTokens,
    totalCostUsd: calculateCursorCost(events),
    eventCount: events.length,
    modelBreakdown,
  }
}

/**
 * Test API connection and validate API key
 *
 * @param config - API configuration
 * @returns True if connection successful
 */
export async function testCursorApiConnection(
  config: CursorApiConfig
): Promise<boolean> {
  try {
    // Try to fetch a small time range to test connection
    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    await fetchCursorUsageEvents(config, oneDayAgo, now, {
      page: 1,
      pageSize: 1,
    })

    return true
  } catch {
    return false
  }
}

/**
 * Clear the response cache
 */
export function clearCursorCache(): void {
  cache.clear()
}
