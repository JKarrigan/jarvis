import type { AirGradientReading, AirQualityEvent, EventType, LocalBaseline, Severity } from './eventTypes'

/**
 * Air-quality event detection.
 *
 * One incremental state machine (`EventDetector`) is used both live — the
 * server poller pushes every reading into a long-lived instance — and in batch
 * (`detectEvents`, `/api/events/reprocess`), which just replays readings
 * through a fresh instance. Both paths therefore produce identical events.
 *
 * Detection runs on a fixed one-minute grid aligned to wall-clock minutes
 * (not to the first reading in a buffer), so a given event always gets the
 * same id: `${type}_${startMs}` where startMs is the first reading that met the
 * rule. The id is created once at onset; afterwards the same event is updated
 * in place and closed when the rule has stopped matching for CLEAR_STEPS
 * consecutive minutes. A same-type re-trigger within MERGE_WINDOW_MS of the
 * close reopens that event rather than creating a new one.
 *
 * Cost: each reading is a push plus O(log n) binary searches; each one-minute
 * step looks only at its fixed-size windows, so detection is O(n) overall.
 */

const SAMPLE_WINDOW_MS = 3 * 60 * 1000
const BASELINE_WINDOW_MS = 30 * 60 * 1000
const MERGE_WINDOW_MS = 15 * 60 * 1000
const WARM_UP_MS = 60 * 60 * 1000
const WARM_UP_GAP_MS = 30 * 60 * 1000
const VENT_WINDOW_MS = 30 * 60 * 1000
const STEP_MS = 60 * 1000
/**
 * Consecutive non-matching steps before an active event is closed. A one-
 * minute dip fails the 3-minute window for up to four steps, so five keeps a
 * flickering source from closing and reopening its event.
 */
const CLEAR_STEPS = 5
/** Fraction of samples in a window that must satisfy a rule. */
const PERSIST_RATIO = 0.8

/** Exposed for the poller and tests. */
export const DETECTION_TIMING = {
  SAMPLE_WINDOW_MS, BASELINE_WINDOW_MS, MERGE_WINDOW_MS, WARM_UP_MS, WARM_UP_GAP_MS,
  VENT_WINDOW_MS, STEP_MS, CLEAR_STEPS,
} as const

type Peak = AirQualityEvent['peak']

/**
 * Internal, normalised sample.
 *
 * Note: the earlier CO₂ step-jump filter (hold the pre-jump value for an hour
 * after a >100 ppm change) was removed. Holding a value hides real changes in
 * both directions — after a fast drop it kept reporting the high value, so a
 * finished ventilation episode stayed "ongoing" for an hour — and the 30-minute
 * persistence requirement already ignores brief spikes.
 */
interface Sample {
  ts: number
  pm02: number
  rco2: number
  tvocIndex: number
  noxIndex: number
}

// ─── Text / scoring helpers ──────────────────────────────────────────────────

function generateId(type: EventType, startMs: number): string {
  return `${type}_${startMs}`
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

function eventDescription(type: EventType, peak: Peak): string {
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

function escalatedSeverity(type: EventType, peak: Peak, durationMs: number): Severity {
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

function computeConfidence(type: EventType, peak: Peak, baseline: LocalBaseline, durationMs: number): number {
  let score = 0.5

  // +0.15 for each metric well above its trigger threshold relative to baseline
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

// ─── Rules ───────────────────────────────────────────────────────────────────

interface Rule {
  type: EventType
  test: (r: Sample, b: LocalBaseline) => boolean
}

/**
 * Short-window rules, in priority order: the first one that persists wins, so
 * e.g. a VOC spike with low PM is classified as fuel vapour before VOC event.
 * NOx thresholds are ratio-based (3× baseline, floor 4) because the sensor
 * sits at 1 in clean air.
 */
const SAMPLE_RULES: Rule[] = [
  {
    type: 'combustion_exhaust',
    test: (r, b) =>
      r.noxIndex >= Math.max(4, b.noxIndex * 3) &&
      r.pm02 >= 12 &&
      r.pm02 >= b.pm02 + 6 &&
      r.tvocIndex >= b.tvocIndex + 60,
  },
  {
    type: 'fuel_vapor',
    test: (r, b) =>
      r.tvocIndex >= 250 &&
      r.tvocIndex >= b.tvocIndex + 150 &&
      r.noxIndex < b.noxIndex + 50 &&
      r.pm02 < b.pm02 + 10,
  },
  {
    // Same NOx gate as combustion, distinguished by flat CO₂.
    type: 'outdoor_drift',
    test: (r, b) =>
      r.noxIndex >= Math.max(4, b.noxIndex * 3) &&
      r.pm02 >= 10 &&
      r.pm02 >= b.pm02 + 5 &&
      (r.rco2 - b.rco2) < 100,
  },
  {
    type: 'voc_event',
    test: (r, b) =>
      r.tvocIndex >= 200 &&
      r.tvocIndex >= b.tvocIndex + 75 &&
      r.noxIndex < b.noxIndex + 30,
  },
  {
    type: 'particulate_spike',
    test: (r, b) =>
      r.pm02 >= 25 &&
      r.pm02 >= b.pm02 + 15 &&
      r.noxIndex < b.noxIndex + 30,
  },
]

/** Ventilation is judged on its own 30-minute window and can overlap a short-window event. */
const VENT_RULE: Rule = { type: 'ventilation_poor', test: r => r.rco2 >= 1000 }

// ─── Detector ────────────────────────────────────────────────────────────────

export interface DetectOptions {
  sampleWindowMin?: number
  baselineWindowMin?: number
}

export type DetectorChangeKind = 'open' | 'update' | 'close' | 'reopen'

export interface DetectorChange {
  kind: DetectorChangeKind
  event: AirQualityEvent
}

type SlotKey = 'sample' | 'vent'

interface SlotState {
  id: string
  type: EventType
  startMs: number
  /** Frozen at onset so the baseline never drifts into the event itself. */
  baseline: LocalBaseline
  peak: Peak
  /** Readings with ts < peakUntil have been folded into `peak`. */
  peakUntil: number
  /** Latest reading that satisfied the rule; becomes endTime on close. */
  lastMatchMs: number
  lastEvalMs: number
  clearSteps: number
  /** Non-null once closed; the slot is kept for MERGE_WINDOW_MS to allow a reopen. */
  closedAt: number | null
}

interface Match {
  rule: Rule
  firstIdx: number
  lastIdx: number
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function median(values: Float64Array): number {
  const n = values.length
  if (n === 0) return 0
  values.sort()
  const mid = n >> 1
  return n % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid]
}

export class EventDetector {
  private readonly sampleWindowMs: number
  private readonly baselineWindowMs: number
  private readonly keepMs: number

  private buf: Sample[] = []
  private head = 0
  private lastTs = -Infinity
  private segmentStart = NaN
  private warmUpUntil = -Infinity
  private nextEval = NaN

  private slots: Record<SlotKey, SlotState | null> = { sample: null, vent: null }

  constructor(options?: DetectOptions) {
    this.sampleWindowMs = options?.sampleWindowMin != null ? options.sampleWindowMin * 60_000 : SAMPLE_WINDOW_MS
    this.baselineWindowMs = options?.baselineWindowMin != null ? options.baselineWindowMin * 60_000 : BASELINE_WINDOW_MS
    this.keepMs = Math.max(this.sampleWindowMs + this.baselineWindowMs, VENT_WINDOW_MS) + 5 * 60_000
  }

  /** Timestamp of the newest reading accepted, or null before the first one. */
  get lastReadingMs(): number | null {
    return Number.isFinite(this.lastTs) ? this.lastTs : null
  }

  /**
   * Feeds one reading (must be newer than the previous one; older or duplicate
   * readings are ignored) and returns the events that opened, changed, closed
   * or reopened as a result.
   */
  push(reading: AirGradientReading): DetectorChange[] {
    const ts = reading.timestamp.getTime()
    if (!Number.isFinite(ts) || ts <= this.lastTs) return []
    if (!isFiniteNumber(reading.pm02) || !isFiniteNumber(reading.rco2) ||
        !isFiniteNumber(reading.tvocIndex) || !isFiniteNumber(reading.noxIndex)) return []

    const changes: DetectorChange[] = []

    // A long gap means the sensor (or the server) was off: close what was open,
    // drop the stale baseline and give the sensors an hour to warm up.
    if (Number.isFinite(this.lastTs) && ts - this.lastTs >= WARM_UP_GAP_MS) {
      this.closeAll(changes)
      this.buf = []
      this.head = 0
      this.segmentStart = ts
      this.warmUpUntil = ts + WARM_UP_MS
      this.nextEval = Math.floor(ts / STEP_MS) * STEP_MS + STEP_MS
    }
    if (!Number.isFinite(this.segmentStart)) {
      this.segmentStart = ts
      this.nextEval = Math.floor(ts / STEP_MS) * STEP_MS + STEP_MS
    }

    // Evaluate every grid minute up to this reading; windows are [t - w, t) so
    // this reading belongs to later steps.
    const firstEval = this.segmentStart + this.baselineWindowMs + this.sampleWindowMs
    while (this.nextEval <= ts) {
      if (this.nextEval >= firstEval && this.nextEval >= this.warmUpUntil) {
        this.evaluate(this.nextEval, changes)
      }
      this.nextEval += STEP_MS
    }

    this.buf.push({
      ts,
      pm02: reading.pm02,
      rco2: reading.rco2,
      tvocIndex: reading.tvocIndex,
      noxIndex: reading.noxIndex,
    })
    this.lastTs = ts
    this.prune(ts - this.keepMs)
    return changes
  }

  /**
   * Closes active events when no reading has arrived for the warm-up gap
   * (device offline), so they do not stay "ongoing" forever.
   */
  expire(nowMs: number): DetectorChange[] {
    const changes: DetectorChange[] = []
    if (Number.isFinite(this.lastTs) && nowMs - this.lastTs >= WARM_UP_GAP_MS) this.closeAll(changes)
    return changes
  }

  /** Currently open events. */
  activeEvents(): AirQualityEvent[] {
    const out: AirQualityEvent[] = []
    for (const key of ['sample', 'vent'] as const) {
      const s = this.slots[key]
      if (s && s.closedAt === null) out.push(this.snapshot(s))
    }
    return out
  }

  /**
   * Continues events that were already open in the database (e.g. after a
   * server restart, when the detector was primed from recent readings and
   * re-detected the ongoing event with a later start). Returns the active
   * events after adoption.
   */
  adopt(openEvents: AirQualityEvent[]): AirQualityEvent[] {
    for (const key of ['sample', 'vent'] as const) {
      const s = this.slots[key]
      if (!s || s.closedAt !== null) continue
      const match = openEvents
        .filter(e => e.endTime === null && e.type === s.type && e.startTime.getTime() <= s.startMs)
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0]
      if (!match || match.id === s.id) continue
      s.id = match.id
      s.startMs = match.startTime.getTime()
      s.baseline = { ...match.baseline }
      s.peak = maxPeak(s.peak, match.peak)
    }
    return this.activeEvents()
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private prune(cutoff: number): void {
    while (this.head < this.buf.length && this.buf[this.head].ts < cutoff) this.head++
    if (this.head > 1024 && this.head * 2 > this.buf.length) {
      this.buf = this.buf.slice(this.head)
      this.head = 0
    }
  }

  /** First buffer index with ts >= t. */
  private lowerBound(t: number): number {
    let lo = this.head
    let hi = this.buf.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.buf[mid].ts < t) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  private rollingBaseline(from: number, to: number): LocalBaseline {
    const n = Math.max(0, to - from)
    const nox = new Float64Array(n)
    const tvoc = new Float64Array(n)
    const pm = new Float64Array(n)
    const co2 = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const r = this.buf[from + i]
      nox[i] = r.noxIndex
      tvoc[i] = r.tvocIndex
      pm[i] = r.pm02
      co2[i] = r.rco2
    }
    return { noxIndex: median(nox), tvocIndex: median(tvoc), pm02: median(pm), rco2: median(co2) }
  }

  /**
   * Rule persists when the window holds enough samples (assumes 10–15 s
   * polling: at least minMs / 15 s, minimum 5) and ≥ 80 % satisfy it.
   */
  private persists(from: number, to: number, rule: Rule, b: LocalBaseline, minMs: number): Match | null {
    const count = to - from
    const minCount = Math.max(5, Math.floor(minMs / 15_000))
    if (count < minCount) return null
    let passing = 0
    let firstIdx = -1
    let lastIdx = -1
    for (let i = from; i < to; i++) {
      if (rule.test(this.buf[i], b)) {
        passing++
        if (firstIdx < 0) firstIdx = i
        lastIdx = i
      }
    }
    if (passing / count < PERSIST_RATIO) return null
    return { rule, firstIdx, lastIdx }
  }

  private evaluate(t: number, changes: DetectorChange[]): void {
    const sEnd = this.lowerBound(t)
    const sStart = this.lowerBound(t - this.sampleWindowMs)
    if (sEnd === sStart) return // no data in this minute's window (short gap)

    // Drop closed slots whose merge window has passed.
    for (const key of ['sample', 'vent'] as const) {
      const s = this.slots[key]
      if (s && s.closedAt !== null && t - s.closedAt > MERGE_WINDOW_MS) this.slots[key] = null
    }

    // While an event is active (or just closed) keep judging against its
    // pre-event baseline; otherwise use the rolling median before the window.
    const baseline = this.slots.sample?.baseline ??
      this.rollingBaseline(this.lowerBound(t - this.sampleWindowMs - this.baselineWindowMs), sStart)

    let sampleMatch: Match | null = null
    for (const rule of SAMPLE_RULES) {
      sampleMatch = this.persists(sStart, sEnd, rule, baseline, this.sampleWindowMs)
      if (sampleMatch) break
    }
    this.step('sample', sampleMatch, baseline, t, sEnd, changes)

    const ventMatch = this.persists(this.lowerBound(t - VENT_WINDOW_MS), sEnd, VENT_RULE, baseline, VENT_WINDOW_MS)
    this.step('vent', ventMatch, baseline, t, sEnd, changes)
  }

  private step(key: SlotKey, match: Match | null, baseline: LocalBaseline, t: number, windowEnd: number, changes: DetectorChange[]): void {
    const s = this.slots[key]

    if (match) {
      if (s && s.type === match.rule.type) {
        const kind: DetectorChangeKind = s.closedAt !== null ? 'reopen' : 'update'
        s.closedAt = null
        s.clearSteps = 0
        s.lastMatchMs = Math.max(s.lastMatchMs, this.buf[match.lastIdx].ts)
        this.foldPeak(s, this.lowerBound(s.peakUntil), windowEnd)
        s.peakUntil = t
        s.lastEvalMs = t
        changes.push({ kind, event: this.snapshot(s) })
        return
      }
      // Type changed (or nothing tracked): close the old one, open a new one.
      if (s && s.closedAt === null) changes.push({ kind: 'close', event: this.close(s) })
      const startMs = this.buf[match.firstIdx].ts
      const next: SlotState = {
        id: generateId(match.rule.type, startMs),
        type: match.rule.type,
        startMs,
        baseline: { ...(s?.baseline ?? baseline) },
        peak: { noxIndex: -Infinity, tvocIndex: -Infinity, pm02: -Infinity, rco2: -Infinity },
        peakUntil: t,
        lastMatchMs: this.buf[match.lastIdx].ts,
        lastEvalMs: t,
        clearSteps: 0,
        closedAt: null,
      }
      this.foldPeak(next, match.firstIdx, windowEnd)
      this.slots[key] = next
      changes.push({ kind: 'open', event: this.snapshot(next) })
      return
    }

    if (s && s.closedAt === null) {
      s.clearSteps++
      s.lastEvalMs = t
      if (s.clearSteps >= CLEAR_STEPS) changes.push({ kind: 'close', event: this.close(s) })
    }
  }

  private foldPeak(s: SlotState, from: number, to: number): void {
    for (let i = from; i < to; i++) {
      const r = this.buf[i]
      if (r.noxIndex > s.peak.noxIndex) s.peak.noxIndex = r.noxIndex
      if (r.tvocIndex > s.peak.tvocIndex) s.peak.tvocIndex = r.tvocIndex
      if (r.pm02 > s.peak.pm02) s.peak.pm02 = r.pm02
      if (r.rco2 > s.peak.rco2) s.peak.rco2 = r.rco2
    }
  }

  private close(s: SlotState): AirQualityEvent {
    s.closedAt = s.lastMatchMs
    return this.snapshot(s)
  }

  private closeAll(changes: DetectorChange[]): void {
    for (const key of ['sample', 'vent'] as const) {
      const s = this.slots[key]
      if (s && s.closedAt === null) changes.push({ kind: 'close', event: this.close(s) })
      this.slots[key] = null
    }
  }

  private snapshot(s: SlotState): AirQualityEvent {
    const endMs = s.closedAt
    const durationMs = Math.max(0, (endMs ?? Math.max(s.lastEvalMs, s.lastMatchMs)) - s.startMs)
    const peak = finitePeak(s.peak)
    const severity = escalatedSeverity(s.type, peak, durationMs)
    return {
      id: s.id,
      type: s.type,
      severity,
      startTime: new Date(s.startMs),
      endTime: endMs !== null ? new Date(endMs) : null,
      durationMinutes: durationMs / 60000,
      peak,
      baseline: { ...s.baseline },
      title: eventTitle(s.type),
      description: eventDescription(s.type, peak),
      recommendation: eventRecommendation(s.type, severity),
      confidence: computeConfidence(s.type, peak, s.baseline, durationMs),
      acknowledged: false,
    }
  }
}

function finitePeak(p: Peak): Peak {
  const f = (v: number) => (Number.isFinite(v) ? v : 0)
  return { noxIndex: f(p.noxIndex), tvocIndex: f(p.tvocIndex), pm02: f(p.pm02), rco2: f(p.rco2) }
}

function maxPeak(a: Peak, b: Peak): Peak {
  return {
    noxIndex: Math.max(a.noxIndex, b.noxIndex),
    tvocIndex: Math.max(a.tvocIndex, b.tvocIndex),
    pm02: Math.max(a.pm02, b.pm02),
    rco2: Math.max(a.rco2, b.rco2),
  }
}

// ─── Batch ───────────────────────────────────────────────────────────────────

/**
 * Replays readings (ascending by time) through a fresh detector. Returns the
 * final state of every event, oldest first, plus the detector itself so a
 * caller can continue live detection from where the batch ended.
 */
export function runDetector(
  readings: Iterable<AirGradientReading>,
  options?: DetectOptions,
): { events: AirQualityEvent[]; detector: EventDetector; readingsProcessed: number } {
  const detector = new EventDetector(options)
  const byId = new Map<string, AirQualityEvent>()
  let readingsProcessed = 0
  for (const r of readings) {
    readingsProcessed++
    for (const change of detector.push(r)) byId.set(change.event.id, change.event)
  }
  const events = [...byId.values()].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  return { events, detector, readingsProcessed }
}

/** Pure batch detection over ascending readings. */
export function detectEvents(readings: AirGradientReading[], options?: DetectOptions): AirQualityEvent[] {
  return runDetector(readings, options).events
}
