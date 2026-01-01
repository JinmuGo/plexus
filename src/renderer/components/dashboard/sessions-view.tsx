import { SessionTile } from './session-tile'
import type { AgentSession } from 'shared/ipc-protocol'

interface SessionsViewProps {
  sessions: AgentSession[]
  outputBuffers: Map<string, string[]>
  selectedSessionId: string | null
  onSelectSession: (sessionId: string) => void
}

export function SessionsView({
  sessions,
  outputBuffers,
  selectedSessionId,
  onSelectSession,
}: SessionsViewProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <div className="text-4xl mb-4">🤖</div>
        <div className="text-lg font-medium">No active agents</div>
        <div className="text-sm mt-2 text-center max-w-xs">
          Start tracking an agent with:
          <code className="block mt-2 bg-muted px-2 py-1 rounded text-xs">
            plexus track claude
          </code>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {sessions.map(session => (
        <SessionTile
          isSelected={session.id === selectedSessionId}
          key={session.id}
          onClick={() => onSelectSession(session.id)}
          recentOutput={outputBuffers.get(session.id) || []}
          session={session}
        />
      ))}
    </div>
  )
}
