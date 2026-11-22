import { describe, expect, it } from 'vitest'
import {
  classifyEvent, eventKind, eventMinutes, fmtDuration, fmtMetric, fmtMetricWithUnit, isAlert, keyMetrics, severityFor, vocWord,
} from '@/lib/eventInfo'

const base = { noxIndex: 1, tvocIndex: 80, pm02: 2, rco2: 600 }
const peak = (p: Partial<typeof base>) => ({ noxIndex: 1, tvocIndex: 90, pm02: 3, rco2: 650, ...p })

describe('numbers', () => {
  it('drops stray decimals', () => {
    expect(fmtMetric('pm02', 119.17)).toBe('119')
    expect(fmtMetric('pm02', 0.67)).toBe('0.7')
    expect(fmtMetric('pm02', 9.96)).toBe('10')
    expect(fmtMetric('rco2', 1150.67)).toBe('1,151')
    expect(fmtMetric('tvocIndex', 323.83)).toBe('324')
    expect(fmtMetric('noxIndex', NaN)).toBe('—')
    expect(fmtMetricWithUnit('pm02', 49.2)).toBe('49 µg/m³')
    expect(fmtMetricWithUnit('tvocIndex', 477)).toBe('477')
  })

  it('writes durations the way people say them', () => {
    expect(fmtDuration(35.6)).toBe('36 min')
    expect(fmtDuration(120)).toBe('2 h')
    expect(fmtDuration(65)).toBe('1 h 05 min')
    expect(fmtDuration(405.8)).toBe('6 h 46 min')
    expect(fmtDuration(1500)).toBe('1 d 1 h')
    expect(fmtDuration(15895)).toBe('11 d')
    expect(fmtDuration(-3)).toBe('0 min')
  })

  it('counts an open event up to now', () => {
    const start = new Date(1_000_000)
    expect(eventMinutes({ startTime: start, endTime: null, durationMinutes: 5 }, 1_000_000 + 30 * 60_000)).toBe(30)
    expect(eventMinutes({ startTime: start, endTime: new Date(2_000_000), durationMinutes: 5 }, 9e9)).toBe(5)
    expect(eventMinutes({ startTime: start, endTime: null, durationMinutes: 5 }, null)).toBe(5)
  })
})

describe('which readings a row shows', () => {
  it('leads with the reading the event is about and adds only what moved', () => {
    expect(keyMetrics({ type: 'combustion_exhaust', peak: peak({ pm02: 119, tvocIndex: 477, noxIndex: 4, rco2: 1007 }), baseline: base }))
      .toEqual(['pm02', 'tvocIndex', 'noxIndex'])
    expect(keyMetrics({ type: 'fuel_vapor', peak: peak({ tvocIndex: 498, pm02: 36 }), baseline: base })).toEqual(['tvocIndex', 'pm02'])
    expect(keyMetrics({ type: 'voc_event', peak: peak({ tvocIndex: 430, pm02: 6 }), baseline: base })).toEqual(['tvocIndex'])
    expect(keyMetrics({ type: 'particulate_spike', peak: peak({ pm02: 49 }), baseline: base })).toEqual(['pm02'])
  })

  it('shows CO₂ alone for stale air, whatever else was going on', () => {
    expect(keyMetrics({ type: 'ventilation_poor', peak: peak({ pm02: 147, tvocIndex: 500, noxIndex: 11, rco2: 1215 }), baseline: base }))
      .toEqual(['rco2'])
  })
})

describe('kinds and alerts', () => {
  it('treats fuel vapour and VOC as one kind', () => {
    expect(eventKind('fuel_vapor')).toBe('voc')
    expect(eventKind('voc_event')).toBe('voc')
    expect(eventKind('ventilation_poor')).toBe('stale')
  })

  it('renames a VOC rise only when PM2.5 is unhealthy and actually rose', () => {
    expect(classifyEvent('voc_event', peak({ pm02: 60 }), base)).toBe('particulate_spike')
    expect(classifyEvent('fuel_vapor', peak({ pm02: 55.4 }), base)).toBe('fuel_vapor')
    expect(classifyEvent('voc_event', peak({ pm02: 60 }), { ...base, pm02: 50 })).toBe('voc_event')
    expect(classifyEvent('combustion_exhaust', peak({ pm02: 200 }), base)).toBe('combustion_exhaust')
  })

  it('alerts on warnings and criticals only', () => {
    expect(isAlert(severityFor('fuel_vapor', peak({ tvocIndex: 500 })))).toBe(false)
    expect(isAlert(severityFor('particulate_spike', peak({ pm02: 55.5 })))).toBe(true)
    expect(isAlert(severityFor('outdoor_drift', peak({ pm02: 12 })))).toBe(true)
    expect(severityFor('ventilation_poor', peak({ rco2: 1499 }))).toBe('notable')
  })

  it('describes the VOC index in words', () => {
    expect([vocWord(90), vocWord(160), vocWord(300), vocWord(477)])
      .toEqual(['Usual', 'Above usual', 'Well above usual', 'Far above usual'])
  })
})
