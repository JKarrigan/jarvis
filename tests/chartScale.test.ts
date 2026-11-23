import { describe, expect, it } from 'vitest'
import { chartScale, clipMarks } from '@/lib/chartScale'

/** The scale before this change: min/max over the line and the whole band, 12% padding. */
function fullExtent(vals: number[], lows: number[] | null, highs: number[] | null) {
  let min = Infinity
  let max = -Infinity
  vals.forEach((v, i) => {
    const lo = lows && Number.isFinite(lows[i]) ? lows[i] : v
    const hi = highs && Number.isFinite(highs[i]) ? highs[i] : v
    min = Math.min(min, lo)
    max = Math.max(max, hi)
  })
  const pad = (max - min) * 0.12 || 1
  return { lo: min - pad, hi: max + pad }
}

/** A gently wavy line between ~500 and ~700, like a month of CO2 averages. */
const line = (n: number) => Array.from({ length: n }, (_, i) => 600 + 100 * Math.sin(i / 20))

describe('chartScale', () => {
  it('without a band, pads the line exactly as before', () => {
    const vals = line(300)
    const s = chartScale(vals, null, null)
    expect(s).toEqual({ ...fullExtent(vals, null, null), clippedAbove: [], clippedBelow: [] })
  })

  it('a flat line without a band still gets a one-unit margin', () => {
    const s = chartScale([5, 5, 5], null, null)
    expect(s.lo).toBe(4)
    expect(s.hi).toBe(6)
  })

  it('with fewer than 50 banded points, keeps the whole band in scale', () => {
    const vals = line(40)
    const lows = vals.map(v => v - 20)
    const highs = vals.map(v => v + 20)
    highs[10] = 5000
    lows[30] = -800
    const s = chartScale(vals, lows, highs)
    expect(s.lo).toBeCloseTo(fullExtent(vals, lows, highs).lo)
    expect(s.hi).toBeCloseTo(fullExtent(vals, lows, highs).hi)
    expect(s.clippedAbove).toEqual([])
    expect(s.clippedBelow).toEqual([])
  })

  it('one huge high on 600 points: the top follows the 98th percentile and the spike is clipped', () => {
    const vals = line(600)
    const lows = vals.map(v => v - 30)
    const highs = vals.map(v => v + 30)
    highs[250] = 2001
    const s = chartScale(vals, lows, highs)
    const full = fullExtent(vals, lows, highs)
    expect(s.hi).toBeLessThan(900)
    expect(s.hi).toBeLessThan(full.hi)
    expect(s.hi).toBeGreaterThan(Math.max(...vals))
    // The bottom is not affected by the spike's side.
    expect(s.clippedAbove).toEqual([250])
    expect(s.clippedBelow).toEqual([])
  })

  it('never drops the top below the line, even when the line itself has the rare spike', () => {
    const vals = line(600)
    vals[300] = 1500
    const lows = vals.map(v => v - 30)
    const highs = vals.map(v => v + 30)
    highs[300] = 2000
    const s = chartScale(vals, lows, highs)
    const lineMax = Math.max(...vals)
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(s.lo)
      expect(v).toBeLessThanOrEqual(s.hi)
    }
    // Top before padding is the line's maximum (the 98th percentile of highs is lower):
    // hi - lo = 1.24 (max - min), so max = hi - 0.12 / 1.24 (hi - lo).
    expect(s.hi - (s.hi - s.lo) * 0.12 / 1.24).toBeCloseTo(lineMax, 6)
    expect(s.clippedAbove).toEqual([300])
  })

  it('a band wide everywhere is only clipped for its top 2%', () => {
    const n = 600
    const vals = line(n)
    const lows = vals.map(v => v - 50)
    // Every high far above the line, as on a 1-year chart of daily buckets.
    const highs = vals.map((v, i) => v + 800 + (i % 100) * 4)
    const s = chartScale(vals, lows, highs)
    expect(s.hi).toBeGreaterThan(Math.max(...vals) + 800)
    expect(s.clippedAbove.length).toBeLessThanOrEqual(Math.ceil(n * 0.02))
    expect(s.clippedBelow).toEqual([])
  })

  it('lows: one huge low is clipped below, symmetric to the highs', () => {
    const vals = line(600)
    const lows = vals.map(v => v - 30)
    const highs = vals.map(v => v + 30)
    lows[100] = -900
    const s = chartScale(vals, lows, highs)
    expect(s.lo).toBeGreaterThan(300)
    expect(s.lo).toBeLessThan(Math.min(...vals))
    expect(s.clippedBelow).toEqual([100])
    expect(s.clippedAbove).toEqual([])
  })

  it('a band wide everywhere below is only clipped for its bottom 2%', () => {
    const n = 600
    const vals = line(n)
    const lows = vals.map((v, i) => v - 300 - (i % 100) * 2)
    const highs = vals.map(v => v + 20)
    const s = chartScale(vals, lows, highs)
    expect(s.lo).toBeLessThan(Math.min(...vals) - 300)
    expect(s.clippedBelow.length).toBeLessThanOrEqual(Math.ceil(n * 0.02))
  })

  it('ignores non-finite band values', () => {
    const vals = line(600)
    const lows = vals.map(v => v - 30)
    const highs = vals.map(v => v + 30)
    const clean = chartScale(vals, lows, highs)
    highs[5] = NaN
    highs[6] = Infinity
    lows[7] = -Infinity
    lows[8] = NaN
    const s = chartScale(vals, lows, highs)
    expect(Number.isFinite(s.lo)).toBe(true)
    expect(Number.isFinite(s.hi)).toBe(true)
    expect(s.hi).toBeCloseTo(clean.hi, 0)
    expect(s.lo).toBeCloseTo(clean.lo, 0)
    expect(s.clippedAbove).toEqual([])
    expect(s.clippedBelow).toEqual([])
  })

  it('counts only finite band values towards the 50-point threshold', () => {
    const vals = line(600)
    // 40 banded points, the rest NaN: the whole band is in scale.
    const highs = vals.map((v, i) => i < 40 ? v + 10 : NaN)
    const lows = vals.map((v, i) => i < 40 ? v - 10 : NaN)
    highs[20] = 3000
    const s = chartScale(vals, lows, highs)
    expect(s.hi).toBeGreaterThan(3000)
    expect(s.clippedAbove).toEqual([])
  })
})

describe('clipMarks', () => {
  const edges = [0, 5, 9, 7, 0, 0, 4, 8, 6, 3]

  it('puts one mark per continuous run on its most extreme point', () => {
    expect(clipMarks([1, 2, 3, 6, 7, 8], edges, [[0, 9]], 'above')).toEqual([
      { index: 2, value: 9 },
      { index: 7, value: 8 },
    ])
    expect(clipMarks([1, 2, 3], edges, [[0, 9]], 'below')).toEqual([{ index: 1, value: 5 }])
  })

  it('does not join runs across a gap in the data', () => {
    expect(clipMarks([1, 2, 3], edges, [[0, 1], [2, 9]], 'above')).toEqual([
      { index: 1, value: 5 },
      { index: 2, value: 9 },
    ])
  })

  it('returns nothing when nothing is clipped', () => {
    expect(clipMarks([], edges, [[0, 9]], 'above')).toEqual([])
  })
})
