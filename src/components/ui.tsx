import { useEffect, type ReactNode } from 'react'

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose() }}
    >
      <div className="sheet">
        <div className="row between">
          <h2>{props.title}</h2>
          <button className="btn ghost small" onClick={props.onClose}>Close</button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

export function ProgressBar({ value, tone }: { value: number; tone?: 'good' | 'warn' }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className="bar"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className={tone} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
      {hint ? <span className="small muted">{hint}</span> : null}
    </div>
  )
}

export function Banner({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  return <div className={`banner ${kind}`}>{children}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = String((err as { message: unknown }).message)
    if (message) return message
  }
  return fallback
}
