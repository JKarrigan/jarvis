export interface DeviceMeasures {
  wifi: number
  serialno: string
  firmware?: string
  model?: string
  rco2: number
  pm01: number
  pm02: number
  pm10: number
  /** Firmware-compensated PM2.5 (3.x firmware); preferred over raw pm02 for AQI when present */
  pm02Compensated?: number
  pm003Count: number
  atmp: number
  atmpCompensated?: number
  rhum: number
  rhumCompensated?: number
  tvocIndex: number
  tvocRaw?: number
  noxIndex: number
  noxRaw?: number
  boot?: number
  bootCount?: number
}

export type StatusColor =
  | 'good'
  | 'moderate'
  | 'sensitive'
  | 'unhealthy'
  | 'very-unhealthy'
  | 'hazardous'

export type AqiCategory =
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for Sensitive Groups'
  | 'Unhealthy'
  | 'Very Unhealthy'
  | 'Hazardous'

export interface ComputedAqi {
  value: number
  category: AqiCategory
  color: StatusColor
}

/** The numeric fields history is averaged over (`NUMERIC_FIELDS` in lib/db.ts). */
export type NumericMeasureKey =
  | 'rco2' | 'pm01' | 'pm02' | 'pm10' | 'pm02Compensated' | 'pm003Count'
  | 'atmp' | 'atmpCompensated' | 'rhum' | 'rhumCompensated' | 'tvocIndex' | 'noxIndex' | 'wifi'

/** Per-field extremes of a downsampled bucket (only the fields its rows had). */
export type MeasureExtremes = Partial<Pick<DeviceMeasures, NumericMeasureKey>>

/**
 * One point of history. For ranges longer than 6 h `/api/history` returns
 * downsampled buckets: numeric fields are averages (non-integer), non-numeric
 * fields such as `serialno` are absent, and `min` / `max` hold the extremes
 * of the readings in the bucket. Raw readings never have `min` / `max`.
 */
export interface HistoryEntry {
  timestamp: number
  measures: DeviceMeasures
  min?: MeasureExtremes
  max?: MeasureExtremes
}

export interface DailySummary {
  date: string       // 'YYYY-MM-DD' in the requested IANA time zone
  avgAqi: number
  peakAqi: number
  peakTime: number   // Unix ms timestamp of peak reading
  hoursAbove: number // hours where AQI > 50 (not "Good"), from timestamp deltas capped at 60 s
  color: StatusColor
}

export type { AirQualityEvent, AirGradientReading, EventType, Severity, LocalBaseline } from './eventTypes'

export interface HueLight {
  id: string
  name: string
  on: boolean
  brightness: number   // 0–254
  reachable: boolean
  colorTemp?: number   // mireds (153–500)
  hue?: number         // 0–65535
  saturation?: number  // 0–254
  colormode?: string   // 'hs' | 'ct' | 'xy'
  xy?: [number, number] // CIE 1931 chromaticity, present when the bridge reports it
  type: string
}

export interface HueGroup {
  id: string
  name: string
  type: string         // "Room", "Zone", "LightGroup"
  lightIds: string[]
  on: boolean
  brightness: number   // 0–254
}
