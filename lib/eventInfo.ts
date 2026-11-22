import type { StatusColor } from './types'
import type { AirQualityEvent, EventType, LocalBaseline, Severity } from './eventTypes'
import { STATUS_COLORS } from './statusColors'
import { co2Status, noxStatus, pm25Status } from './thresholds'

/**
 * Everything that says what an air-quality event *is*: its name, how serious
 * it is, the sentences that describe it, and how its numbers are written.
 * Pure and client-safe, so the detector (server), the API and every component
 * that shows an event read the same definitions. Nothing here guesses a
 * source: names say what the sensor measured, causes are listed as
 * possibilities.
 */

export type EventMetric = 'pm02' | 'tvocIndex' | 'noxIndex' | 'rco2'

/** The four readings the detector watches, in display order. */
export const EVENT_METRICS: readonly EventMetric[] = ['pm02', 'tvocIndex', 'noxIndex', 'rco2']

export const METRIC_INFO: Record<EventMetric, { label: string; short: string; unit: string }> = {
  pm02: { label: 'PM2.5', short: 'PM2.5', unit: 'µg/m³' },
  tvocIndex: { label: 'VOC index', short: 'VOC', unit: '' },
  noxIndex: { label: 'NOx index', short: 'NOx', unit: '' },
  rco2: { label: 'CO₂', short: 'CO₂', unit: 'ppm' },
}

type Peak = AirQualityEvent['peak']

// ─── Severity ────────────────────────────────────────────────────────────────

/**
 * Severity follows how bad the air got, on the same bands as the tiles
 * (lib/thresholds.ts): PM2.5 in the Unhealthy range is a warning, Very
 * unhealthy is critical; CO₂ over 1500 ppm is a warning, over 2000 critical.
 * The VOC index is relative to the room's own last 24 hours and saturates at
 * 500 during ordinary cooking, so VOC alone never alerts.
 *
 * The detector passes the incident's `sustained` levels (the highest 3-minute
 * median) rather than its single highest readings, so one stray reading cannot
 * raise an alert. Rows from older versions have only their peaks.
 */
export const SEVERITY_LIMITS = {
  /** PM2.5 µg/m³: lower edge of "Sensitive", "Unhealthy" and "Very unhealthy". */
  pmSensitive: 35.5,
  pmWarning: 55.5,
  pmCritical: 125.5,
  /** CO₂ ppm a stale-air event needs to start. */
  co2Event: 1000,
  /** Once it has started, it keeps going until CO₂ is back under this (so a room hovering at 1000 is one event). */
  co2Release: 900,
  co2Warning: 1500,
  co2Critical: 2000,
  /** NOx index where the tile leaves "Good"; with the combustion pattern this is critical. */
  noxCritical: 20,
} as const

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, notable: 1, warning: 2, critical: 3 }

function worse(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b
}

function pmSeverity(pm02: number): Severity {
  if (pm02 >= SEVERITY_LIMITS.pmCritical) return 'critical'
  if (pm02 >= SEVERITY_LIMITS.pmWarning) return 'warning'
  return 'notable'
}

/** How serious an incident of this type with these peaks is. */
export function severityFor(type: EventType, peak: Peak): Severity {
  switch (type) {
    case 'ventilation_poor':
      if (peak.rco2 >= SEVERITY_LIMITS.co2Critical) return 'critical'
      return peak.rco2 >= SEVERITY_LIMITS.co2Warning ? 'warning' : 'notable'
    case 'combustion_exhaust':
      // Particles, VOC and NOx together mean something is burning: never just "notable".
      return worse(worse('warning', pmSeverity(peak.pm02)), peak.noxIndex >= SEVERITY_LIMITS.noxCritical ? 'critical' : 'notable')
    case 'outdoor_drift':
      return worse('warning', pmSeverity(peak.pm02))
    case 'particulate_spike':
      return pmSeverity(peak.pm02)
    case 'voc_event':
    case 'fuel_vapor':
      return 'notable'
  }
}

/**
 * The VOC rules are checked before the particulate rule, so an incident with
 * a lot of smoke and a high VOC index would otherwise be called a VOC rise.
 * Once PM2.5 reaches the Unhealthy range it is a particle event.
 */
export function classifyEvent(type: EventType, peak: Peak, baseline: LocalBaseline): EventType {
  if ((type === 'voc_event' || type === 'fuel_vapor') &&
      peak.pm02 >= SEVERITY_LIMITS.pmWarning && peak.pm02 >= baseline.pm02 + 15) return 'particulate_spike'
  return type
}

/** Severities that put up a banner, a toast and the sidebar badge. */
export function isAlert(severity: Severity): boolean {
  return severity === 'warning' || severity === 'critical'
}

export interface SeverityStyle {
  label: string
  /** Marks and words. */
  hex: string
  /** Bars on tracks and charts (the neutral one is a step darker so it does not shout). */
  barHex: string
  textClass: string
  /** What the app does with an event of this severity. */
  effect: string
}

/** Colours come from lib/statusColors.ts; "notable" is neutral on purpose. */
export const SEVERITY_INFO: Record<Severity, SeverityStyle> = {
  info: { label: 'Notable', hex: '#a1a1aa', barHex: '#71717a', textClass: 'text-zinc-400', effect: 'Logged, no alert' },
  notable: { label: 'Notable', hex: '#a1a1aa', barHex: '#71717a', textClass: 'text-zinc-400', effect: 'Logged, no alert' },
  warning: {
    label: 'Warning', hex: STATUS_COLORS.sensitive.hex, barHex: STATUS_COLORS.sensitive.hex,
    textClass: STATUS_COLORS.sensitive.textClass, effect: 'Banner and a toast',
  },
  critical: {
    label: 'Critical', hex: STATUS_COLORS.unhealthy.hex, barHex: STATUS_COLORS.unhealthy.hex,
    textClass: 'text-red-400', effect: 'Banner and a toast that stays until dismissed',
  },
}

// ─── Kinds ───────────────────────────────────────────────────────────────────

/** What the list filters by. `fuel_vapor` and `voc_event` are one kind: the sensor cannot tell them apart. */
export type EventKind = 'particles' | 'voc' | 'combustion' | 'outdoor' | 'stale'

export interface KindInfo {
  title: string
  /** Short name for filter chips. */
  chip: string
  lead: EventMetric
  signals: string
  rule: string
  causes: string
}

export const KIND_ORDER: readonly EventKind[] = ['particles', 'voc', 'combustion', 'outdoor', 'stale']

export const KIND_INFO: Record<EventKind, KindInfo> = {
  particles: {
    title: 'Particle spike',
    chip: 'Particles',
    lead: 'pm02',
    signals: 'PM2.5 up on its own, or far enough up to matter more than anything else',
    rule: 'PM2.5 at least 25 µg/m³ and 15 above what it was, for 3 minutes. Warning from 55.5 (Unhealthy), critical from 125.5 (Very unhealthy).',
    causes: 'Cooking smoke, burnt food, candles, incense, dust or vacuuming, smoke from outside.',
  },
  voc: {
    title: 'VOC rise',
    chip: 'VOC',
    lead: 'tvocIndex',
    signals: 'VOC index up, NOx flat',
    rule: 'VOC index at least 200 and 75 above what it was, for 3 minutes. Always notable: the index is relative to the room and reaches 500 during ordinary cooking.',
    causes: 'Cooking, alcohol, cleaning products, paint or solvents, new furniture, fuel.',
  },
  combustion: {
    title: 'Combustion fumes',
    chip: 'Combustion',
    lead: 'pm02',
    signals: 'Particles, VOC and NOx up together',
    rule: 'NOx index at least 4 and 3 times what it was, PM2.5 at least 12 µg/m³ and 6 above, VOC 60 above, for 3 minutes. A warning at least; critical with PM2.5 from 125.5 or a NOx index from 20.',
    causes: 'Frying or searing, a gas burner, a wood stove, exhaust from a heater or engine.',
  },
  outdoor: {
    title: 'Outdoor pollution',
    chip: 'Outdoor',
    lead: 'pm02',
    signals: 'NOx and particles up, CO₂ flat',
    rule: 'NOx index at least 4 and 3 times what it was, PM2.5 at least 10 µg/m³ and 5 above, CO₂ less than 100 ppm up, for 3 minutes. A warning at least.',
    causes: 'Traffic or generator exhaust, wildfire smoke, a neighbour\'s chimney.',
  },
  stale: {
    title: 'Stale air',
    chip: 'Stale air',
    lead: 'rco2',
    signals: 'CO₂ high for half an hour',
    rule: 'CO₂ at least 1,000 ppm for 30 minutes. It ends once CO₂ is back under 900 ppm. Warning from 1,500 ppm, critical from 2,000.',
    causes: 'People in a closed room: windows shut and no ventilation running.',
  },
}

const KIND_OF: Record<EventType, EventKind> = {
  particulate_spike: 'particles',
  voc_event: 'voc',
  fuel_vapor: 'voc',
  combustion_exhaust: 'combustion',
  outdoor_drift: 'outdoor',
  ventilation_poor: 'stale',
}

export function eventKind(type: EventType): EventKind {
  return KIND_OF[type]
}

export function eventTitle(type: EventType): string {
  return KIND_INFO[KIND_OF[type]].title
}

export function eventCauses(type: EventType): string {
  return KIND_INFO[KIND_OF[type]].causes
}

/** The reading that defines the event: its chart leads and its number comes first. */
export function leadMetric(type: EventType): EventMetric {
  return KIND_INFO[KIND_OF[type]].lead
}

// ─── Numbers ─────────────────────────────────────────────────────────────────

const thousands = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** A reading as it is shown everywhere: no stray decimals ("119", "0.7", "1,007"). */
export function fmtMetric(metric: EventMetric, value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (metric === 'rco2') return thousands.format(Math.round(value))
  if (metric === 'pm02') return value < 10 ? (Math.round(value * 10) / 10).toString() : Math.round(value).toString()
  return Math.round(value).toString()
}

/** "119 µg/m³", "1,007 ppm", "477". */
export function fmtMetricWithUnit(metric: EventMetric, value: number): string {
  const unit = METRIC_INFO[metric].unit
  return unit ? `${fmtMetric(metric, value)} ${unit}` : fmtMetric(metric, value)
}

function vocRose(peak: Peak, baseline: LocalBaseline): boolean {
  return peak.tvocIndex >= 200 && peak.tvocIndex >= baseline.tvocIndex + 75
}

function noxRose(peak: Peak, baseline: LocalBaseline): boolean {
  return peak.noxIndex >= Math.max(4, baseline.noxIndex * 3)
}

/**
 * The readings worth showing for an event, lead first: the others only when
 * they actually moved. A CO₂ event is about CO₂ alone (its row would otherwise
 * repeat the numbers of whatever else was going on at the time).
 */
export function keyMetrics(event: Pick<AirQualityEvent, 'type' | 'peak' | 'baseline'>): EventMetric[] {
  const lead = leadMetric(event.type)
  if (lead === 'rco2') return ['rco2']
  const { peak, baseline } = event
  const rose: Record<EventMetric, boolean> = {
    pm02: peak.pm02 >= SEVERITY_LIMITS.pmSensitive,
    tvocIndex: vocRose(peak, baseline),
    noxIndex: noxRose(peak, baseline),
    rco2: false,
  }
  return [lead, ...EVENT_METRICS.filter(m => m !== lead && rose[m])]
}

/** Status band of a peak, for the three readings that have health bands. The VOC index has none. */
export function metricStatus(metric: EventMetric, value: number): StatusColor | null {
  if (metric === 'pm02') return pm25Status(value)
  if (metric === 'rco2') return co2Status(value)
  if (metric === 'noxIndex') return noxStatus(value)
  return null
}

/** The VOC index is relative to the room's usual air (100), so it gets words, not a health band. */
export function vocWord(index: number): string {
  if (index >= 400) return 'Far above usual'
  if (index >= 250) return 'Well above usual'
  if (index >= 150) return 'Above usual'
  return 'Usual'
}

// ─── Sentences ───────────────────────────────────────────────────────────────

export function eventDescription(type: EventType, peak: Peak, baseline: LocalBaseline): string {
  const pm = fmtMetricWithUnit('pm02', peak.pm02)
  const voc = fmtMetric('tvocIndex', peak.tvocIndex)
  switch (type) {
    case 'combustion_exhaust':
      return `Particles, VOC and NOx rose together, the pattern of something burning. PM2.5 peaked at ${pm} and the NOx index at ${fmtMetric('noxIndex', peak.noxIndex)}.`
    case 'outdoor_drift':
      return `NOx and particles rose while CO₂ stayed flat, which points to polluted air coming in from outside. PM2.5 peaked at ${pm}.`
    case 'particulate_spike':
      return `PM2.5 rose to ${pm}, from ${fmtMetric('pm02', baseline.pm02)} before.` +
        (vocRose(peak, baseline) ? ` The VOC index rose with it, to ${voc}.` : '')
    case 'voc_event':
    case 'fuel_vapor':
      return `The VOC index rose to ${voc}, from ${fmtMetric('tvocIndex', baseline.tvocIndex)} before.` +
        (peak.pm02 >= SEVERITY_LIMITS.pmSensitive
          ? ` PM2.5 also reached ${pm}.`
          : ' Particles and NOx stayed low, so this was vapour rather than smoke.')
    case 'ventilation_poor':
      return `CO₂ rose above 1,000 ppm and peaked at ${fmtMetricWithUnit('rco2', peak.rco2)}. The room is getting less fresh air than the people in it need.`
  }
}

export function eventRecommendation(type: EventType, severity: Severity): string {
  switch (type) {
    case 'combustion_exhaust':
      return 'Run the range hood or open a window while cooking. If nothing was on the stove, check the heater\'s venting and your CO detector.'
    case 'outdoor_drift':
      return 'Close the windows until it passes.'
    case 'particulate_spike':
      return isAlert(severity)
        ? 'Find the source and air the room, or run an air purifier.'
        : 'Usually cooking, candles or dust. Air the room if it lingers.'
    case 'voc_event':
    case 'fuel_vapor':
      return 'Air the room if it lingers. If you can smell fuel or solvent, find the source.'
    case 'ventilation_poor':
      return 'Open a window or run the ventilation for a few minutes.'
  }
}

// ─── Time ────────────────────────────────────────────────────────────────────

/** "36 min", "6 h 46 min", "2 h", "11 d 1 h". */
export function fmtDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h >= 24) {
    const rest = h % 24
    return rest ? `${Math.floor(h / 24)} d ${rest} h` : `${Math.floor(h / 24)} d`
  }
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`
}

/** How long an event has lasted: stored for a finished one, up to `now` for one still going. */
export function eventMinutes(event: Pick<AirQualityEvent, 'startTime' | 'endTime' | 'durationMinutes'>, now: number | null): number {
  if (event.endTime || now == null) return event.durationMinutes
  return Math.max(event.durationMinutes, (now - event.startTime.getTime()) / 60_000)
}
