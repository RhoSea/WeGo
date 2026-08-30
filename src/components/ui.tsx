import { useEffect, useRef, type ReactNode } from 'react'
import { initials, toneFor } from '../lib/format'
import { IconCheck, IconError, IconInfo, IconWarn, PaperPlane } from './art'

/**
 * A bottom sheet on phones, a centred card on desktop. Traps Tab inside itself
 * while open, closes on Escape or a click on the backdrop, and hands focus back
 * to whatever opened it.
 */
export function Sheet(props: { title: string; onClose: () => void; children: ReactNode }) {
  const onClose = useRef(props.onClose)
  onClose.current = props.onClose
  const panel = useRef<HTMLDivElement>(null)
  // Read during render, before the commit moves focus into the sheet — by the
  // time an effect runs, autoFocus has already left and the opener is lost.
  const opener = useRef(document.activeElement as HTMLElement | null)

  useEffect(() => {
    const node = panel.current
    // React's autoFocus has already run; only take focus if nothing claimed it.
    if (node && !node.contains(document.activeElement)) node.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose.current(); return }
      if (e.key !== 'Tab' || !node) return
      const focusable = node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      const back = opener.current
      if (back && document.contains(back)) back.focus()
    }
  }, [])

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose() }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabIndex={-1}
        ref={panel}
      >
        <div className="sheet-head">
          <h2>{props.title}</h2>
          <button className="btn ghost small" onClick={props.onClose}>Close</button>
        </div>
        <hr className="divider" />
        {props.children}
      </div>
    </div>
  )
}

/**
 * Progress as a stretch of route: dashed for what is left, inked for what is
 * done, with the group's plane at the head of the line.
 */
export function ProgressBar({
  value,
  tone,
  thin,
  label,
}: {
  value: number
  tone?: 'good' | 'warn'
  thin?: boolean
  label?: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className={`journey${tone ? ` ${tone}` : ''}${thin ? ' thin' : ''}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span className="track" />
      <span className="fill" style={{ width: `${pct}%` }} />
      <span className="head" style={{ left: `${pct}%` }}>
        <PaperPlane size={thin ? 12 : 15} />
      </span>
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: 'teal' | 'coral' | 'gold' | 'sage'
}) {
  return (
    <div className={`stat${accent ? ` accent-${accent}` : ''}`}>
      <span className="k">{label}</span>
      <span className="v">{value}</span>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

const BANNER_ICONS = {
  info: IconInfo,
  warn: IconWarn,
  error: IconError,
  success: IconCheck,
} as const

export function Banner({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'warn' | 'error' | 'success'
  children: ReactNode
}) {
  const Icon = BANNER_ICONS[kind]
  return (
    <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon />
      <span>{children}</span>
    </div>
  )
}

export function Empty({ art, title, children }: { art?: ReactNode; title?: string; children: ReactNode }) {
  return (
    <div className="empty">
      {art}
      {title ? <p className="empty-title">{title}</p> : null}
      <p>{children}</p>
    </div>
  )
}

/** A member's initials, inked on a medallion in their own steady colour. */
export function Avatar({ name, id, large }: { name: string; id: string; large?: boolean }) {
  return (
    <span className={`avatar tone-${toneFor(id)}${large ? ' lg' : ''}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function LedgerRow({
  name,
  amount,
  hint,
  total,
}: {
  name: ReactNode
  amount: string
  hint?: ReactNode
  total?: boolean
}) {
  return (
    <div className={`ledger-row${total ? ' total' : ''}`}>
      <span className="name">{name}</span>
      <span className="leader" aria-hidden="true" />
      <span className="amount">
        {amount}
        {hint ? <span className="faint small"> {hint}</span> : null}
      </span>
    </div>
  )
}

/** Paper standing in for content that has not arrived yet. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card" aria-hidden="true">
      <div className="skel skel-title" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`skel skel-line${i === lines - 1 ? ' short' : i === 0 ? '' : ' mid'}`} />
      ))}
    </div>
  )
}

const CONFETTI = [
  { dx: '-58px', dy: '-42px', rot: '140deg', color: 'var(--gold)' },
  { dx: '52px', dy: '-48px', rot: '-120deg', color: 'var(--coral)' },
  { dx: '-84px', dy: '10px', rot: '80deg', color: 'var(--teal)' },
  { dx: '80px', dy: '4px', rot: '-70deg', color: 'var(--sky)' },
  { dx: '-34px', dy: '-62px', rot: '200deg', color: 'var(--sage)' },
  { dx: '30px', dy: '-66px', rot: '-190deg', color: 'var(--gold)' },
  { dx: '-70px', dy: '34px', rot: '60deg', color: 'var(--coral)' },
  { dx: '66px', dy: '38px', rot: '-40deg', color: 'var(--teal)' },
]

/** A stamp coming down on the page when something worth celebrating lands. */
export function Celebration({
  title,
  detail,
  onDone,
}: {
  title: string
  detail?: string
  onDone: () => void
}) {
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const timer = setTimeout(() => done.current(), 2800)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="toast-layer">
      <div className="toast" role="status">
        <span className="confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <i
              key={i}
              style={{
                background: c.color,
                animationDelay: `${i * 25}ms`,
                ['--dx' as string]: c.dx,
                ['--dy' as string]: c.dy,
                ['--rot' as string]: c.rot,
              }}
            />
          ))}
        </span>
        <IconCheck size={18} />
        <span>
          {title}
          {detail ? <span className="toast-sub"> {detail}</span> : null}
        </span>
      </div>
    </div>
  )
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = String((err as { message: unknown }).message)
    if (message) return message
  }
  return fallback
}
