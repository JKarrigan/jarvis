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

/**
 * A small, saved outline of an event: averaged buckets of the four detection
 * readings from 15 minutes before it to 15 minutes after, plus when each one
 * peaked and how long the air spent in the health bands. Kept with the event
 * row, so an event still has a chart after its raw readings are pruned.
 */
export interface EventTrace {
  /** Start of the first bucket (ms). */
  from: number
  stepMs: number
  /** One value per bucket; null where there were no readings. */
  pm02: (number | null)[]
  tvocIndex: (number | null)[]
  noxIndex: (number | null)[]
  rco2: (number | null)[]
  /** When each reading was highest during the event (ms). */
  peakAt: { pm02: number; tvocIndex: number; noxIndex: number; rco2: number }
  /** Minutes during the event at or above each band. */
  minutes: { pmSensitive: number; pmUnhealthy: number; pmVeryUnhealthy: number; co2High: number; co2VeryHigh: number }
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
  /**
   * For each reading, the highest 3-minute median during the event: the level
   * the air actually held, so one stray reading does not count. Severity and
   * the name are judged on it; `peak` stays the true maximum for charts and
   * sentences. Rows written by older versions do not have it (then `peak` is used).
   */
  sustained?: {
    noxIndex: number
    tvocIndex: number
    pm02: number
    rco2: number
  } | null
  title: string
  description: string
  recommendation: string | null
  confidence: number
  acknowledged: boolean
  /** Only on a single event read (`getEventById`); lists leave it out. */
  trace?: EventTrace | null
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
