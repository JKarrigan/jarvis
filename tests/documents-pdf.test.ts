import { describe, expect, it } from 'vitest'
import {
  MAX_POSITIONS, POSITIONS_KEY, boundedFactor, defaultZoom, isZoomValue, loadPosition, parsePageInput, positionKey,
  savePosition, stepZoom, wheelFactor,
} from '@/app/_components/media/documents/pdf/model'

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    data,
  }
}

describe('pdf reader zoom', () => {
  it('steps through the zoom ladder and stops at 25 % / 400 %', () => {
    expect(stepZoom(1, 1)).toBe(1.1)
    expect(stepZoom(1, -1)).toBe(0.9)
    expect(stepZoom(0.65, 1)).toBe(0.67)
    expect(stepZoom(0.65, -1)).toBe(0.5)
    expect(stepZoom(4, 1)).toBe(4)
    expect(stepZoom(0.25, -1)).toBe(0.25)
  })
  it('bounds pinch / wheel factors to 25–400 %', () => {
    expect(boundedFactor(2, 3)).toBeCloseTo(2)
    expect(boundedFactor(0.5, 0.1)).toBeCloseTo(0.5)
    expect(boundedFactor(1, 1.2)).toBeCloseTo(1.2)
    expect(boundedFactor(1, Number.NaN)).toBe(1)
  })
  it('wheel up zooms in, down zooms out, per-event steps are capped', () => {
    expect(wheelFactor(-100, 0)).toBeGreaterThan(1)
    expect(wheelFactor(100, 0)).toBeLessThan(1)
    expect(wheelFactor(10_000, 0)).toBeCloseTo(wheelFactor(60, 0))
    expect(wheelFactor(3, 1)).toBeCloseTo(wheelFactor(60, 0))
  })
  it('opens at Fit width on phones and min(Fit page, 100 %) on desktop', () => {
    expect(defaultZoom(true, 0.5)).toBe('page-width')
    expect(defaultZoom(false, 0.8)).toBe('page-fit')
    expect(defaultZoom(false, 1.6)).toBe('1')
  })
  it('accepts presets and in-range numeric zoom values only', () => {
    expect(isZoomValue('page-width')).toBe(true)
    expect(isZoomValue('1.5')).toBe(true)
    expect(isZoomValue('auto')).toBe(false)
    expect(isZoomValue('9')).toBe(false)
    expect(isZoomValue('')).toBe(false)
  })
})

describe('pdf reader page field', () => {
  it('takes whole page numbers within the document', () => {
    expect(parsePageInput(' 12 ', 120)).toBe(12)
    expect(parsePageInput('0', 120)).toBeNull()
    expect(parsePageInput('121', 120)).toBeNull()
    expect(parsePageInput('3.5', 120)).toBeNull()
    expect(parsePageInput('abc', 120)).toBeNull()
  })
})

describe('pdf reader remembered position', () => {
  it('round-trips per path + modified, newest first, clamped to the page count', () => {
    const store = memoryStore()
    const key = positionKey('Taxes/2025/return.pdf', 1000)
    savePosition(store, key, { page: 40, zoom: '1.25', rotation: 90 }, 1)
    expect(loadPosition(store, key, 120)).toEqual({ page: 40, zoom: '1.25', rotation: 90 })
    expect(loadPosition(store, key, 12)?.page).toBe(12)
    // A replaced file (new mtime) starts afresh.
    expect(loadPosition(store, positionKey('Taxes/2025/return.pdf', 2000), 120)).toBeNull()
    savePosition(store, positionKey('b.pdf', 1), { page: 2, zoom: 'page-fit', rotation: 0 }, 2)
    const raw = JSON.parse(store.data.get(POSITIONS_KEY) ?? '[]') as { k: string }[]
    expect(raw[0].k).toBe(positionKey('b.pdf', 1))
  })
  it('keeps at most MAX_POSITIONS and ignores junk', () => {
    const store = memoryStore()
    for (let i = 0; i < MAX_POSITIONS + 5; i++) savePosition(store, positionKey(`f${i}.pdf`, 1), { page: 1, zoom: '1', rotation: 0 }, i)
    expect((JSON.parse(store.data.get(POSITIONS_KEY) ?? '[]') as unknown[]).length).toBe(MAX_POSITIONS)
    const junk = memoryStore({ [POSITIONS_KEY]: '{not json' })
    expect(loadPosition(junk, 'x', 3)).toBeNull()
    const bad = memoryStore({ [POSITIONS_KEY]: JSON.stringify([{ k: 'x', page: 'two', zoom: '1' }, { k: 'y', page: 2, zoom: 'huge' }]) })
    expect(loadPosition(bad, 'x', 3)).toBeNull()
    expect(loadPosition(bad, 'y', 3)).toBeNull()
    expect(loadPosition(null, 'x', 3)).toBeNull()
  })
})
