import type { AirGradientReading, AirQualityEvent, EventType, LocalBaseline } from './eventTypes'
import {
  SEVERITY_LIMITS, SEVERITY_RANK, classifyEvent, eventDescription, eventRecommendation, eventTitle, severityFor,
} from './eventInfo'

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
 * same id: `${type}_${startMs}` where type is the classification at onset and
 * startMs is the first reading that met the rule. The id is created once at
 * onset and never changes.
 *
 * One incident is one event. There are two independent slots: `sample` (the
 * short-window rules: combustion, fuel vapour, outdoor drift, VOC, particulate)
 * and `vent` (CO₂). While a slot's event is open, any rule of that slot keeps
 * it going, even when the classification changes (a cooking session moves
 * between VOC, fuel vapour and combustion as PM and NOx rise and fall); the
 * event then takes the most serious type it has shown (`moreSerious`). It is
 * closed once nothing has matched for CLEAR_STEPS consecutive minutes, and
 * reopened, of any type, when matching readings return within
 * MERGE_WINDOW_MS of the last matching reading.
 *
 * The CO₂ slot has hysteresis: it opens at SEVERITY_LIMITS.co2Event (1000
 * ppm) but, while open, is kept going by the same 30-minute test at
 * co2Release (900 ppm), so a room hovering around 1000 is one event. Its end
 * is the last reading that met the hold test. Reopening a closed slot needs
 * the opening test again.
 *
 * The rules decide *when* an incident is open. What it is called, how serious
 * it is and the sentences that describe it come from lib/eventInfo.ts
 * (`buildEvent`): severity follows how bad the air got (PM2.5 and CO₂ bands),
 * a VOC rise that also put PM2.5 in the Unhealthy range is a particle event
 * (`classifyEvent`), and VOC alone never alerts. "How bad" is the `sustained`
 * level, the highest 3-minute median of each reading on the minute grid since
 * the incident began (both slots use the 3-minute window), so one stray
 * reading cannot raise the severity; `peak` stays the true maximum and is
 * what the sentences quote.
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
/** Starting value for `peak` and `sustained`: below any reading. */
const NO_LEVEL: Peak = { noxIndex: -Infinity, tvocIndex: -Infinity, pm02: -Infinity, rco2: -Infinity }

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

// ─── Scoring helpers ─────────────────────────────────────────────────────────

function generateId(type: EventType, startMs: number): string {
  return `${type}_${startMs}`
}

export { SEVERITY_RANK }

/**
 * True when type `a` describes an incident more seriously than type `b`,
 * given the incident's judged levels (`sustained`, or `peak` for rows that
 * have none): higher severity first (so a particle spike in
 * the Unhealthy range outranks a VOC rise), then the rule priority order
 * (combustion before fuel vapour before outdoor drift before VOC before
 * particulate).
 */
export function moreSerious(a: EventType, b: EventType, peak: Peak): boolean {
  const sa = SEVERITY_RANK[severityFor(a, peak)]
  const sb = SEVERITY_RANK[severityFor(b, peak)]
  if (sa !== sb) return sa > sb
  return TYPE_ORDER.indexOf(a) < TYPE_ORDER.indexOf(b)
}

/** Stored with the row but no longer shown: it never dropped below 0.5, so it told nobody anything. */
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
const VENT_RULE: Rule = { type: 'ventilation_poor', test: r => r.rco2 >= SEVERITY_LIMITS.co2Event }
/** What keeps an open ventilation event going (hysteresis, see the header). */
const VENT_HOLD_RULE: Rule = { type: 'ventilation_poor', test: r => r.rco2 >= SEVERITY_LIMITS.co2Release }

const TYPE_ORDER: EventType[] = [...SAMPLE_RULES.map(r => r.type), VENT_RULE.type]

type SlotKey = 'sample' | 'vent'
const SLOT_KEYS: readonly SlotKey[] = ['sample', 'vent']

/** Which detector slot an event type belongs to; one incident per slot at a time. */
export function slotOf(type: EventType): SlotKey {
  return type === 'ventilation_poor' ? 'vent' : 'sample'
}

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

interface SlotState {
  id: string
  type: EventType
  startMs: number
  /** Frozen at onset so the baseline never drifts into the event itself. */
  baseline: LocalBaseline
  peak: Peak
  /** Readings with ts < peakUntil have been folded into `peak`. */
  peakUntil: number
  /** Highest 3-minute median of each reading so far (-Infinity until a window is folded). */
  sustained: Peak
  /** Grid minutes up to and including this one have been folded into `sustained`. */
  sustainedUntil: number
  /** Latest reading that satisfied the rule; becomes endTime on close. */
  lastMatchMs: number
  lastEvalMs: number
  clearSteps: number
  /** Non-null once closed; the slot is kept a while so a quick return reopens it. */
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
    for (const key of SLOT_KEYS) {
      const s = this.slots[key]
      if (s && s.closedAt === null) out.push(this.snapshot(s))
    }
    return out
  }

  /**
   * Continues events that were already open in the database after a server
   * restart, once the detector has been primed from recent readings (see
   * `primeDetector`). Matching is per slot, not per type, because an open
   * event's type may have escalated since onset. For each slot the oldest open
   * event wins:
   * - if the replay re-detected the incident, the replayed slot takes over the
   *   stored id, start, baseline, type and peak (and the higher sustained level);
   * - if it did not (the incident began before the replay window, so the
   *   replay's rolling baseline already contains it) and the stored event was
   *   still being updated near the last reading, the slot is restored from the
   *   row with its frozen baseline and keeps being judged against it.
   * Returns the active events afterwards; any other open row is an orphan.
   */
  resume(openEvents: AirQualityEvent[]): AirQualityEvent[] {
    const lastOf = (e: AirQualityEvent) => e.startTime.getTime() + e.durationMinutes * 60_000
    for (const key of SLOT_KEYS) {
      const s = this.slots[key]
      const active = s && s.closedAt === null ? s : null
      if (!active && s && openEvents.some(e => e.id === s.id)) continue // the replay saw it end
      // Rows that cannot be this incident (e.g. left open by a crash days ago)
      // are skipped before picking, so they never hide the real one.
      const stored = openEvents
        .filter(e => e.endTime === null && slotOf(e.type) === key)
        .filter(e => active
          ? lastOf(e) >= active.startMs - MERGE_WINDOW_MS
          : Number.isFinite(this.lastTs) && lastOf(e) >= this.lastTs - WARM_UP_GAP_MS)
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0]
      if (!stored) continue
      const storedStart = stored.startTime.getTime()
      const storedLast = lastOf(stored)
      if (active) {
        // The row's id and start_time are fixed, so the slot takes both.
        active.id = stored.id
        active.startMs = storedStart
        active.baseline = { ...stored.baseline }
        active.peak = maxPeak(active.peak, stored.peak)
        if (stored.sustained) active.sustained = maxPeak(active.sustained, stored.sustained)
        if (moreSerious(stored.type, active.type, judgedOf(active))) active.type = stored.type
        continue
      }
      this.slots[key] = {
        id: stored.id,
        type: stored.type,
        startMs: storedStart,
        baseline: { ...stored.baseline },
        peak: { ...stored.peak },
        peakUntil: this.lastTs + 1,
        sustained: { ...(stored.sustained ?? stored.peak) },
        // The replay has evaluated every grid minute before nextEval.
        sustainedUntil: this.nextEval - STEP_MS,
        lastMatchMs: Math.min(storedLast, this.lastTs),
        lastEvalMs: Math.min(storedLast, this.lastTs),
        clearSteps: 0,
        closedAt: null,
      }
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

    // Drop closed slots that can no longer reopen: a match at t starts no
    // earlier than t - window, so past this point its gap exceeds the merge window.
    for (const key of SLOT_KEYS) {
      const s = this.slots[key]
      if (s && s.closedAt !== null && t - s.closedAt > MERGE_WINDOW_MS + this.windowMs(key)) this.slots[key] = null
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

    // Hysteresis: an open CO₂ event is held by the lower release level.
    const ventRule = this.slots.vent?.closedAt === null ? VENT_HOLD_RULE : VENT_RULE
    const ventMatch = this.persists(this.lowerBound(t - VENT_WINDOW_MS), sEnd, ventRule, baseline, VENT_WINDOW_MS)
    this.step('vent', ventMatch, baseline, t, sEnd, changes)
  }

  private step(key: SlotKey, match: Match | null, baseline: LocalBaseline, t: number, windowEnd: number, changes: DetectorChange[]): void {
    const s = this.slots[key]

    if (match) {
      const startMs = this.buf[match.firstIdx].ts
      // Same incident: still open (whatever the rule that matched now), or
      // matching readings came back within the merge window of the last ones.
      if (s && (s.closedAt === null || startMs - s.lastMatchMs <= MERGE_WINDOW_MS)) {
        const kind: DetectorChangeKind = s.closedAt !== null ? 'reopen' : 'update'
        s.closedAt = null
        s.clearSteps = 0
        s.lastMatchMs = Math.max(s.lastMatchMs, this.buf[match.lastIdx].ts)
        this.foldPeak(s, this.lowerBound(s.peakUntil), windowEnd)
        s.peakUntil = t
        this.foldSustained(s, t)
        s.lastEvalMs = t
        if (moreSerious(match.rule.type, s.type, judgedOf(s))) s.type = match.rule.type
        changes.push({ kind, event: this.snapshot(s) })
        return
      }
      // A new incident (any earlier one in this slot is closed).
      const next: SlotState = {
        id: generateId(match.rule.type, startMs),
        type: match.rule.type,
        startMs,
        baseline: { ...(s?.baseline ?? baseline) },
        peak: { ...NO_LEVEL },
        peakUntil: t,
        sustained: { ...NO_LEVEL },
        // Every minute since the first matching reading: a CO₂ match spans up
        // to 30 minutes and the air may have been worse early in it.
        sustainedUntil: Math.floor(startMs / STEP_MS) * STEP_MS,
        lastMatchMs: this.buf[match.lastIdx].ts,
        lastEvalMs: t,
        clearSteps: 0,
        closedAt: null,
      }
      this.foldPeak(next, match.firstIdx, windowEnd)
      this.foldSustained(next, t)
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

  /**
   * Folds the 3-minute medians of the grid minutes after `sustainedUntil` up
   * to `t` (windows [tau - sample window, tau), like the rules') into
   * `sustained`. Windows with fewer than 5 readings (gaps) are skipped.
   */
  private foldSustained(s: SlotState, t: number): void {
    for (let tau = s.sustainedUntil + STEP_MS; tau <= t; tau += STEP_MS) {
      const from = this.lowerBound(tau - this.sampleWindowMs)
      const to = this.lowerBound(tau)
      if (to - from < 5) continue
      const m = this.rollingBaseline(from, to)
      s.sustained = maxPeak(s.sustained, m)
    }
    s.sustainedUntil = Math.max(s.sustainedUntil, t)
  }

  private close(s: SlotState): AirQualityEvent {
    s.closedAt = s.lastMatchMs
    return this.snapshot(s)
  }

  private closeAll(changes: DetectorChange[]): void {
    for (const key of SLOT_KEYS) {
      const s = this.slots[key]
      if (s && s.closedAt === null) changes.push({ kind: 'close', event: this.close(s) })
      this.slots[key] = null
    }
  }

  private snapshot(s: SlotState): AirQualityEvent {
    const endMs = s.closedAt
    const durationMs = Math.max(0, (endMs ?? Math.max(s.lastEvalMs, s.lastMatchMs)) - s.startMs)
    return buildEvent(s.id, s.type, s.startMs, endMs, durationMs, finitePeak(s.peak), s.baseline, sustainedOf(s))
  }

  private windowMs(key: SlotKey): number {
    return key === 'vent' ? VENT_WINDOW_MS : this.sampleWindowMs
  }
}

/**
 * Assembles an event and its derived fields (final type, severity, text,
 * confidence). `ruleType` is what the rules called it; `classifyEvent` may
 * rename it. Name and severity are judged on `sustained` when there is one
 * (rows from older versions have only `peak`); the sentences quote `peak`.
 */
function buildEvent(
  id: string, ruleType: EventType, startMs: number, endMs: number | null, durationMs: number,
  peak: Peak, baseline: LocalBaseline, sustained: Peak | null | undefined, acknowledged = false,
): AirQualityEvent {
  const judged = sustained ?? peak
  const type = classifyEvent(ruleType, judged, baseline)
  const severity = severityFor(type, judged)
  return {
    id,
    type,
    severity,
    startTime: new Date(startMs),
    endTime: endMs !== null ? new Date(endMs) : null,
    durationMinutes: durationMs / 60000,
    peak: { ...peak },
    ...(sustained ? { sustained: { ...sustained } } : {}),
    baseline: { ...baseline },
    title: eventTitle(type),
    description: eventDescription(type, peak, baseline),
    recommendation: eventRecommendation(type, severity),
    confidence: computeConfidence(type, peak, baseline, durationMs),
    acknowledged,
  }
}

/**
 * The same event as the current rules would write it: type, severity and
 * wording recomputed from its stored type, peak, sustained level and baseline.
 * Used at startup so rows written by older versions read like new ones (they
 * outlive the readings they came from, so they cannot be re-detected); a row
 * without `sustained` is judged on its peak, as it was when written.
 */
export function rederiveEvent(e: AirQualityEvent): AirQualityEvent {
  const built = buildEvent(
    e.id, e.type, e.startTime.getTime(), e.endTime?.getTime() ?? null, e.durationMinutes * 60000,
    e.peak, e.baseline, e.sustained, e.acknowledged,
  )
  return { ...built, durationMinutes: e.durationMinutes }
}

function finitePeak(p: Peak): Peak {
  const f = (v: number) => (Number.isFinite(v) ? v : 0)
  return { noxIndex: f(p.noxIndex), tvocIndex: f(p.tvocIndex), pm02: f(p.pm02), rco2: f(p.rco2) }
}

/**
 * A slot's sustained levels, or null before any 3-minute window was folded.
 * Capped at the peak: the first windows can reach a little before the onset,
 * and a held level is never above the highest reading of the incident.
 */
function sustainedOf(s: SlotState): Peak | null {
  if (!Number.isFinite(s.sustained.pm02)) return null
  const peak = finitePeak(s.peak)
  return {
    noxIndex: Math.min(s.sustained.noxIndex, peak.noxIndex),
    tvocIndex: Math.min(s.sustained.tvocIndex, peak.tvocIndex),
    pm02: Math.min(s.sustained.pm02, peak.pm02),
    rco2: Math.min(s.sustained.rco2, peak.rco2),
  }
}

/** The levels a slot's severity is judged on (see `buildEvent`). */
function judgedOf(s: SlotState): Peak {
  return sustainedOf(s) ?? finitePeak(s.peak)
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

// ─── Restart ─────────────────────────────────────────────────────────────────

/**
 * Builds a live detector after a (re)start: replays recent stored readings
 * silently (their events were already written), then continues the events
 * the database still has open (`EventDetector.resume`). `active` should be
 * written back; every other open row is an orphan to close.
 */
export function primeDetector(
  recentReadings: Iterable<AirGradientReading>,
  openEvents: AirQualityEvent[],
  options?: DetectOptions,
): { detector: EventDetector; active: AirQualityEvent[] } {
  const detector = new EventDetector(options)
  for (const r of recentReadings) detector.push(r)
  return { detector, active: detector.resume(openEvents) }
}

// ─── Cleanup of stored duplicates ────────────────────────────────────────────

/**
 * Collapses stored events that the current detector would have logged as one
 * incident: same slot (CO₂ vs everything else), each one starting no later
 * than MERGE_WINDOW_MS after the group so far ended (overlaps included).
 * Earlier detector versions split one incident into a row per classification
 * change and, before that, a row every 10 s.
 *
 * The oldest row of a group survives with its id and baseline; it takes the
 * latest end (open if the member reaching furthest is open), the maximum
 * peak and sustained level and the most serious type. It stays acknowledged only when a member
 * at least as severe as the result was acknowledged. Severity, text and
 * confidence are recomputed. Returns only what changed.
 */
export function mergeEvents(events: AirQualityEvent[]): { merged: AirQualityEvent[]; removedIds: string[] } {
  const merged: AirQualityEvent[] = []
  const removedIds: string[] = []
  for (const key of SLOT_KEYS) {
    const rows = events
      .filter(e => slotOf(e.type) === key)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id.localeCompare(b.id))
    let group: AirQualityEvent[] = []
    let groupEnd = -Infinity
    const flush = () => {
      if (group.length > 1) {
        const [first, ...rest] = group
        const startMs = first.startTime.getTime()
        const latest = group.reduce((x, y) => (endOf(y) >= endOf(x) ? y : x))
        const lastMs = endOf(latest)
        const open = latest.endTime === null
        const durationMs = Math.max(0, lastMs - startMs)
        const peak = rest.reduce((p, e) => maxPeak(p, e.peak), first.peak)
        // A member without a held level (an older row) counts with its peak;
        // a group of older rows only stays without one.
        const sustained = group.some(e => e.sustained)
          ? rest.reduce((p, e) => maxPeak(p, e.sustained ?? e.peak), first.sustained ?? first.peak)
          : null
        const judged = sustained ?? peak
        let type = first.type
        for (const e of rest) if (moreSerious(e.type, type, judged)) type = e.type
        const event = buildEvent(first.id, type, startMs, open ? null : lastMs, durationMs, peak, first.baseline, sustained)
        // Dismissed only if a dismissed row was already at this severity, so
        // folding in a later, worse part of the incident does not hide it.
        event.acknowledged = group.some(e => e.acknowledged && SEVERITY_RANK[e.severity] >= SEVERITY_RANK[event.severity])
        merged.push(event)
        for (const e of rest) removedIds.push(e.id)
      }
      group = []
      groupEnd = -Infinity
    }
    for (const e of rows) {
      if (group.length > 0 && e.startTime.getTime() > groupEnd + MERGE_WINDOW_MS) flush()
      group.push(e)
      groupEnd = Math.max(groupEnd, endOf(e))
    }
    flush()
  }
  return { merged, removedIds }
}

/** End of an event, or how far an open one has got. */
function endOf(e: AirQualityEvent): number {
  return e.endTime?.getTime() ?? e.startTime.getTime() + e.durationMinutes * 60_000
}
