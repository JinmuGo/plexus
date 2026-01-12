# Plexus

**AI Agent Observability Platform** - A desktop dashboard to monitor and control multiple AI agents in real-time.

<img width="1552" height="982" alt="image" src="https://github.com/user-attachments/assets/72991f65-d002-4dd0-82fb-d2a325d4614d" />

> **Note**: This project is in early development (v0.1.0).

## Features

- **Real-time Monitoring**: Track multiple AI agent sessions simultaneously
- **Agent Hooks**: Native integration for Claude Code, Cursor, and Gemini CLI
- **Focus Terminal**: Quickly jump to agent terminals requiring attention
- **Session History**: SQLite-based history with cost tracking
- **Notifications**: Discord/Slack webhooks when agents need attention

## Installation

### Prerequisites

- Node.js 20+
- pnpm 10+

### Build from Source

```bash
git clone https://github.com/JinmuGo/plexus.git
cd plexus
pnpm install
pnpm build
```

## Usage

### Agent Hooks

Plexus installs hooks for supported AI agents on first run:

- **Claude Code**: Permission requests and status updates
- **Cursor**: Background agent monitoring
- **Gemini CLI**: Session tracking

Manage hooks in Settings.

### Keyboard Shortcuts

Press `?` to view all shortcuts. Common ones:

- `J/K` - Navigate lists
- `Esc` - Close dialogs

## Development

```bash
pnpm dev        # Development server
pnpm build      # Production build
pnpm test       # Run tests
pnpm typecheck  # Type check
pnpm lint       # Lint
```

## Configuration

Data is stored in:

- macOS: `~/Library/Application Support/plexus/`
- Windows: `%APPDATA%\plexus\`
- Linux: `~/.config/plexus/`

Hooks and logs: `~/.plexus/`

## License

Apache-2.0

## Contributing

Contributions are welcome! Feel free to open issues or submit PRs.
