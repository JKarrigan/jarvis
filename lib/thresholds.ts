import type { StatusColor } from './types'

function clamp(
  value: number,
  ranges: { max: number; color: StatusColor }[]
): StatusColor {
  for (const r of ranges) {
    if (value <= r.max) return r.color
  }
  return ranges[ranges.length - 1].color
}

export function co2Status(ppm: number): StatusColor {
  return clamp(ppm, [
    { max: 799, color: 'good' },
    { max: 1000, color: 'moderate' },
    { max: 1500, color: 'sensitive' },
    { max: 2000, color: 'unhealthy' },
    { max: Infinity, color: 'very-unhealthy' },
  ])
}

export function pm25Status(ugm3: number): StatusColor {
  return clamp(ugm3, [
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

export function pm10Status(ugm3: number): StatusColor {
  return clamp(ugm3, [
    { max: 53, color: 'good' },
    { max: 154, color: 'moderate' },
    { max: 254, color: 'sensitive' },
    { max: 354, color: 'unhealthy' },
    { max: Infinity, color: 'very-unhealthy' },
  ])
}

export function tempStatus(celsius: number): StatusColor {
  if (celsius >= 15 && celsius <= 25) return 'good'
  if (celsius >= 10 && celsius <= 30) return 'moderate'
  return 'unhealthy'
}

export function humidityStatus(rh: number): StatusColor {
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
