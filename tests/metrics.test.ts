import { describe, expect, it } from 'vitest'
import { fmtReading } from '@/lib/metrics'
import { pageKey } from '@/app/_components/air/motion'

describe('fmtReading', () => {
  it('rounds the device averages and keeps the thousands separator', () => {
    expect(fmtReading(1150.67, 0)).toBe('1,151')
    expect(fmtReading(323.83, 0)).toBe('324')
    expect(fmtReading(2001, 0)).toBe('2,001')
    expect(fmtReading(21.44, 1)).toBe('21.4')
    expect(fmtReading(2, 1)).toBe('2.0')
  })

  it('shows a dash for a missing reading', () => {
    expect(fmtReading(undefined, 0)).toBe('—')
    expect(fmtReading(null, 1)).toBe('—')
    expect(fmtReading(NaN, 0)).toBe('—')
    expect(fmtReading(Infinity, 0)).toBe('—')
  })

  it('never prints a negative zero', () => {
    expect(fmtReading(-0.04, 1)).toBe('0.0')
    expect(fmtReading(-0.4, 0)).toBe('0')
    expect(fmtReading(-1.5, 1)).toBe('-1.5')
  })
})

describe('pageKey', () => {
  it('gives every page of one detail template the same key', () => {
    expect(pageKey('/measurement/co2')).toBe(pageKey('/measurement/pm25'))
    expect(pageKey('/events/voc_event_1')).toBe(pageKey('/events/particulate_spike_2'))
  })

  it('keeps other paths apart', () => {
    expect(pageKey('/events')).not.toBe(pageKey('/events/voc_event_1'))
    expect(pageKey('/')).toBe('/')
    expect(pageKey('/air-quality')).toBe('/air-quality')
  })
})
