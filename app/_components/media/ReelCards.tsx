'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMedia } from './MediaProvider'
import type { ReelTitle } from './types'
import { POSTER_SHEEN } from './artwork'
import { StarIcon, CheckIcon, HeartIcon } from './icons'

export function detailHref(t: Pick<ReelTitle, 'id' | 'type'>): string {
  return `/media/${t.type === 'tv' ? 'tv' : 'movies'}/${t.id}`
}

/** Gradient fallback + lazy real image (fades in on load) + glass sheen. */
export function Poster({
  gradient, src, alt, className = '', rounded = 'rounded-xl',
}: { gradient: string; src?: string; alt: string; className?: string; rounded?: string }) {
  const [loaded, setLoaded] = useState(false)
  // When there's a real image, sit it on the dark base so it fades in from black;
  // the hue gradient stays as the fallback only when there's no image.
  return (
    <div className={`relative overflow-hidden ${rounded} ${className}`} style={{ background: src ? '#0a0810' : gradient }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          // Catch already-cached images (onLoad may not fire) so they still reveal.
          ref={(node) => { if (node?.complete) setLoaded(true) }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      <div className="absolute inset-0" style={{ background: POSTER_SHEEN }} />
    </div>
  )
}

export function RatingBadge({ value }: { value?: number }) {
  if (value == null) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
      <StarIcon className="h-3 w-3" style={{ color: 'var(--star)' }} />
      {value.toFixed(1)}
    </span>
  )
}

function metaLine(t: ReelTitle): string {
  const bits: string[] = []
  if (t.year) bits.push(String(t.year))
  if (t.type === 'movie' && t.runtime) bits.push(`${Math.floor(t.runtime / 60)}h ${t.runtime % 60}m`)
  if (t.type === 'tv' && t.seasons) bits.push(`${t.seasons} Season${t.seasons > 1 ? 's' : ''}`)
  return bits.join(' · ')
}

/**
 * Portrait poster card (2:3). `overlays` adds the library-grid affordances
 * (watched check, favorite-heart button, type badge).
 */
export function PosterCard({
  title, width = 'w-[178px]', overlays = false,
}: { title: ReelTitle; width?: string; overlays?: boolean }) {
  const { isWatched, isFavorite, toggleFavorite } = useMedia()
  const watched = isWatched(title.id, title.watched)
  const favorite = isFavorite(title.id, title.favorite)

  return (
    <Link href={detailHref(title)} className={`group flex shrink-0 flex-col gap-2 ${width}`}>
      <div className="relative aspect-[2/3] w-full transition-transform duration-200 group-hover:-translate-y-1">
        <Poster gradient={title.posterColor} src={title.posterUrl} alt={title.title} className="h-full w-full shadow-[0_16px_34px_rgba(0,0,0,0.5)]" />
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10 transition group-hover:ring-white/20" />

        <div className="absolute left-2 top-2"><RatingBadge value={title.imdb} /></div>

        {watched && (
          <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-ink-on-accent" style={{ background: 'var(--accent)' }}>
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
        )}

        {overlays && (
          <button
            type="button"
            aria-label={favorite ? 'Remove favorite' : 'Add favorite'}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(title.id, title.favorite) }}
            className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-black/65"
            style={favorite ? { color: 'var(--fav)' } : undefined}
          >
            <HeartIcon className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />
          </button>
        )}

        {title.progress > 0 && title.progress < 1 && (
          <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full" style={{ width: `${title.progress * 100}%`, background: 'var(--accent)' }} />
          </div>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-semibold text-ink">{title.title}</p>
        <p className="truncate text-[11.5px] text-white/45">{metaLine(title)}</p>
      </div>
    </Link>
  )
}

/**
 * Horizontal scroll row with the page's rail/gx gutters. The vertical padding +
 * matching negative margin give the cards' hover lift/shadow room without being
 * clipped by the scroller's implicit overflow-y, while keeping the visual spacing.
 */
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="scrollbar-hide -my-3 flex gap-4 overflow-x-auto py-3 pl-[var(--rail)] pr-[var(--gx)]">
      {children}
    </div>
  )
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between pl-[var(--rail)] pr-[var(--gx)]">
      <h2 className="text-[20px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
      {action}
    </div>
  )
}
