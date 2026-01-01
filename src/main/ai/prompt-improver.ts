/**
 * Prompt Improver Service
 *
 * Calls AI APIs (Claude, OpenAI, Gemini) to improve user prompts
 * for better clarity and effectiveness when working with AI assistants.
 */

import { safeStorage } from 'electron'
import { app } from 'electron'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
  unlinkSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import type {
  AIProvider,
  PromptImprovement,
  AISettings,
  SavedPrompt,
} from 'shared/history-types'
import {
  API_ENDPOINTS,
  MODELS,
  DEFAULT_IMPROVEMENT_PROMPT,
} from '../constants/ai'

// ============================================================================
// Prompt Template Management
// ============================================================================

interface PromptTemplates {
  improvement: string
}

/**
 * Path to prompts configuration file
 */
function getPromptsPath(): string {
  return join(app.getPath('home'), '.plexus', 'prompts.json')
}

/**
 * Load prompt templates from JSON file
 */
function loadPromptTemplates(): PromptTemplates {
  const path = getPromptsPath()
  if (!existsSync(path)) {
    return { improvement: DEFAULT_IMPROVEMENT_PROMPT }
  }
  try {
    const content = readFileSync(path, 'utf-8')
    const templates = JSON.parse(content) as Partial<PromptTemplates>
    return {
      improvement: templates.improvement || DEFAULT_IMPROVEMENT_PROMPT,
    }
  } catch {
    return { improvement: DEFAULT_IMPROVEMENT_PROMPT }
  }
}

/**
 * Save prompt templates to JSON file
 */
export function savePromptTemplates(templates: Partial<PromptTemplates>): void {
  const current = loadPromptTemplates()
  const updated = { ...current, ...templates }
  const path = getPromptsPath()
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(path, JSON.stringify(updated, null, 2), { mode: 0o600 })
}

/**
 * Get the improvement prompt template
 */
export function getImprovementPrompt(): string {
  return loadPromptTemplates().improvement
}

/**
 * Reset prompts to defaults
 */
export function resetPromptsToDefaults(): void {
  const path = getPromptsPath()
  if (existsSync(path)) {
    unlinkSync(path)
  }
}

/**
 * Path to API keys storage file
 */
function getApiKeysPath(): string {
  return join(app.getPath('home'), '.plexus', 'api-keys.json')
}

/**
 * Encrypted API key storage
 */
interface ApiKeyStorage {
  [provider: string]: string // base64 encoded encrypted key
}

/**
 * Load API keys from storage
 */
function loadApiKeys(): ApiKeyStorage {
  const path = getApiKeysPath()
  if (!existsSync(path)) {
    return {}
  }
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

/**
 * Save API keys to storage with restricted permissions
 */
function saveApiKeys(keys: ApiKeyStorage): void {
  const path = getApiKeysPath()
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(path, JSON.stringify(keys, null, 2), { mode: 0o600 })
  // Ensure permissions are set even if file already existed
  chmodSync(path, 0o600)
}

/**
 * Set an API key for a provider (encrypted)
 */
export function setApiKey(provider: AIProvider, key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(
      '[PromptImprover] Encryption not available, storing key unencrypted'
    )
    const keys = loadApiKeys()
    keys[provider] = Buffer.from(key).toString('base64')
    saveApiKeys(keys)
    return
  }

  const encrypted = safeStorage.encryptString(key)
  const keys = loadApiKeys()
  keys[provider] = encrypted.toString('base64')
  saveApiKeys(keys)
}

/**
 * Get an API key for a provider (decrypted)
 */
export function getApiKey(provider: AIProvider): string | null {
  const keys = loadApiKeys()
  const encrypted = keys[provider]
  if (!encrypted) {
    return null
  }

  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, 'base64').toString('utf-8')
    }
    const buffer = Buffer.from(encrypted, 'base64')
    return safeStorage.decryptString(buffer)
  } catch {
    return null
  }
}

/**
 * Check if an API key is configured for a provider
 */
export function hasApiKey(provider: AIProvider): boolean {
  return getApiKey(provider) !== null
}

/**
 * Remove an API key
 */
export function removeApiKey(provider: AIProvider): void {
  const keys = loadApiKeys()
  delete keys[provider]
  saveApiKeys(keys)
}

// ============================================================================
// AI Settings Management
// ============================================================================

const DEFAULT_SETTINGS: AISettings = {
  maxOutputTokens: 8192,
  defaultProvider: null,
  groupingMode: 'exact',
  similarityThreshold: 0.8,
}

/**
 * Path to AI settings file
 */
function getSettingsPath(): string {
  return join(app.getPath('home'), '.plexus', 'ai-settings.json')
}

/**
 * Load AI settings
 */
export function getSettings(): AISettings {
  const path = getSettingsPath()
  if (!existsSync(path)) {
    return DEFAULT_SETTINGS
  }
  try {
    const content = readFileSync(path, 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

/**
 * Save AI settings
 */
export function saveSettings(settings: Partial<AISettings>): void {
  const current = getSettings()
  const updated = { ...current, ...settings }
  const path = getSettingsPath()
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(path, JSON.stringify(updated, null, 2), { mode: 0o600 })
}

// ============================================================================
// Saved Prompts Management
// ============================================================================

/**
 * Path to saved prompts file
 */
function getSavedPromptsPath(): string {
  return join(app.getPath('home'), '.plexus', 'saved-prompts.json')
}

/**
 * Load saved prompts
 */
export function getSavedPrompts(): SavedPrompt[] {
  const path = getSavedPromptsPath()
  if (!existsSync(path)) {
    return []
  }
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
}

/**
 * Save a prompt improvement
 */
export function savePrompt(improvement: PromptImprovement): SavedPrompt {
  const prompts = getSavedPrompts()
  const saved: SavedPrompt = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    original: improvement.original,
    improved: improvement.improved,
    changes: improvement.changes,
    provider: improvement.provider,
    savedAt: Date.now(),
  }
  prompts.unshift(saved) // Add to beginning
  // Keep only last 100 saved prompts
  const trimmed = prompts.slice(0, 100)
  const path = getSavedPromptsPath()
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(path, JSON.stringify(trimmed, null, 2), { mode: 0o600 })
  return saved
}

/**
 * Delete a saved prompt
 */
export function deleteSavedPrompt(id: string): boolean {
  const prompts = getSavedPrompts()
  const filtered = prompts.filter(p => p.id !== id)
  if (filtered.length === prompts.length) {
    return false // Not found
  }
  const path = getSavedPromptsPath()
  writeFileSync(path, JSON.stringify(filtered, null, 2), { mode: 0o600 })
  return true
}

// ============================================================================
// API Call Functions
// ============================================================================

/**
 * Call Claude API
 */
async function callClaudeAPI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(API_ENDPOINTS.claude, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELS.claude,
      max_tokens: 1024,
      system: getImprovementPrompt(),
      messages: [
        {
          role: 'user',
          content: `Improve this prompt:\n\n${prompt}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude API error: ${response.status} - ${error}`)
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }

  const text = data.content?.[0]?.text
  if (!text) {
    throw new Error('Invalid Claude API response: missing content')
  }
  return text
}

/**
 * Call OpenAI API
 */
async function callOpenAIAPI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(API_ENDPOINTS.openai, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELS.openai,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: getImprovementPrompt(),
        },
        {
          role: 'user',
          content: `Improve this prompt:\n\n${prompt}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${error}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const text = data.choices?.[0]?.message?.content
  if (!text) {
    throw new Error('Invalid OpenAI API response: missing content')
  }
  return text
}

/**
 * Call Gemini API
 */
async function callGeminiAPI(prompt: string, apiKey: string): Promise<string> {
  const settings = getSettings()
  const response = await fetch(API_ENDPOINTS.gemini, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: getImprovementPrompt() }],
      },
      contents: [
        {
          parts: [{ text: `Improve this prompt:\n\n${prompt}` }],
        },
      ],
      generationConfig: {
        maxOutputTokens: settings.maxOutputTokens,
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${error}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
      finishReason?: string
    }>
  }

  const candidate = data.candidates?.[0]
  if (!candidate?.content?.parts) {
    throw new Error('Invalid Gemini API response: missing content')
  }

  // Concatenate all text parts (in case response is split across multiple parts)
  const text = candidate.content.parts
    .filter(part => part.text)
    .map(part => part.text)
    .join('')

  if (!text) {
    throw new Error('Invalid Gemini API response: empty text')
  }

  return text
}

/**
 * Parse AI response to extract improvement
 */
function parseImprovementResponse(
  response: string,
  originalPrompt: string,
  provider: AIProvider
): PromptImprovement {
  try {
    let jsonString = response

    // Remove markdown code block wrapping if present (```json ... ``` or ``` ... ```)
    const markdownMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (markdownMatch) {
      jsonString = markdownMatch[1]
    }

    // Try to extract JSON object
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      improved: string
      changes: string[]
    }

    if (!parsed.improved) {
      throw new Error('Missing improved field in response')
    }

    return {
      original: originalPrompt,
      improved: parsed.improved,
      changes: parsed.changes || [],
      provider,
    }
  } catch {
    // Fallback: treat entire response as improved prompt
    return {
      original: originalPrompt,
      improved: response.trim(),
      changes: ['AI generated improvement'],
      provider,
    }
  }
}

/**
 * Improve a prompt using the specified AI provider
 */
export async function improvePrompt(
  prompt: string,
  provider: AIProvider
): Promise<PromptImprovement> {
  const apiKey = getApiKey(provider)
  if (!apiKey) {
    throw new Error(`API key not configured for ${provider}`)
  }

  let response: string

  switch (provider) {
    case 'claude':
      response = await callClaudeAPI(prompt, apiKey)
      break
    case 'openai':
      response = await callOpenAIAPI(prompt, apiKey)
      break
    case 'gemini':
      response = await callGeminiAPI(prompt, apiKey)
      break
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }

  return parseImprovementResponse(response, prompt, provider)
}
