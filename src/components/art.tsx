/**
 * Original SVG furniture for WeGo: the wordmark, the route illustrations, the
 * navigation icons and the hand-drawn chart marks. Everything here is drawn in
 * code — no stock imagery, no icon dependency — and inherits `currentColor` so
 * a parent can ink it.
 */
import type { CSSProperties } from 'react'

type IconProps = { size?: number; className?: string }

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/* -------------------------------------------------------------------------
   Wordmark
------------------------------------------------------------------------- */

/** WeGo, underlined by a hand-drawn route that takes off as a paper plane. */
export function Wordmark({ label = 'WeGo' }: { label?: string }) {
  return (
    <span className="wordmark">
      <span className="wordmark-word">
        {label}
        <svg
          className="wordmark-route"
          viewBox="0 0 100 12"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M2 8.5C20 11.5 46 11 68 5.5S92 2 98 3.5"
            fill="none"
            stroke="var(--coral)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="0.1 5.4"
          />
        </svg>
      </span>
      <PaperPlane size={15} className="plane" />
    </span>
  )
}

/** A folded paper dart, pointing right. */
export function PaperPlane({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M21.4 3.1 2.8 11c-.7.3-.6 1.3.1 1.5l6.4 1.9 1.9 6.4c.2.7 1.2.8 1.5.1l8-18.6c.3-.6-.3-1.2-1.3-1.2Z"
        fill="currentColor"
      />
      <path d="m10.5 14.9 10-11.3" fill="none" stroke="var(--paper)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/* -------------------------------------------------------------------------
   Route geometry — a quadratic curve sampled by arc length so the plane sits
   exactly where the inked part of the route ends.
------------------------------------------------------------------------- */

interface Pt { x: number; y: number }

export function pointAlongQuad(p0: Pt, p1: Pt, p2: Pt, fraction: number): Pt & { angle: number } {
  const steps = 240
  const pts: Pt[] = []
  const lengths: number[] = [0]
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x
    const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
    pts.push({ x, y })
    if (i > 0) {
      const prev = pts[i - 1]
      lengths.push(lengths[i - 1] + Math.hypot(x - prev.x, y - prev.y))
    }
  }
  const total = lengths[lengths.length - 1]
  const want = total * Math.min(1, Math.max(0, fraction))
  let i = lengths.findIndex((l) => l >= want)
  if (i < 1) i = 1
  const a = pts[i - 1]
  const b = pts[i]
  return { x: b.x, y: b.y, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

/**
 * The trip's funding shown as a journey: a dashed route from home to the
 * destination pin, inked in as far as the group has saved, with the plane at
 * the head of the line.
 */
export function RouteToDestination({
  progress,
  destination,
  label,
}: {
  progress: number
  destination: string
  label: string
}) {
  const p0 = { x: 16, y: 84 }
  const p1 = { x: 140, y: 4 }
  const p2 = { x: 292, y: 46 }
  const f = Math.min(1, Math.max(0, progress))
  const plane = pointAlongQuad(p0, p1, p2, f)
  const d = `M${p0.x} ${p0.y}Q${p1.x} ${p1.y} ${p2.x} ${p2.y}`

  return (
    <svg className="route-art" viewBox="0 0 320 112" role="img" aria-label={label}>
      <circle cx="288" cy="16" r="12" fill="var(--gold)" opacity="0.55" />
      <g fill="var(--sky-wash)" opacity="0.95">
        <ellipse cx="66" cy="26" rx="17" ry="9" />
        <ellipse cx="82" cy="22" rx="12" ry="8" />
        <ellipse cx="212" cy="14" rx="13" ry="7" />
      </g>

      {/* the whole way there */}
      <path d={d} pathLength={100} fill="none" stroke="rgba(38,50,56,.26)" strokeWidth="2" strokeDasharray="3.4 4.6" strokeLinecap="round" />
      {/* the part already funded */}
      <path
        className="route-inked"
        d={d}
        pathLength={100}
        fill="none"
        stroke="var(--teal)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeDasharray={`${f * 100} 100`}
        style={{ ['--ink-len' as string]: `${f * 100}` }}
      />

      {/* home */}
      <circle cx={p0.x} cy={p0.y} r="5" fill="var(--card)" stroke="var(--ink)" strokeWidth="2" />

      {/* destination */}
      <g transform={`translate(${p2.x} ${p2.y})`}>
        <path
          d="M0 2c-5.6 0-10 4.3-10 9.6C-10 18.6 0 28 0 28s10-9.4 10-16.4C10 6.3 5.6 2 0 2Z"
          transform="translate(0 -28)"
          fill="var(--coral)"
          stroke="var(--coral-ink)"
          strokeWidth="1.4"
        />
        <circle cx="0" cy="-16.6" r="3.4" fill="var(--paper)" />
        <ellipse cx="0" cy="3" rx="8" ry="2.4" fill="rgba(38,50,56,.16)" />
      </g>
      <text x={p2.x} y={p2.y + 20} textAnchor="middle" className="route-label">
        {destination}
      </text>

      {/* the group, somewhere along the way */}
      <g transform={`translate(${plane.x} ${plane.y}) rotate(${plane.angle})`} className="route-plane">
        <path d="M-11-7.5 13 0-11 7.5-7 0Z" fill="var(--card)" stroke="var(--teal-ink)" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M-7 0H13" stroke="var(--teal-ink)" strokeWidth="1.2" />
      </g>
    </svg>
  )
}

/* -------------------------------------------------------------------------
   Postmark — the smudged ring that cancels a stamp
------------------------------------------------------------------------- */

export function Postmark({ text = 'WEGO' }: { text?: string }) {
  return (
    <svg className="postmark" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <path id="pm-arc" d="M32 32m-21 0a21 21 0 1 1 42 0a21 21 0 1 1-42 0" />
      </defs>
      <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="46 6" />
      <circle cx="32" cy="32" r="20.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <text className="postmark-text">
        <textPath href="#pm-arc" startOffset="25%" textAnchor="middle">
          {text}
        </textPath>
      </text>
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M13 38h38M13 43h38" />
      </g>
    </svg>
  )
}

/* -------------------------------------------------------------------------
   Hand-drawn chart marks
------------------------------------------------------------------------- */

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash a name into a stable seed so a category's wobble never changes. */
export function seedFrom(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A marker stroke drawn left to right, wobbling the way a hand does. */
function wobblePath(width: number, mid: number, seed: number): string {
  const rand = mulberry32(seed)
  const steps = Math.max(3, Math.round(width / 26))
  let d = `M2 ${(mid + (rand() - 0.5) * 1.4).toFixed(2)}`
  for (let i = 1; i <= steps; i++) {
    const x = 2 + ((width - 4) * i) / steps
    const y = mid + (rand() - 0.5) * 2.2
    const cx = 2 + (width - 4) * ((i - 0.5) / steps)
    const cy = mid + (rand() - 0.5) * 2.6
    d += `Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return d
}

/**
 * One bar of the budget chart, drawn as an ink stroke rather than a rectangle.
 * `fraction` is 0..1 of the row's full width; `ghost` draws the lighter
 * estimate the solid actual sits on top of.
 */
export function SketchBar({
  fraction,
  color,
  seed,
  ghost = false,
}: {
  fraction: number
  color: string
  seed: number
  ghost?: boolean
}) {
  const f = Math.min(1, Math.max(0, fraction))
  const width = Math.max(f * 300, f > 0 ? 8 : 0)
  if (width === 0) return null
  return (
    <svg
      className={`sketch-bar${ghost ? ' ghost' : ''}`}
      viewBox="0 0 300 16"
      preserveAspectRatio="none"
      style={{ width: `${f * 100}%`, color } as CSSProperties}
      aria-hidden="true"
    >
      <path
        d={wobblePath(300, 8, seed)}
        fill="none"
        stroke="currentColor"
        strokeWidth={ghost ? 11 : 9}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity={ghost ? 0.34 : 1}
      />
    </svg>
  )
}

/* -------------------------------------------------------------------------
   Navigation and interface icons
------------------------------------------------------------------------- */

export function IconPlan({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M9 4 3 6.4v13.2L9 17l6 2.6 6-2.4V4l-6 2.4L9 4Z" />
      <path d="M9 4v13M15 6.4v13.2" />
    </svg>
  )
}

export function IconBudget({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M6 3.2v17.6l2-1.4 2 1.4 2-1.4 2 1.4 2-1.4 2 1.4V3.2l-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4Z" />
      <path d="M9.5 9h5M9.5 13h5" />
    </svg>
  )
}

export function IconSavings({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <ellipse cx="12" cy="6.4" rx="7" ry="2.8" />
      <path d="M5 6.4v11.2c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6.4" />
      <path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
    </svg>
  )
}

export function IconMembers({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="9.5" cy="8.5" r="3.4" />
      <path d="M3.4 20c.6-3.4 3.1-5.4 6.1-5.4s5.5 2 6.1 5.4" />
      <path d="M16.4 5.6a3.4 3.4 0 0 1 .3 6.2M18 14.9c2.1.7 3.6 2.5 4.1 5.1" />
    </svg>
  )
}

export function IconPlus({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconPin({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M12 21s7-6.4 7-11.4A7 7 0 0 0 5 9.6C5 14.6 12 21 12 21Z" />
      <circle cx="12" cy="9.6" r="2.6" />
    </svg>
  )
}

export function IconCalendar({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  )
}

export function IconLink({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.4 1.4" />
      <path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.4-1.4" />
    </svg>
  )
}

export function IconInfo({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.4" />
    </svg>
  )
}

export function IconWarn({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="M12 3.8 2.6 20h18.8L12 3.8Z" />
      <path d="M12 10v4.4M12 17.4v.3" />
    </svg>
  )
}

export function IconError({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  )
}

export function IconCheck({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" {...stroke}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  )
}

/* -------------------------------------------------------------------------
   Spot illustrations for empty states
------------------------------------------------------------------------- */

export function ArtSuitcase({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 80 64" aria-hidden="true" className="empty-art">
      <path d="M30 16v-4a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="12" y="16" width="56" height="38" rx="6" fill="var(--card)" stroke="currentColor" strokeWidth="2.4" />
      <path d="M26 16v38M54 16v38" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M12 34h56" stroke="currentColor" strokeWidth="1.6" opacity=".5" />
      <circle cx="40" cy="27" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function ArtReceipt({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 80 64" aria-hidden="true" className="empty-art">
      <path
        d="M22 6h36v50l-5-3-5 3-5-3-5 3-5-3-5 3-6-3V6Z"
        fill="var(--card)"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M31 20h18M31 29h18M31 38h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}

export function ArtJar({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 80 64" aria-hidden="true" className="empty-art">
      <rect x="26" y="6" width="28" height="7" rx="2.4" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M28 13h24v36a7 7 0 0 1-7 7H35a7 7 0 0 1-7-7V13Z" fill="var(--card)" stroke="currentColor" strokeWidth="2.4" />
      <path d="M28 40h24" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" opacity=".7" />
      <circle cx="36" cy="47" r="3.4" fill="var(--gold)" opacity=".9" />
      <circle cx="45" cy="49" r="2.8" fill="var(--gold)" opacity=".75" />
    </svg>
  )
}

export function ArtEnvelope({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 80 64" aria-hidden="true" className="empty-art">
      <rect x="8" y="14" width="64" height="40" rx="5" fill="var(--card)" stroke="currentColor" strokeWidth="2.4" />
      <path d="m8 19 32 21 32-21" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="56" y="6" width="16" height="16" rx="2" fill="var(--coral-wash)" stroke="var(--coral-ink)" strokeWidth="1.8" strokeDasharray="3 2.4" />
    </svg>
  )
}
