import type { AqiCategory, ComputedAqi, StatusColor } from './types'

interface Breakpoint {
  cLo: number
  cHi: number
  aqiLo: number
  aqiHi: number
  category: AqiCategory
  color: StatusColor
}

const BREAKPOINTS: Breakpoint[] = [
  { cLo: 0.0, cHi: 9.0, aqiLo: 0, aqiHi: 50, category: 'Good', color: 'good' },
  { cLo: 9.1, cHi: 35.4, aqiLo: 51, aqiHi: 100, category: 'Moderate', color: 'moderate' },
  { cLo: 35.5, cHi: 55.4, aqiLo: 101, aqiHi: 150, category: 'Unhealthy for Sensitive Groups', color: 'sensitive' },
  { cLo: 55.5, cHi: 125.4, aqiLo: 151, aqiHi: 200, category: 'Unhealthy', color: 'unhealthy' },
  { cLo: 125.5, cHi: 225.4, aqiLo: 201, aqiHi: 300, category: 'Very Unhealthy', color: 'very-unhealthy' },
  { cLo: 225.5, cHi: 325.4, aqiLo: 301, aqiHi: 400, category: 'Hazardous', color: 'hazardous' },
  { cLo: 325.5, cHi: 500.4, aqiLo: 401, aqiHi: 500, category: 'Hazardous', color: 'hazardous' },
]

// EPA requires truncating to 1 decimal place (not rounding) before lookup
function truncate1(n: number): number {
  return Math.floor(n * 10) / 10
}

export function computeAqi(pm25: number): ComputedAqi {
  const c = truncate1(pm25)

  if (c < 0) return { value: 0, category: 'Good', color: 'good' }
  if (c > 500.4) return { value: 500, category: 'Hazardous', color: 'hazardous' }

  const bp = BREAKPOINTS.find(b => c >= b.cLo && c <= b.cHi)
  if (!bp) return { value: 0, category: 'Good', color: 'good' }

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
