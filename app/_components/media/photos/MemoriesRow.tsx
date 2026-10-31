'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Row, SectionHeader } from '../ReelCards'
import { formatTime } from '../playerUi'
import { fetchJson, isAbort, type PhotoItem, type PhotoPage, type PhotoSummary } from './api'
import { Thumb } from './PhotoGrid'
import { HeartIcon, PlayGlyph } from './icons'

const DAY = 24 * 3600 * 1000
/** "On this day" tolerance: the same calendar day ± this many days, in earlier years. */
const WINDOW_DAYS = 3
const MAX_YEARS = 6
const LIMIT = 12

type Memories = { title: string; items: PhotoItem[]; onThisDay: boolean }

/** Days between `ms`'s month/day and today's month/day, ignoring the year. */
function dayDistance(ms: number, now: Date): number {
  const d = new Date(ms)
  const same = new Date(now.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.abs(same - today) / DAY
}

/** Same month (and the neighbouring one near month edges) in previous years with photos. */
async function loadOnThisDay(summary: PhotoSummary, signal: AbortSignal): Promise<PhotoItem[]> {
  const now = new Date()
  const thisYear = now.getFullYear()
  const wanted = new Set<string>()
  for (let off = -WINDOW_DAYS; off <= WINDOW_DAYS; off += WINDOW_DAYS) {
    const d = new Date(now.getTime() + off * DAY)
    wanted.add(`${d.getMonth() + 1}`)
  }
  const periods = summary.months
    .filter(m => m.year < thisYear && wanted.has(String(m.month)))
    .slice(0, MAX_YEARS * 2)
  const pages = await Promise.all(periods.map(m =>
    fetchJson<PhotoPage>(`/api/photos?year=${m.year}&month=${m.month}&limit=200`, { signal }).then(p => p.items).catch(e => {
      if (isAbort(e)) throw e
      return [] as PhotoItem[]
    }),
  ))
  return pages.flat()
    .filter(i => dayDistance(i.takenAt, now) <= WINDOW_DAYS)
    // A few per year, newest years first, favourites preferred.
    .sort((a, b) => new Date(b.takenAt).getFullYear() - new Date(a.takenAt).getFullYear() || Number(b.favorite) - Number(a.favorite) || b.takenAt - a.takenAt)
    .slice(0, LIMIT)
}

function caption(item: PhotoItem, onThisDay: boolean): string {
  const d = new Date(item.takenAt)
  if (onThisDay) {
    const years = new Date().getFullYear() - d.getFullYear()
    return years === 1 ? '1 year ago' : `${years} years ago`
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * "Memories": photos from around today's date in earlier years, else the latest
 * additions. Renders nothing while loading, when the library is empty, or offline.
 * Shown at the top of the Photos timeline with `onThisDayOnly`, so it never
 * duplicates the grid below it (and the "All photos" link is dropped there).
 */
export function MemoriesRow({ onThisDayOnly = false }: { onThisDayOnly?: boolean } = {}) {
  const [memories, setMemories] = useState<Memories | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    ;(async () => {
      const summary = await fetchJson<PhotoSummary>('/api/photos/summary', { signal: ctrl.signal })
      if (!summary.libraryOnline || summary.total === 0) return
      const thisYear = new Date().getFullYear()
      if (summary.years.some(y => y.year < thisYear)) {
        const items = await loadOnThisDay(summary, ctrl.signal)
        if (items.length > 0) { setMemories({ title: 'Memories · On this day', items, onThisDay: true }); return }
      }
      if (onThisDayOnly) return
      const page = await fetchJson<PhotoPage>(`/api/photos?limit=${LIMIT}`, { signal: ctrl.signal })
      if (page.items.length > 0) setMemories({ title: 'Memories', items: page.items, onThisDay: false })
    })().catch(e => { if (!isAbort(e)) console.warn('[photos] memories failed', e) })
    return () => ctrl.abort()
  }, [onThisDayOnly])

  if (!memories) return null
  return (
    <section className={onThisDayOnly ? 'mb-6' : undefined}>
      <SectionHeader
        title={memories.title}
        action={onThisDayOnly ? undefined : <Link href="/media/photos" className="text-[13px] font-semibold text-accent hover:underline">All photos</Link>}
      />
      <Row>
        {memories.items.map(item => (
          <Link
            key={item.id}
            href={`/media/photos?v=${item.id}`}
            aria-label={`${item.kind === 'video' ? 'Video' : 'Photo'} from ${caption(item, memories.onThisDay)}`}
            className="group flex w-[150px] shrink-0 flex-col gap-2 md:w-[178px]"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-[13px] shadow-[0_16px_34px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:-translate-y-1">
              <Thumb item={item} />
              <div className="pointer-events-none absolute inset-0 rounded-[13px] ring-1 ring-inset ring-white/10 transition group-hover:ring-white/20" />
              {item.kind === 'video' && (
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-0.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
                  <PlayGlyph className="h-3 w-3" />{item.duration != null ? formatTime(item.duration) : ''}
                </span>
              )}
              {item.favorite && <HeartIcon className="absolute bottom-2 left-2 h-4 w-4" fill="currentColor" style={{ color: 'var(--fav)' }} />}
            </div>
            <p className="truncate px-0.5 text-[12.5px] font-semibold text-white/70">{caption(item, memories.onThisDay)}</p>
          </Link>
        ))}
      </Row>
    </section>
  )
}
