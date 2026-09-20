import type { AudiobookChapter } from '../types'

/** Player clock: `1:02:03` past an hour, else `2:03`. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Book/chapter length: `16h 10m`, `42m`. */
export function length(sec: number): string {
  const mins = Math.max(0, Math.round(sec / 60))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Time remaining: `6h 42m left`, `11 min left`. */
export function timeLeft(sec: number): string {
  const mins = Math.max(0, Math.round(sec / 60))
  if (mins < 60) return `${Math.max(1, mins)} min left`
  return `${length(sec)} left`
}

/** The chapter containing `time` (the last one that has started). */
export function chapterAt(chapters: AudiobookChapter[], time: number): AudiobookChapter | undefined {
  let current = chapters[0]
  for (const c of chapters) {
    if (c.start <= time + 0.25) current = c
    else break
  }
  return current
}
