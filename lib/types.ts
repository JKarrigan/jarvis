export interface DeviceMeasures {
  wifi: number
  serialno: string
  firmware?: string
  model?: string
  rco2: number
  pm01: number
  pm02: number
  pm10: number
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

export interface HistoryEntry {
  timestamp: number
  measures: DeviceMeasures
}

export interface DailySummary {
  date: string       // 'YYYY-MM-DD' local time
  avgAqi: number
  peakAqi: number
  peakTime: number   // Unix ms timestamp of peak reading
  hoursAbove: number // hours where AQI > 50 (not "Good")
  color: StatusColor
}

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
