import { describe, expect, it } from 'vitest'
import { applyTagChange, hasTag, normalizeTag, parseTagList, tagKey } from '@/lib/photos/tags'

describe('normalizeTag', () => {
  it('trims and collapses whitespace, keeping the case as typed', () => {
    expect(normalizeTag('  Summer   holiday ')).toBe('Summer holiday')
    expect(normalizeTag('Line\nbreak\ttab')).toBe('Line break tab')
  })

  it('rejects empty, non-string and over-long values', () => {
    expect(normalizeTag('')).toBeNull()
    expect(normalizeTag('   ')).toBeNull()
    expect(normalizeTag(42)).toBeNull()
    expect(normalizeTag(null)).toBeNull()
    expect(normalizeTag('x'.repeat(40))).toBe('x'.repeat(40))
    expect(normalizeTag('x'.repeat(41))).toBeNull()
  })

  it('counts characters, not UTF-16 units', () => {
    expect(normalizeTag('🌊'.repeat(40))).toBe('🌊'.repeat(40))
  })

  it('rejects control characters other than whitespace', () => {
    expect(normalizeTag('bad\u0000tag')).toBeNull()
    expect(normalizeTag('bad\u007ftag')).toBeNull()
    expect(normalizeTag('bad\u0085tag')).toBeNull()
  })

  it('normalises to NFC so composed and decomposed forms are one tag', () => {
    expect(normalizeTag('Café')).toBe('Café')
  })
})

describe('parseTagList', () => {
  it('normalises and drops case-insensitive duplicates, keeping the first spelling', () => {
    expect(parseTagList(['Beach', ' beach ', 'Sun'])).toEqual(['Beach', 'Sun'])
  })

  it('rejects non-arrays, invalid entries and too many tags', () => {
    expect(parseTagList('Beach')).toBeNull()
    expect(parseTagList(['ok', ''])).toBeNull()
    expect(parseTagList(['a', 'b', 'c'], 2)).toBeNull()
    expect(parseTagList([])).toEqual([])
  })
})

describe('tag matching and changes', () => {
  it('matches case-insensitively', () => {
    expect(tagKey('Ölberg')).toBe('ölberg')
    expect(hasTag(['Beach'], 'BEACH')).toBe(true)
    expect(hasTag(['Beach'], 'Sun')).toBe(false)
  })

  it('adds without duplicating, removes in any case, and sorts case-insensitively', () => {
    expect(applyTagChange(['beach', 'Zoo'], ['Apple', 'BEACH'])).toEqual(['Apple', 'beach', 'Zoo'])
    expect(applyTagChange(['Beach', 'Sun'], [], ['beach'])).toEqual(['Sun'])
    // A tag in both lists ends up removed (same rule as POST /api/photos/tags).
    expect(applyTagChange(['Sun'], ['Beach'], ['beach'])).toEqual(['Sun'])
  })
})
