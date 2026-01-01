/**
 * Curated Prompts - Developer-recommended prompts for common tasks
 */

import type { AgentType } from './hook-types'

export interface CuratedPrompt {
  id: string
  content: string
  category:
    | 'coding'
    | 'debugging'
    | 'refactoring'
    | 'documentation'
    | 'testing'
    | 'general'
  description: string
  recommendedAgents: AgentType[]
  tags: string[]
  priority: number // 1-10, higher = more prominent
}

export const CURATED_PROMPTS: CuratedPrompt[] = [
  {
    id: 'refactor-typescript-types',
    content: 'Refactor this code to be type-safe with TypeScript',
    category: 'refactoring',
    description: 'Add TypeScript type safety to existing code',
    recommendedAgents: ['claude', 'cursor'],
    tags: ['refactor', 'typescript', 'types'],
    priority: 9,
  },
  {
    id: 'add-unit-tests',
    content: 'Write unit tests for this function',
    category: 'testing',
    description: 'Generate comprehensive unit tests',
    recommendedAgents: ['claude', 'cursor'],
    tags: ['testing', 'quality'],
    priority: 8,
  },
  {
    id: 'code-review',
    content: 'Review this code and suggest improvements',
    category: 'general',
    description: 'Review code quality and suggest improvements',
    recommendedAgents: ['claude', 'cursor', 'gemini'],
    tags: ['review', 'quality', 'best-practices'],
    priority: 9,
  },
  {
    id: 'find-and-fix-bug',
    content: 'Find the root cause of this bug and fix it',
    category: 'debugging',
    description: 'Identify and fix bugs',
    recommendedAgents: ['claude', 'cursor'],
    tags: ['debugging', 'fix'],
    priority: 8,
  },
  {
    id: 'add-jsdoc',
    content: 'Add JSDoc documentation to this function',
    category: 'documentation',
    description: 'Add JSDoc documentation',
    recommendedAgents: ['claude', 'cursor'],
    tags: ['documentation', 'jsdoc'],
    priority: 6,
  },
  {
    id: 'extract-function',
    content: 'Extract this code into a reusable function',
    category: 'refactoring',
    description: 'Extract code into reusable function',
    recommendedAgents: ['claude', 'cursor'],
    tags: ['refactor', 'clean-code', 'modular'],
    priority: 7,
  },
  {
    id: 'optimize-performance',
    content: 'Optimize the performance of this code',
    category: 'refactoring',
    description: 'Optimize code performance',
    recommendedAgents: ['claude', 'cursor'],
    tags: ['performance', 'optimization'],
    priority: 7,
  },
  {
    id: 'explain-code',
    content: 'Explain how this code works',
    category: 'general',
    description: 'Explain code behavior and logic',
    recommendedAgents: ['claude', 'cursor', 'gemini'],
    tags: ['explain', 'learning'],
    priority: 8,
  },
  {
    id: 'error-handling',
    content: 'Add proper error handling to this code',
    category: 'coding',
    description: 'Add comprehensive error handling',
    recommendedAgents: ['claude', 'cursor'],
    tags: ['error-handling', 'robustness'],
    priority: 7,
  },
  {
    id: 'add-types',
    content: 'Add TypeScript types to this function',
    category: 'coding',
    description: 'Add TypeScript type annotations',
    recommendedAgents: ['claude', 'cursor'],
    tags: ['typescript', 'types'],
    priority: 6,
  },
  {
    id: 'simplify-logic',
    content: 'Simplify this complex logic',
    category: 'refactoring',
    description: 'Simplify complex logic',
    recommendedAgents: ['claude', 'cursor'],
    tags: ['refactor', 'simplify', 'clean-code'],
    priority: 7,
  },
  {
    id: 'fix-type-errors',
    content: 'Fix the TypeScript type errors',
    category: 'debugging',
    description: 'Fix TypeScript type errors',
    recommendedAgents: ['claude', 'cursor'],
    tags: ['typescript', 'debugging', 'types'],
    priority: 8,
  },
]
