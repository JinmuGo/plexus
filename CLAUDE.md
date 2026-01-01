# Plexus

AI Agent Observability Platform - A desktop dashboard to monitor status and intervene instantly across multiple AI agents.

## Tech Stack

- **Runtime**: Electron 39+ / Node.js 22 LTS
- **Frontend**: React 19 + TypeScript 5.9
- **Styling**: Tailwind CSS v4 + shadcn/ui (new-york style)
- **State**: Zustand
- **Build**: electron-vite + electron-builder
- **Linter/Formatter**: Biome
- **Package Manager**: pnpm 10

## Project Structure

```
src/
├── main/              # Electron Main Process
│   ├── ai/            # AI prompt improvement service
│   ├── config/        # App configuration
│   ├── constants/     # Centralized constants management
│   │   ├── ai/        # AI API, models, prompts
│   │   ├── cost/      # Cost calculation related
│   │   ├── hooks/     # Hook settings (claude, cursor, gemini)
│   │   └── utils/     # Utility constants
│   ├── cost/          # Cost tracking and pricing
│   ├── factories/     # Electron window/app factories
│   ├── extensions/    # Electron extensions (React DevTools, etc.)
│   ├── history/       # Session history (SQLite)
│   ├── hooks/         # Agent hook installers & socket server
│   ├── inference/     # Status inference engine
│   ├── ipc/           # IPC handlers
│   ├── lib/           # Shared utilities
│   ├── notifications/ # Notification management
│   ├── store/         # State management (Zustand)
│   ├── utils/         # Electron utilities
│   ├── webhooks/      # Discord/Slack notifications
│   └── windows/       # Window management
├── renderer/          # React Frontend (UI)
│   ├── components/    # React components
│   │   ├── analytics/     # Usage analytics
│   │   ├── dashboard/     # Dashboard & session tiles
│   │   ├── history/       # History viewer
│   │   ├── keyboard/      # Keyboard shortcuts
│   │   ├── settings/      # Settings panels
│   │   ├── sidebar/       # Sidebar navigation
│   │   └── ui/            # shadcn/ui components
│   ├── lib/           # Utilities & hooks
│   ├── providers/     # React context providers
│   └── screens/       # Screen components
├── agent-scripts/     # Agent hook scripts (Claude, Cursor, Gemini)
├── preload/           # Electron Preload Script
└── shared/            # Shared types/constants

scripts/
└── release/           # Build/release scripts
```

## Commands

```bash
pnpm dev          # Run development server
pnpm build        # Production build
pnpm lint         # Biome lint check
pnpm lint:fix     # Biome auto-fix
pnpm typecheck    # TypeScript type check
```

## Code Style (Biome)

- 2-space indentation
- Single quotes (`'`)
- Semicolons: only when necessary (ASI)
- Trailing comma: ES5 style
- Line endings: LF
- JSX quotes: double quotes (`"`)
- Arrow function parentheses: only when necessary

## Architecture Principles

| Principle | Description |
|-----------|-------------|
| **Local-First** | All data stored on user's local machine, no external transmission |
| **Non-Intrusive** | Does not modify existing dev environment (terminal, shell) |
| **Low Latency** | Ultra-low latency IPC communication for real-time monitoring |
| **Modular** | Extensible plugin architecture for agent profiles, notification channels |
| **Resilient** | Loose coupling between components, fault isolation |

## Coding Guidelines

### TypeScript
- No `any` type - explicit interface definitions required
- Shared types defined in `src/shared/types.ts`
- Strict mode enabled

### React / Frontend
- Functional components + hooks
- Use shadcn/ui components (path: `renderer/components/ui`)
- Tailwind CSS v4 (CSS variables based)

### Electron
- Main ↔ Renderer communication via IPC channels
- Use contextBridge through preload script
- Security: nodeIntegration disabled, contextIsolation enabled

### Import Aliases
```typescript
import { ... } from 'renderer/components/ui/button'  // UI components
import { ... } from 'renderer/lib/utils'             // Utilities
import { ... } from 'shared/types'                   // Shared types
import { ... } from 'main/constants/sessions'        // Main process constants
```

### Constants Management
- Constants centrally managed in `src/main/constants/` folder
- Category subfolders: `ai/`, `cost/`, `hooks/`, `utils/`
- No hardcoding - extract repeated values into constants
- Prompt templates can be externalized to `~/.plexus/prompts.json`

### Tailwind CSS Guidelines
- No arbitrary value syntax in className (e.g., `text-[10px]`, `w-[100px]`, `h-[50px]`)
- Use standard Tailwind utility classes instead (e.g., `text-xs`, `w-24`, `h-12`)
- If a specific size is needed, define it in `globals.css` or theme config
- Viewport units like `max-h-[85vh]` are acceptable when no standard alternative exists

## Agent Status Types

Status types used for agent state inference:
- `Initializing` - Session starting
- `Active` - Active state
- `Thinking` - Processing (spinner/generation keywords)
- `AwaitingInput` - Waiting for user input
- `ToolUse` - Using tools
- `Error` - Error occurred
- `Idle` - Idle state

## Agent Status Tracking Architecture

### Status Flow

```
Hook Script (agent-scripts/)
    ↓ mapEventToStatus()
Unix Socket (/tmp/plexus-hooks.sock)
    ↓ hook-socket-server.ts
Session Store (sessions.ts)
    ↓ mapStatusToPhase()
UI Renderer
```

### Key Files

| File | Description |
|------|-------------|
| `src/main/hooks/hook-socket-server.ts` | Unix socket server for hook events |
| `src/main/store/sessions.ts` | Session state management |
| `src/main/constants/sessions.ts` | Session constants (timeouts, question tools) |
| `src/agent-scripts/plexus-hook.ts` | Claude Code hook script |
| `src/agent-scripts/plexus-cursor-hook.ts` | Cursor hook script |
| `src/agent-scripts/plexus-gemini-hook.ts` | Gemini CLI hook script |
| `src/main/inference/profiles/claude-code.ts` | Status inference profiles |

### Question Tool Handling

Question-asking tools bypass permission requests:
- `AskUserQuestion`, `AskFollowupQuestion` (PascalCase)
- `ask_user_question`, `ask_followup_question` (snake_case)

Use `isQuestionTool()` from `constants/sessions.ts` for checking.

### Timeout Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `STALE_THRESHOLD_MS` | 30s | Claude/Gemini session stale detection |
| `CURSOR_INACTIVITY_THRESHOLD_MS` | 5min | Cursor session inactivity threshold |
| `COMPACTING_TIMEOUT_MS` | 90s | Context compaction timeout |
| `PERMISSION_TIMEOUT_MS` | 30s | Permission request socket timeout |

### Status Types

Hook status → Session phase mapping:
- `processing`, `running_tool` → `processing`
- `waiting_for_approval` → `waitingForApproval`
- `waiting_for_input` → `waitingForInput`
- `compacting` → `compacting`
- `ended`, `error` → `ended`

## Testing Strategy

- Test framework: Vitest + React Testing Library
- Run tests: `pnpm test` or `pnpm test:watch`
- Coverage: `pnpm test:coverage`
