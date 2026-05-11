import type { AirGradientReading, AirQualityEvent, EventType, LocalBaseline, Severity } from './eventTypes'

const SAMPLE_WINDOW_MS = 3 * 60 * 1000
const BASELINE_WINDOW_MS = 30 * 60 * 1000
const MERGE_WINDOW_MS = 15 * 60 * 1000
const WARM_UP_MS = 60 * 60 * 1000
const WARM_UP_GAP_MS = 30 * 60 * 1000
const BASELINE_FREEZE_MS = 2 * 60 * 60 * 1000

// ─── Helpers ────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function rollingMedianBaseline(
  readings: AirGradientReading[],
  beforeMs: number,
  windowMs: number,
): LocalBaseline {
  const window = readings.filter(
    r => r.timestamp.getTime() >= beforeMs - windowMs && r.timestamp.getTime() < beforeMs,
  )
  return {
    noxIndex: median(window.map(r => r.noxIndex)),
    tvocIndex: median(window.map(r => r.tvocIndex)),
    pm02: median(window.map(r => r.pm02)),
    rco2: median(window.map(r => r.rco2)),
  }
}

function persistsFor(
  readings: AirGradientReading[],
  predicateFn: (r: AirGradientReading) => boolean,
  minMs: number,
): boolean {
  // Count-based minimum: the endpoint-exclusive window filter makes the actual span
  // slightly shorter than minMs for regularly-sampled data, so a span check always fails.
  // Assume 10–15 s polling; require at least minMs/15s readings.
  const minCount = Math.max(5, Math.floor(minMs / 15_000))
  if (readings.length < minCount) return false
  const passing = readings.filter(predicateFn).length
  return passing / readings.length >= 0.8
}

function generateId(type: EventType, startTime: Date): string {
  return `${type}_${startTime.getTime()}`
}

function eventTitle(type: EventType): string {
  const titles: Record<EventType, string> = {
    combustion_exhaust: 'Possible combustion exhaust',
    fuel_vapor: 'Fuel vapor detected',
    outdoor_drift: 'Outdoor pollution drift',
    voc_event: 'VOC event',
    particulate_spike: 'Particulate spike',
    ventilation_poor: 'Poor ventilation',
  }
  return titles[type]
}

function eventDescription(type: EventType, peak: AirQualityEvent['peak']): string {
  switch (type) {
    case 'combustion_exhaust':
      return `NOx (${peak.noxIndex}), PM2.5 (${peak.pm02} μg/m³), and VOC rose together — a pattern consistent with combustion products entering the room.`
    case 'fuel_vapor':
      return `VOC index spiked to ${peak.tvocIndex} without a combustion signature, suggesting raw fuel evaporation (leak, spill, or refill).`
    case 'outdoor_drift':
      return `NOx and PM2.5 elevated with flat CO₂ — consistent with exhaust or pollution drifting in from outside.`
    case 'voc_event':
      return `VOC index reached ${peak.tvocIndex}. Common sources: cooking, cleaning products, or off-gassing materials.`
    case 'particulate_spike':
      return `PM2.5 spiked to ${peak.pm02} μg/m³. Possible sources: wildfire smoke, candles, dust, or cooking.`
    case 'ventilation_poor':
      return `CO₂ reached ${peak.rco2} ppm. The room has insufficient fresh air for current occupancy.`
  }
}

function eventRecommendation(type: EventType, severity: Severity): string | null {
  if (type === 'combustion_exhaust') return 'Check stove venting. Open windows. Check your CO detector.'
  if (type === 'fuel_vapor') return 'Check for fuel leaks or spills. Ventilate the room immediately.'
  if (type === 'outdoor_drift') return 'Close windows and set HVAC to recirculate.'
  if (type === 'voc_event' && severity === 'critical') return 'Increase ventilation. Identify the source.'
  if (type === 'particulate_spike' && (severity === 'warning' || severity === 'critical')) return 'Run an air purifier. Check for nearby fires or smoke sources.'
  if (type === 'ventilation_poor') return 'Open a window or increase fresh air intake.'
  return null
}

function defaultSeverity(type: EventType): Severity {
  switch (type) {
    case 'combustion_exhaust': return 'critical'
    case 'fuel_vapor': return 'warning'
    case 'outdoor_drift': return 'warning'
    case 'voc_event': return 'notable'
    case 'particulate_spike': return 'warning'
    case 'ventilation_poor': return 'notable'
  }
}

function escalatedSeverity(
  type: EventType,
  peak: AirQualityEvent['peak'],
  durationMs: number,
): Severity {
  const base = defaultSeverity(type)
  if (base === 'critical') return 'critical'
  if (type === 'fuel_vapor' && peak.tvocIndex >= 400 && durationMs >= 10 * 60 * 1000) return 'critical'
  if (type === 'outdoor_drift' && peak.pm02 >= 35 && durationMs >= 15 * 60 * 1000) return 'critical'
  if (type === 'voc_event' && peak.tvocIndex >= 400) return 'critical'
  if (type === 'particulate_spike' && peak.pm02 >= 55) return 'critical'
  if (type === 'ventilation_poor' && peak.rco2 >= 2000) return 'critical'
  if (type === 'ventilation_poor' && peak.rco2 >= 1500) return 'warning'
  return base
}

function computeConfidence(
  type: EventType,
  peak: AirQualityEvent['peak'],
  baseline: LocalBaseline,
  durationMs: number,
): number {
  let score = 0.5

  // +0.15 for each metric at least 2× its trigger threshold above baseline
  const noxTrigger = Math.max(4, baseline.noxIndex * 3)
  const tvocTrigger = baseline.tvocIndex + 60
  const pm02Trigger = baseline.pm02 + 6
  if (peak.noxIndex >= noxTrigger * 2) score += 0.15
  if (peak.tvocIndex >= tvocTrigger * 1.5) score += 0.15
  if (peak.pm02 >= pm02Trigger * 1.5) score += 0.15

  if (durationMs >= 15 * 60 * 1000) score += 0.10
  if (durationMs >= 30 * 60 * 1000) score += 0.10
  if (type === 'combustion_exhaust' && peak.rco2 >= baseline.rco2 + 150) score += 0.10

  return Math.min(1.0, score)
}

// ─── Event evaluation ────────────────────────────────────────────────────────

function peakValues(readings: AirGradientReading[]): AirQualityEvent['peak'] {
  return {
    noxIndex: Math.max(...readings.map(r => r.noxIndex)),
    tvocIndex: Math.max(...readings.map(r => r.tvocIndex)),
    pm02: Math.max(...readings.map(r => r.pm02)),
    rco2: Math.max(...readings.map(r => r.rco2)),
  }
}

const VENT_WINDOW_MS = 30 * 60 * 1000

function tryDetectWindow(
  window: AirGradientReading[],
  baseline: LocalBaseline,
  allReadings: AirGradientReading[],
  currentMs: number,
): EventType | null {
  const b = baseline

  // NOx threshold is ratio-based: 3× baseline (floor of 4) to handle sensors that sit at 1.
  // Multi-channel correlation (NOx + PM2.5 + VOC together) provides specificity.
  const noxCombustionThreshold = Math.max(4, b.noxIndex * 3)
  const isCombustion = persistsFor(window, r =>
    r.noxIndex >= noxCombustionThreshold &&
    r.pm02 >= 12 &&
    r.pm02 >= b.pm02 + 6 &&
    r.tvocIndex >= b.tvocIndex + 60,
    SAMPLE_WINDOW_MS,
  )
  if (isCombustion) return 'combustion_exhaust'

  const isFuelVapor = persistsFor(window, r =>
    r.tvocIndex >= 250 &&
    r.tvocIndex >= b.tvocIndex + 150 &&
    r.noxIndex < b.noxIndex + 50 &&
    r.pm02 < b.pm02 + 10,
    SAMPLE_WINDOW_MS,
  )
  if (isFuelVapor) return 'fuel_vapor'

  // outdoor_drift: same ratio-based NOx gate, but distinguished from combustion by flat CO₂
  const noxDriftThreshold = Math.max(4, b.noxIndex * 3)
  const isOutdoorDrift = persistsFor(window, r =>
    r.noxIndex >= noxDriftThreshold &&
    r.pm02 >= 10 &&
    r.pm02 >= b.pm02 + 5 &&
    (r.rco2 - b.rco2) < 100,
    SAMPLE_WINDOW_MS,
  )
  if (isOutdoorDrift) return 'outdoor_drift'

  // voc_event: high VOC without combustion signature.
  // No per-sample exclusion — priority order (fuel_vapor checked first) handles disambiguation.
  const isVoc = persistsFor(window, r =>
    r.tvocIndex >= 200 &&
    r.tvocIndex >= b.tvocIndex + 75 &&
    r.noxIndex < b.noxIndex + 30,
    SAMPLE_WINDOW_MS,
  )
  if (isVoc) return 'voc_event'

  const isParticulateSpike = persistsFor(window, r =>
    r.pm02 >= 25 &&
    r.pm02 >= b.pm02 + 15 &&
    r.noxIndex < b.noxIndex + 30,
    SAMPLE_WINDOW_MS,
  )
  if (isParticulateSpike) return 'particulate_spike'

  // ventilation_poor requires 30 min of sustained CO₂ — use the full readings buffer,
  // not the 3-min sample window, or the span check would never be satisfied.
  const ventWindow = allReadings.filter(
    r => r.timestamp.getTime() >= currentMs - VENT_WINDOW_MS && r.timestamp.getTime() < currentMs,
  )
  const isVentilationPoor = persistsFor(ventWindow, r => r.rco2 >= 1000, VENT_WINDOW_MS)
  if (isVentilationPoor) return 'ventilation_poor'

  return null
}

// ─── Merge overlapping / gap events ─────────────────────────────────────────

function mergeEvents(events: AirQualityEvent[], mergeWindowMs: number): AirQualityEvent[] {
  if (events.length === 0) return []
  const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  const merged: AirQualityEvent[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = sorted[i]
    if (curr.type !== prev.type) { merged.push(curr); continue }
    const prevEnd = prev.endTime?.getTime() ?? curr.startTime.getTime()
    if (curr.startTime.getTime() - prevEnd <= mergeWindowMs) {
      // Extend previous event
      prev.endTime = curr.endTime
      prev.durationMinutes = prev.endTime
        ? (prev.endTime.getTime() - prev.startTime.getTime()) / 60000
        : (Date.now() - prev.startTime.getTime()) / 60000
      prev.peak = {
        noxIndex: Math.max(prev.peak.noxIndex, curr.peak.noxIndex),
        tvocIndex: Math.max(prev.peak.tvocIndex, curr.peak.tvocIndex),
        pm02: Math.max(prev.peak.pm02, curr.peak.pm02),
        rco2: Math.max(prev.peak.rco2, curr.peak.rco2),
      }
      prev.confidence = Math.max(prev.confidence, curr.confidence)
      prev.severity = escalatedSeverity(prev.type, prev.peak, prev.durationMinutes * 60000)
    } else {
      merged.push(curr)
    }
  }
  return merged
}

// ─── Warm-up gap detection ───────────────────────────────────────────────────

function findWarmUpCutoff(readings: AirGradientReading[]): number {
  for (let i = readings.length - 1; i > 0; i--) {
    const gap = readings[i].timestamp.getTime() - readings[i - 1].timestamp.getTime()
    if (gap >= WARM_UP_GAP_MS) {
      return readings[i].timestamp.getTime() + WARM_UP_MS
    }
  }
  return 0
}

// ─── CO₂ step-jump filter ────────────────────────────────────────────────────

function filterCo2Jumps(readings: AirGradientReading[]): AirGradientReading[] {
  const skipUntil: number[] = []
  for (let i = 1; i < readings.length; i++) {
    const delta = Math.abs(readings[i].rco2 - readings[i - 1].rco2)
    if (delta > 100) {
      const cutoff = readings[i].timestamp.getTime() + 60 * 60 * 1000
      skipUntil.push(cutoff)
    }
  }
  return readings.map((r, i) => {
    const ts = r.timestamp.getTime()
    const skipped = skipUntil.some(cutoff => ts <= cutoff)
    return skipped ? { ...r, rco2: readings[i > 0 ? i - 1 : 0].rco2 } : r
  })
}

// ─── detectEvents (pure batch) ───────────────────────────────────────────────

export interface DetectOptions {
  sampleWindowMin?: number
  baselineWindowMin?: number
}

export function detectEvents(
  rawReadings: AirGradientReading[],
  options?: DetectOptions,
): AirQualityEvent[] {
  const sampleWindowMs = options?.sampleWindowMin != null ? options.sampleWindowMin * 60 * 1000 : SAMPLE_WINDOW_MS
  const baselineWindowMs = (options?.baselineWindowMin ?? 30) * 60 * 1000

  // Filter samples missing critical fields
  const readings = filterCo2Jumps(
    rawReadings.filter(r => r.noxIndex != null && r.tvocIndex != null && r.pm02 != null),
  )
  if (readings.length === 0) return []

  const warmUpCutoff = findWarmUpCutoff(readings)
  const events: AirQualityEvent[] = []
  let frozenBaseline: LocalBaseline | null = null
  let frozenAt: number | null = null

  // Slide a sample window in 1-minute steps
  const startTs = readings[0].timestamp.getTime()
  const endTs = readings[readings.length - 1].timestamp.getTime()

  let prevType: EventType | null = null
  let eventStart: number | null = null
  let eventBaseline: LocalBaseline | null = null

  const step = 60 * 1000
  for (let t = startTs + baselineWindowMs + sampleWindowMs; t <= endTs + step; t += step) {
    if (t < warmUpCutoff) continue

    const sampleWindow = readings.filter(
      r => r.timestamp.getTime() >= t - sampleWindowMs && r.timestamp.getTime() < t,
    )
    if (sampleWindow.length === 0) continue

    // Baseline freeze logic
    const activeEventDuration = eventStart ? t - eventStart : 0
    let baseline: LocalBaseline
    if (frozenBaseline && frozenAt && activeEventDuration > BASELINE_FREEZE_MS) {
      baseline = frozenBaseline
    } else {
      baseline = rollingMedianBaseline(readings, t - sampleWindowMs, baselineWindowMs)
      if (!frozenBaseline || !eventStart) frozenBaseline = baseline
    }

    const detectedType = tryDetectWindow(sampleWindow, baseline, readings, t)

    if (detectedType && prevType === null) {
      // Event starts
      eventStart = sampleWindow[0].timestamp.getTime()
      eventBaseline = baseline
      frozenBaseline = baseline
      frozenAt = eventStart
      prevType = detectedType
    } else if (detectedType && prevType !== null && detectedType !== prevType) {
      // Type changed — close previous, open new
      if (eventStart !== null && eventBaseline !== null) {
        events.push(buildEvent(prevType, eventStart, t - step, eventBaseline, readings))
      }
      eventStart = sampleWindow[0].timestamp.getTime()
      eventBaseline = baseline
      frozenBaseline = baseline
      frozenAt = eventStart
      prevType = detectedType
    } else if (!detectedType && prevType !== null) {
      // Event ends
      if (eventStart !== null && eventBaseline !== null) {
        events.push(buildEvent(prevType, eventStart, t - step, eventBaseline, readings))
      }
      prevType = null
      eventStart = null
      eventBaseline = null
      frozenBaseline = null
      frozenAt = null
    }
  }

  // Close any still-active event
  if (prevType !== null && eventStart !== null && eventBaseline !== null) {
    events.push(buildEvent(prevType, eventStart, null, eventBaseline, readings))
  }

  return mergeEvents(events, MERGE_WINDOW_MS)
}

function buildEvent(
  type: EventType,
  startMs: number,
  endMs: number | null,
  baseline: LocalBaseline,
  allReadings: AirGradientReading[],
): AirQualityEvent {
  const startTime = new Date(startMs)
  const endTime = endMs ? new Date(endMs) : null
  const durationMs = (endMs ?? Date.now()) - startMs
  const durationMinutes = durationMs / 60000
  const peak = peakValues(
    allReadings.filter(r => r.timestamp.getTime() >= startMs && (endMs === null || r.timestamp.getTime() <= endMs)),
  )
  const severity = escalatedSeverity(type, peak, durationMs)
  const confidence = computeConfidence(type, peak, baseline, durationMs)

  return {
    id: generateId(type, startTime),
    type,
    severity,
    startTime,
    endTime,
    durationMinutes,
    peak,
    baseline,
    title: eventTitle(type),
    description: eventDescription(type, peak),
    recommendation: eventRecommendation(type, severity),
    confidence,
    acknowledged: false,
  }
}

// ─── AirQualityDetector (streaming) ─────────────────────────────────────────

export class AirQualityDetector {
  private buffer: AirGradientReading[] = []
  private activeEvents: Map<string, AirQualityEvent> = new Map()
  private historicalEvents: AirQualityEvent[] = []

  // Maximum buffer: baseline window + sample window + some headroom
  private readonly maxBufferMs = BASELINE_WINDOW_MS + SAMPLE_WINDOW_MS + 5 * 60 * 1000

  ingest(reading: AirGradientReading): AirQualityEvent[] {
    this.buffer.push(reading)
    this.pruneBuffer(reading.timestamp.getTime())

    const detected = detectEvents(this.buffer)
    const newOrUpdated: AirQualityEvent[] = []

    for (const event of detected) {
      const existing = this.activeEvents.get(event.id)
      if (!existing) {
        const withAck = { ...event, acknowledged: this.rehydrateAck(event.id) }
        this.activeEvents.set(event.id, withAck)
        newOrUpdated.push(withAck)
      } else if (existing.endTime === null && event.endTime !== null) {
        // Event just closed
        const closed = { ...existing, endTime: event.endTime, durationMinutes: event.durationMinutes }
        this.activeEvents.delete(event.id)
        this.historicalEvents.push(closed)
        newOrUpdated.push(closed)
      } else if (event.endTime === null) {
        // Still active — update
        const updated = { ...event, acknowledged: existing.acknowledged }
        this.activeEvents.set(event.id, updated)
        newOrUpdated.push(updated)
      }
    }

    // Close events that are no longer in the detected set
    for (const [id, event] of this.activeEvents) {
      if (!detected.find(e => e.id === id) && event.endTime === null) {
        const closed = { ...event, endTime: reading.timestamp }
        this.activeEvents.delete(id)
        this.historicalEvents.push(closed)
        newOrUpdated.push(closed)
      }
    }

    return newOrUpdated
  }

  getActiveEvents(): AirQualityEvent[] {
    return Array.from(this.activeEvents.values())
  }

  getHistory(since: Date): AirQualityEvent[] {
    return this.historicalEvents.filter(e => e.startTime >= since)
  }

  acknowledge(id: string): void {
    const event = this.activeEvents.get(id)
    if (event) this.activeEvents.set(id, { ...event, acknowledged: true })
    const hist = this.historicalEvents.find(e => e.id === id)
    if (hist) hist.acknowledged = true
  }

  loadHistory(readings: AirGradientReading[]): void {
    this.buffer = readings.slice(-Math.ceil(this.maxBufferMs / 10000))
    const events = detectEvents(readings)
    for (const event of events) {
      const withAck = { ...event, acknowledged: this.rehydrateAck(event.id) }
      if (event.endTime === null) {
        this.activeEvents.set(event.id, withAck)
      } else {
        this.historicalEvents.push(withAck)
      }
    }
  }

  private pruneBuffer(nowMs: number): void {
    const cutoff = nowMs - this.maxBufferMs
    this.buffer = this.buffer.filter(r => r.timestamp.getTime() >= cutoff)
  }

  private rehydrateAck(id: string): boolean {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(`aq-ack-${id}`) === '1'
  }
}
