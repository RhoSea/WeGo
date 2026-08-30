export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function formatDate(date: string | null): string {
  if (!date) return ''
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  // Built in UTC and read back in UTC — otherwise a viewer west of UTC sees
  // the day before the one that was typed in.
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)))
}

export function todayISO(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Only http(s) links are ever rendered as anchors. */
export function safeHttpUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

/** One or two letters to ink on a member's medallion. */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1
    ? [...words[0]].filter((c) => /\p{L}|\p{N}/u.test(c)).slice(0, 2)
    : [words[0], words[words.length - 1]].map((w) => [...w][0])
  const result = letters.join('').toUpperCase()
  return result || '?'
}

/** Stable 1..5 tone for a member's medallion, so their colour never moves. */
export function toneFor(id: string): number {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) % 5
  return sum + 1
}
