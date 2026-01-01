import { Sheet, SheetContent, SheetTitle } from 'renderer/components/ui/sheet'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { ReplayPlayer } from './replay-player'

interface ReplayDialogProps {
  sessionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReplayDialog({
  sessionId,
  open,
  onOpenChange,
}: ReplayDialogProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl p-0 gap-0 flex flex-col overflow-hidden"
        side="right"
      >
        <VisuallyHidden>
          <SheetTitle>Session Replay</SheetTitle>
        </VisuallyHidden>
        <ReplayPlayer
          onClose={() => onOpenChange(false)}
          sessionId={sessionId}
        />
      </SheetContent>
    </Sheet>
  )
}
