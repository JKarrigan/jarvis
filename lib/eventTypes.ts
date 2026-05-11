export type Severity = 'critical' | 'warning' | 'notable' | 'info'

export type EventType =
  | 'combustion_exhaust'
  | 'fuel_vapor'
  | 'outdoor_drift'
  | 'voc_event'
  | 'particulate_spike'
  | 'ventilation_poor'

export interface LocalBaseline {
  noxIndex: number
  tvocIndex: number
  pm02: number
  rco2: number
}

export interface AirQualityEvent {
  id: string
  type: EventType
  severity: Severity
  startTime: Date
  endTime: Date | null
  durationMinutes: number
  peak: {
    noxIndex: number
    tvocIndex: number
    pm02: number
    rco2: number
  }
  baseline: LocalBaseline
  title: string
  description: string
  recommendation: string | null
  confidence: number
  acknowledged: boolean
}

// Thin adapter — subset of DeviceMeasures needed by the detector
export interface AirGradientReading {
  timestamp: Date
  pm01?: number
  pm02: number
  pm10?: number
  rco2: number
  tvocIndex: number
  noxIndex: number
  atmp: number
  rhum: number
}
