import { MarkdownText } from './MarkdownText'

interface FeedbackPanelProps {
  correct: boolean
  message: string
}

/** Instant, authored feedback. Rendered synchronously after a local check — no network. */
export function FeedbackPanel({ correct, message }: FeedbackPanelProps) {
  return (
    <div
      role="status"
      data-testid="feedback"
      data-correct={correct}
      className={`flex gap-2 rounded-xl p-4 text-sm font-medium ring-1 ${
        correct
          ? 'bg-good/10 text-emerald-800 ring-good/30'
          : 'bg-bad/10 text-rose-800 ring-bad/30'
      }`}
    >
      <span className="font-bold">{correct ? '✓' : '✕'}</span>
      <MarkdownText text={message} />
    </div>
  )
}
