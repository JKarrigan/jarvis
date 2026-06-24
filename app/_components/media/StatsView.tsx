'use client'

import { useMemo } from 'react'
import { useMedia } from './MediaProvider'
import type { ReelTitle } from './types'
import { computeStats, type UserView } from './selectors'
import { StarIcon, HeartIcon, BookmarkIcon } from './icons'

function StatCard({ value, label, sub }: { value: React.ReactNode; label: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-[clamp(28px,4vw,40px)] font-[800] leading-none text-ink">{value}</p>
      <p className="mt-2 text-sm font-medium text-white/70">{label}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  )
}

export function StatsView({ catalog }: { catalog: ReelTitle[] }) {
  const { ratings, watchlist, isWatched, isFavorite } = useMedia()
  const view: UserView = useMemo(() => ({
    watched: (t) => isWatched(t.id, t.watched),
    favorite: (t) => isFavorite(t.id, t.favorite),
  }), [isWatched, isFavorite])

  const stats = useMemo(
    () => computeStats(catalog, view, ratings, watchlist.length),
    [catalog, view, ratings, watchlist.length],
  )
  const maxGenre = stats.topGenres[0]?.[1] ?? 1

  return (
    <div className="mx-auto max-w-[920px] px-[var(--rail)] py-12 md:px-[var(--gx)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">Your year in film</p>
      <h1 className="mt-2 text-[clamp(34px,7vw,52px)] font-[800] tracking-[-0.025em] text-ink">The numbers so far</h1>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard value={`${stats.hours}h`} label="Hours watched" sub={`≈ ${stats.days} days`} />
        <StatCard value={stats.films} label="Films finished" />
        <StatCard value={stats.series} label="Series watched" />
        <StatCard value={<span className="inline-flex items-center gap-1.5"><StarIcon className="h-7 w-7" style={{ color: 'var(--star)' }} />{stats.avgRating ? stats.avgRating.toFixed(1) : '—'}</span>} label="Your average rating" />
      </div>

      <h2 className="mb-4 mt-12 text-[20px] font-bold text-ink">Top genres</h2>
      {stats.topGenres.length === 0 ? (
        <p className="text-sm text-white/45">Mark a few titles watched to see your genre breakdown.</p>
      ) : (
        <div className="space-y-3">
          {stats.topGenres.map(([genre, count]) => (
            <div key={genre} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-sm text-white/70">{genre}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full" style={{ width: `${(count / maxGenre) * 100}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-soft))' }} />
              </div>
              <span className="w-6 shrink-0 text-right text-sm font-semibold text-white/70">{count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-white/75">
          <HeartIcon className="h-4 w-4" style={{ color: 'var(--fav)' }} fill="currentColor" /> {stats.favCount} favorite{stats.favCount === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-white/75">
          <BookmarkIcon className="h-4 w-4" style={{ color: 'var(--accent)' }} fill="currentColor" /> {stats.watchlistCount} on watchlist
        </span>
      </div>
    </div>
  )
}
