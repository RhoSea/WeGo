import { describe, expect, it } from 'vitest'
import { initials, toneFor } from './format'

describe('initials', () => {
  it('takes the first and last word of a full name', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('Jean  Paul  Sartre')).toBe('JS')
  })

  it('takes two letters from a single word', () => {
    expect(initials('mira')).toBe('MI')
    expect(initials('K')).toBe('K')
  })

  it('splits the punctuation an email-derived name arrives with', () => {
    expect(initials('sam.okonkwo')).toBe('SO')
    expect(initials('lena-marie')).toBe('LM')
  })

  it('falls back rather than rendering nothing', () => {
    expect(initials('   ')).toBe('?')
    expect(initials('!!')).toBe('?')
  })

  it('keeps non-latin names intact', () => {
    expect(initials('Yuki Tanaka')).toBe('YT')
    expect(initials('Ólafur')).toBe('ÓL')
  })
})

describe('toneFor', () => {
  it('is stable and stays inside the five medallion tones', () => {
    const id = '6f1c2b7e-1111-2222-3333-444455556666'
    expect(toneFor(id)).toBe(toneFor(id))
    for (const value of ['a', 'bb', id, '']) {
      expect(toneFor(value)).toBeGreaterThanOrEqual(1)
      expect(toneFor(value)).toBeLessThanOrEqual(5)
    }
  })
})
