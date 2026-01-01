/**
 * AI API Endpoints
 */

/** Prompt improvement API endpoints */
export const API_ENDPOINTS = {
  claude: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini:
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
} as const

/** Semantic grouping API endpoints */
export const SEMANTIC_API_ENDPOINTS = {
  claude: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini:
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
} as const
