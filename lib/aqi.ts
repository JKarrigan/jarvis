import type { AqiCategory, ComputedAqi, StatusColor } from './types'

interface Breakpoint {
  cLo: number
  cHi: number
  aqiLo: number
  aqiHi: number
  category: AqiCategory
  color: StatusColor
}

// US EPA PM2.5 breakpoints as revised in February 2024 (89 FR 16202): the
// Good ceiling dropped to 9.0 μg/m³ and the two Hazardous rows were merged
// into a single 225.5–325.4 → 301–500 segment.
const BREAKPOINTS: Breakpoint[] = [
  { cLo: 0.0, cHi: 9.0, aqiLo: 0, aqiHi: 50, category: 'Good', color: 'good' },
  { cLo: 9.1, cHi: 35.4, aqiLo: 51, aqiHi: 100, category: 'Moderate', color: 'moderate' },
  { cLo: 35.5, cHi: 55.4, aqiLo: 101, aqiHi: 150, category: 'Unhealthy for Sensitive Groups', color: 'sensitive' },
  { cLo: 55.5, cHi: 125.4, aqiLo: 151, aqiHi: 200, category: 'Unhealthy', color: 'unhealthy' },
  { cLo: 125.5, cHi: 225.4, aqiLo: 201, aqiHi: 300, category: 'Very Unhealthy', color: 'very-unhealthy' },
  { cLo: 225.5, cHi: 325.4, aqiLo: 301, aqiHi: 500, category: 'Hazardous', color: 'hazardous' },
]

const TOP = BREAKPOINTS[BREAKPOINTS.length - 1]

/** EPA requires truncating (not rounding) PM2.5 to one decimal before lookup. */
export function truncatePm25(n: number): number {
  // The epsilon keeps values like 12.3 (stored as 12.29999…) from truncating to 12.2.
  return Math.floor(n * 10 + 1e-9) / 10
}

export function computeAqi(pm25: number): ComputedAqi {
  if (!Number.isFinite(pm25)) return { value: 0, category: 'Good', color: 'good' }
  const c = truncatePm25(pm25)

  if (c <= 0) return { value: 0, category: 'Good', color: 'good' }
  // Beyond the index: report the cap rather than extrapolating past 500.
  if (c > TOP.cHi) return { value: 500, category: 'Hazardous', color: 'hazardous' }

  const bp = BREAKPOINTS.find(b => c >= b.cLo && c <= b.cHi) ?? BREAKPOINTS[0]
  const value = Math.round(
    ((bp.aqiHi - bp.aqiLo) / (bp.cHi - bp.cLo)) * (c - bp.cLo) + bp.aqiLo
  )

  return { value, category: bp.category, color: bp.color }
}

export function aqiToColor(aqi: number): StatusColor {
  if (aqi <= 50)  return 'good'
  if (aqi <= 100) return 'moderate'
  if (aqi <= 150) return 'sensitive'
  if (aqi <= 200) return 'unhealthy'
  if (aqi <= 300) return 'very-unhealthy'
  return 'hazardous'
}
