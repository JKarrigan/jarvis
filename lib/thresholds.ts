import type { StatusColor } from './types'
import { truncatePm25 } from './aqi'

/**
 * Returns the colour of the first range whose `max` is ≥ value. Missing or
 * non-finite values are reported as the first (best) colour instead of falling
 * through to the worst one.
 */
function clamp(
  value: number,
  ranges: { max: number; color: StatusColor }[]
): StatusColor {
  if (!Number.isFinite(value)) return ranges[0].color
  for (const r of ranges) {
    if (value <= r.max) return r.color
  }
  return ranges[ranges.length - 1].color
}

// Inclusive upper bounds, matching the legend in lib/metrics.ts (≤800 is Good).
export function co2Status(ppm: number): StatusColor {
  return clamp(ppm, [
    { max: 800, color: 'good' },
    { max: 1000, color: 'moderate' },
    { max: 1500, color: 'sensitive' },
    { max: 2000, color: 'unhealthy' },
    { max: Infinity, color: 'very-unhealthy' },
  ])
}

// EPA 2024 PM2.5 categories; truncated to one decimal exactly like computeAqi
// so the card colour and the AQI badge never disagree.
export function pm25Status(ugm3: number): StatusColor {
  return clamp(Number.isFinite(ugm3) ? truncatePm25(ugm3) : ugm3, [
    { max: 9.0, color: 'good' },
    { max: 35.4, color: 'moderate' },
    { max: 55.4, color: 'sensitive' },
    { max: 125.4, color: 'unhealthy' },
    { max: 225.4, color: 'very-unhealthy' },
    { max: Infinity, color: 'hazardous' },
  ])
}

export function pm1Status(ugm3: number): StatusColor {
  return pm25Status(ugm3)
}

// EPA PM10 categories (concentrations truncated to an integer).
export function pm10Status(ugm3: number): StatusColor {
  return clamp(Number.isFinite(ugm3) ? Math.floor(ugm3) : ugm3, [
    { max: 54, color: 'good' },
    { max: 154, color: 'moderate' },
    { max: 254, color: 'sensitive' },
    { max: 354, color: 'unhealthy' },
    { max: 424, color: 'very-unhealthy' },
    { max: Infinity, color: 'hazardous' },
  ])
}

export function tempStatus(celsius: number): StatusColor {
  if (!Number.isFinite(celsius)) return 'good'
  if (celsius >= 15 && celsius <= 25) return 'good'
  if (celsius >= 10 && celsius <= 30) return 'moderate'
  return 'unhealthy'
}

export function humidityStatus(rh: number): StatusColor {
  if (!Number.isFinite(rh)) return 'good'
  if (rh >= 40 && rh <= 60) return 'good'
  if (rh >= 30 && rh <= 70) return 'moderate'
  return 'unhealthy'
}

export function tvocStatus(index: number): StatusColor {
  return clamp(index, [
    { max: 100, color: 'good' },
    { max: 150, color: 'moderate' },
    { max: 200, color: 'sensitive' },
    { max: 250, color: 'unhealthy' },
    { max: Infinity, color: 'very-unhealthy' },
  ])
}

export function noxStatus(index: number): StatusColor {
  return clamp(index, [
    { max: 20, color: 'good' },
    { max: 50, color: 'moderate' },
    { max: 100, color: 'sensitive' },
    { max: 150, color: 'unhealthy' },
    { max: Infinity, color: 'very-unhealthy' },
  ])
}
