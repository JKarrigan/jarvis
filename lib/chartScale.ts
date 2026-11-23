/**
 * Y-scale for the history charts (`app/_components/Chart.tsx`).
 *
 * The scale covers the line completely and the min-to-max band's typical
 * extent: the 98th percentile of the band's highs and the 2nd percentile of
 * its lows. One rare extreme (a two-minute spike on a 30-day chart) would
 * otherwise stretch the axis and flatten everything else. The parts of the
 * band beyond the scale are clipped and marked by the chart. Pure, so it is
 * unit-tested without React.
 */

/** Fraction of the data range added above and below. */
export const SCALE_PAD = 0.12
/** Percentile of the band's highs the top follows (and 1 minus it for the lows). */
export const BAND_PERCENTILE = 0.98
/** Below this many banded points the whole band is part of the scale. */
export const MIN_BANDED_FOR_CLIP = 50

export interface ChartScale {
  /** Bottom and top of the y-axis, padding included. */
  lo: number
  hi: number
  /** Indices whose band edge lies beyond the scale, ascending. */
  clippedAbove: number[]
  clippedBelow: number[]
}

/** Linear-interpolated percentile of an ascending array (p in 0..1). */
function percentile(sorted: number[], p: number): number {
  const pos = p * (sorted.length - 1)
  const a = Math.floor(pos)
  const b = Math.ceil(pos)
  return sorted[a] + (sorted[b] - sorted[a]) * (pos - a)
}

/** The scale's edge for one side of the band: full extent when few points are banded, else the percentile. */
function bandEdge(edges: number[] | null, p: number, side: 'top' | 'bottom'): number {
  const finite: number[] = []
  if (edges) for (const v of edges) if (Number.isFinite(v)) finite.push(v)
  if (finite.length === 0) return side === 'top' ? -Infinity : Infinity
  finite.sort((a, b) => a - b)
  if (finite.length < MIN_BANDED_FOR_CLIP) return side === 'top' ? finite[finite.length - 1] : finite[0]
  return percentile(finite, p)
}

/**
 * `vals` is the line (finite values); `lows` / `highs` are the band edges
 * aligned with it (NaN where a point has none), or null without a band.
 */
export function chartScale(vals: number[], lows: number[] | null, highs: number[] | null): ChartScale {
  // Loops, not Math.min(...vals): spreading tens of thousands of values throws RangeError.
  let min = Infinity
  let max = -Infinity
  for (const v of vals) {
    if (v < min) min = v
    if (v > max) max = v
  }
  // The line is never clipped; the band only as far as its typical extent.
  max = Math.max(max, bandEdge(highs, BAND_PERCENTILE, 'top'))
  min = Math.min(min, bandEdge(lows, 1 - BAND_PERCENTILE, 'bottom'))
  const pad = (max - min) * SCALE_PAD || 1
  const lo = min - pad
  const hi = max + pad

  const clippedAbove: number[] = []
  const clippedBelow: number[] = []
  if (highs) highs.forEach((v, i) => { if (Number.isFinite(v) && v > hi) clippedAbove.push(i) })
  if (lows) lows.forEach((v, i) => { if (Number.isFinite(v) && v < lo) clippedBelow.push(i) })
  return { lo, hi, clippedAbove, clippedBelow }
}

export interface ClipMark {
  /** Index of the run's most extreme point (where the caret goes). */
  index: number
  /** Its true band value. */
  value: number
}

/**
 * One mark per continuous run of clipped indices: consecutive indices within
 * the same `segments` range (runs never cross a gap in the data), placed on
 * the run's highest (`above`) or lowest (`below`) band value.
 */
export function clipMarks(
  indices: number[],
  edges: number[],
  segments: [number, number][],
  side: 'above' | 'below',
): ClipMark[] {
  const marks: ClipMark[] = []
  const more = (a: number, b: number) => side === 'above' ? a > b : a < b
  let seg = 0
  let prev = -2
  for (const i of indices) {
    while (seg < segments.length - 1 && i > segments[seg][1]) seg++
    const sameRun = i === prev + 1 && i >= segments[seg][0] && prev >= segments[seg][0]
    if (sameRun) {
      const last = marks[marks.length - 1]
      if (more(edges[i], last.value)) { last.index = i; last.value = edges[i] }
    } else {
      marks.push({ index: i, value: edges[i] })
    }
    prev = i
  }
  return marks
}
