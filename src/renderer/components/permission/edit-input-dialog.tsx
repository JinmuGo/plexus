/**
 * Edit Input Dialog Component
 *
 * Dialog for editing tool input before allowing execution.
 * Claude-specific feature that allows modifying the input JSON.
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { AlertTriangle, Check, X } from 'lucide-react'

interface EditInputDialogProps {
  open: boolean
  toolName: string
  toolInput: Record<string, unknown>
  onConfirm: (updatedInput: Record<string, unknown>) => void
  onCancel: () => void
}

export function EditInputDialog({
  open,
  toolName,
  toolInput,
  onConfirm,
  onCancel,
}: EditInputDialogProps) {
  const [inputText, setInputText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isValid, setIsValid] = useState(true)

  // Reset state when dialog opens with new input
  useEffect(() => {
    if (open) {
      setInputText(JSON.stringify(toolInput, null, 2))
      setError(null)
      setIsValid(true)
    }
  }, [open, toolInput])

  // Validate JSON as user types
  const handleInputChange = useCallback((value: string) => {
    setInputText(value)
    try {
      JSON.parse(value)
      setError(null)
      setIsValid(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
      setIsValid(false)
    }
  }, [])

  const handleConfirm = useCallback(() => {
    try {
      const parsed = JSON.parse(inputText) as Record<string, unknown>
      onConfirm(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON')
      setIsValid(false)
    }
  }, [inputText, onConfirm])

  return (
    <Dialog onOpenChange={isOpen => !isOpen && onCancel()} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Tool Input</DialogTitle>
          <DialogDescription>
            Modify the input for{' '}
            <span className="font-mono text-status-approval">{toolName}</span>{' '}
            before allowing execution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <textarea
            className={`w-full h-64 p-3 font-mono text-sm rounded-md border resize-none
              bg-background focus:outline-none focus:ring-2
              ${error ? 'border-destructive focus:ring-destructive/30' : 'border-border focus:ring-ring'}`}
            onChange={e => handleInputChange(e.target.value)}
            placeholder="Enter JSON..."
            spellCheck={false}
            value={inputText}
          />

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>JSON Error: {error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onCancel} variant="outline">
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button disabled={!isValid} onClick={handleConfirm} variant="allow">
            <Check className="h-4 w-4 mr-1" />
            Allow with Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
