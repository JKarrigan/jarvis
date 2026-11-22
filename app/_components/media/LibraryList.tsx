'use client'

import { memo } from 'react'
import Link from 'next/link'
import { useNowMinute } from '@/lib/useNow'
import { useTitleState } from './MediaProvider'
import type { ReelTitle } from './types'
import { backdropFallback, imageSrcSet, resizeImage } from './artwork'
import { addedLabel, firstDirector, effectiveGenres, lengthLabel, type LibrarySort, type SortDir } from './selectors'
import { criticColor } from './DetailSections'
import { HOVER_REVEAL, Poster, detailHref } from './ReelCards'
import { CheckIcon, HeartIcon, ListIcon, PlayIcon, PlusIcon, StarIcon } from './icons'

/**
 * Column tracks, keyed to the list's own width (container queries) rather than the
 * viewport, so the columns that fit are the same whether the sidebar is open or collapsed:
 *   narrow   Title | Status
 *   @2xl     Title | Year | Length | Rating | Added | Status
 *   @5xl     … + Critics, Genres
 *   @6xl     … + Director
 * A cell that is hidden at a width uses the matching `hidden @…:block` class below.
 */
const TRACKS = [
  'grid-cols-[minmax(0,1fr)_auto]',
  '@2xl:grid-cols-[minmax(0,1fr)_60px_92px_72px_88px_168px]',
  '@5xl:grid-cols-[minmax(0,1fr)_60px_92px_72px_72px_190px_88px_168px]',
  '@6xl:grid-cols-[minmax(0,1fr)_60px_92px_72px_72px_190px_170px_88px_168px]',
].join(' ')

const FROM_2XL = 'hidden @2xl:block'
const FROM_5XL = 'hidden @5xl:block'
const FROM_6XL = 'hidden @6xl:block'

/** Round action button that sits above a row's stretched link. */
const rowBtn = 'relative z-[1] grid h-9 w-9 shrink-0 place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const rowBtnIdle = `border-white/20 text-white/80 hover:bg-white/10 hover:text-white ${HOVER_REVEAL}`
const rowBtnOn = 'border-transparent bg-accent text-ink-on-accent'

function SortHeader({ label, sortKey, sort, dir, onSort, className = '' }: {
  label: string
  sortKey?: LibrarySort
  sort?: LibrarySort
  dir?: SortDir
  onSort?: (s: LibrarySort) => void
  className?: string
}) {
  const active = sortKey !== undefined && sort === sortKey
  if (!sortKey || !onSort) {
    return <div role="columnheader" className={className}>{label}</div>
  }
  return (
    <div role="columnheader" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`-mx-1.5 inline-flex h-8 items-center gap-1 rounded-lg px-1.5 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'font-bold text-accent-soft' : ''}`}
      >
        {label}
        {active && (
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={dir === 'asc' ? 'rotate-180' : ''}>
            <path d="M10 4v12M5 11l5 5 5-5" />
          </svg>
        )}
      </button>
    </div>
  )
}

/** One library title as a 56px table row. The title is a link stretched over the whole row. */
const TitleRowCompact = memo(function TitleRowCompact({ title: t, nowMs }: { title: ReelTitle; nowMs: number | null }) {
  const { isWatched, isFavorite, inPickList, toggleWatched, toggleFavorite, togglePickList } = useTitleState()
  const watched = isWatched(t.id, t.watched)
  const favorite = isFavorite(t.id, t.favorite)
  const picked = inPickList(t.id)
  const inProgress = t.progress > 0 && t.progress < 1
  const length = lengthLabel(t)
  const genres = effectiveGenres(t).slice(0, 2).join(', ')
  const narrowMeta = [t.year, length].filter(Boolean).join(' · ')

  return (
    <div role="row" className={`group relative grid ${TRACKS} min-h-14 items-center gap-x-3 border-b border-white/[0.07] px-3 py-1 text-sm transition-colors hover:bg-white/[0.05] focus-within:bg-white/[0.05]`}>
      <div role="cell" className="flex min-w-0 items-center gap-3.5">
        <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded-[5px]" style={{ background: t.posterUrl ? '#0a0810' : t.posterColor }}>
          {t.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resizeImage(t.posterUrl, 96)} alt="" width={32} height={48} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <Link href={detailHref(t)} className="block truncate text-[15px] font-bold text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {t.title}
          </Link>
          {/* Narrow lists fold the columns into one line under the title. */}
          <span className="block truncate text-[13px] text-white/60 @2xl:hidden">
            {narrowMeta}
            {t.imdb != null && <>{narrowMeta ? ' · ' : ''}<span style={{ color: 'var(--star)' }}>★</span> {t.imdb.toFixed(1)}</>}
          </span>
          {inProgress && (
            <span aria-label={`${Math.round(t.progress * 100)}% watched`} role="img" className="mt-1.5 block h-1 w-40 max-w-full overflow-hidden rounded-full bg-white/20">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${t.progress * 100}%` }} />
            </span>
          )}
        </span>
      </div>

      <div role="cell" className={`${FROM_2XL} tabular-nums text-white/80`}>{t.year ?? ''}</div>
      <div role="cell" className={`${FROM_2XL} text-white/80`}>{length}</div>
      <div role="cell" className={`${FROM_2XL} font-bold tabular-nums text-ink`}>
        {t.imdb != null && <><StarIcon className="mr-1 inline h-3.5 w-3.5 -translate-y-px" style={{ color: 'var(--star)' }} />{t.imdb.toFixed(1)}</>}
      </div>
      <div role="cell" className={`${FROM_5XL} font-semibold tabular-nums`} style={t.rt != null ? { color: criticColor(t.rt) } : undefined}>
        {t.rt != null ? `${Math.round(t.rt)}%` : ''}
      </div>
      <div role="cell" className={`${FROM_5XL} truncate text-white/60`}>{genres}</div>
      <div role="cell" className={`${FROM_6XL} truncate text-white/80`}>{firstDirector(t) ?? ''}</div>
      <div role="cell" className={`${FROM_2XL} text-white/60`}>{nowMs != null ? addedLabel(t.added, t.addedAt, nowMs) : ''}</div>

      <div role="cell" className="flex items-center justify-end gap-1.5">
        {/* Narrow lists: state marks only. Wider: the same marks as real toggles, with the
            unset ones (and Play) appearing on hover or focus, always on touch screens. */}
        <span className="flex items-center gap-1.5 @2xl:hidden">
          {picked && <span role="img" aria-label="In picker list" className="grid h-6 w-6 place-items-center rounded-full bg-accent text-ink-on-accent"><ListIcon className="h-3.5 w-3.5" /></span>}
          {favorite && <span role="img" aria-label="Favorite" className="grid h-6 w-6 place-items-center" style={{ color: 'var(--fav)' }}><HeartIcon className="h-4 w-4" fill="currentColor" /></span>}
          {watched && <span role="img" aria-label="Watched" className="grid h-6 w-6 place-items-center rounded-full bg-accent text-ink-on-accent"><CheckIcon className="h-3.5 w-3.5" /></span>}
        </span>
        <span className="hidden items-center gap-1.5 @2xl:flex">
          <Link href={`${detailHref(t)}?play=1`} aria-label={`Play ${t.title}`} className={`${rowBtn} border-transparent bg-accent text-ink-on-accent hover:brightness-110 ${HOVER_REVEAL}`}>
            <PlayIcon className="h-3.5 w-3.5" />
          </Link>
          <button type="button" onClick={() => toggleFavorite(t.id, t.favorite)} aria-pressed={favorite} aria-label={favorite ? `Remove ${t.title} from favorites` : `Add ${t.title} to favorites`} className={`${rowBtn} ${favorite ? 'border-transparent' : rowBtnIdle}`} style={favorite ? { color: 'var(--fav)' } : undefined}>
            <HeartIcon className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />
          </button>
          <button type="button" onClick={() => toggleWatched(t.id, t.watched)} aria-pressed={watched} aria-label={watched ? `Mark ${t.title} unwatched` : `Mark ${t.title} watched`} className={`${rowBtn} ${watched ? rowBtnOn : rowBtnIdle}`}>
            <CheckIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => togglePickList(t.id)} aria-pressed={picked} aria-label={picked ? `Remove ${t.title} from the picker list` : `Add ${t.title} to the picker list`} className={`${rowBtn} ${picked ? rowBtnOn : rowBtnIdle}`}>
            {picked ? <ListIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          </button>
        </span>
      </div>
    </div>
  )
})

/**
 * The library as a table (ARIA table roles on a CSS grid, so each row can carry one
 * stretched link). Column headers sort when `onSort` is given; the header row is sticky.
 */
export function LibraryList({ titles, sort, dir, onSort }: {
  titles: ReelTitle[]
  sort?: LibrarySort
  dir?: SortDir
  onSort?: (s: LibrarySort) => void
}) {
  const nowMs = useNowMinute()
  const head = { sort, dir, onSort }
  return (
    <div className="@container pl-[var(--rail)] pr-[var(--gx)]">
      <div role="table" aria-label="Titles" aria-rowcount={titles.length + 1}>
        <div role="row" className={`sticky top-0 z-10 hidden ${TRACKS} h-11 items-center gap-x-3 rounded-t-xl border-b border-white/15 bg-[rgba(12,10,14,0.86)] px-3 text-[13px] font-semibold text-white/60 backdrop-blur-xl @2xl:grid`}>
          <SortHeader label="Title" sortKey="title" {...head} />
          <SortHeader label="Year" sortKey="year" {...head} />
          <SortHeader label="Length" sortKey="runtime" {...head} />
          <SortHeader label="Rating" sortKey="rating" {...head} />
          <SortHeader label="Critics" className={FROM_5XL} />
          <SortHeader label="Genres" className={FROM_5XL} />
          <SortHeader label="Director" className={FROM_6XL} />
          <SortHeader label="Added" sortKey="added" {...head} />
          <div role="columnheader" className="text-right">Status</div>
        </div>
        <div role="rowgroup">
          {titles.map(t => <TitleRowCompact key={t.id} title={t} nowMs={nowMs} />)}
        </div>
      </div>
    </div>
  )
}

function wideMeta(t: ReelTitle): string {
  return [t.year, lengthLabel(t)].filter(Boolean).join(' · ')
}

/**
 * The roomy row used on collection pages: backdrop thumbnail with Play, position in the
 * list, rating and synopsis, and the same Favorite / Watched / Picker list toggles as
 * the table. The title is a link stretched over the row; the buttons sit above it.
 */
export const TitleRowWide = memo(function TitleRowWide({ title: t, index }: { title: ReelTitle; index?: number }) {
  const { isWatched, isFavorite, inPickList, toggleWatched, toggleFavorite, togglePickList } = useTitleState()
  const watched = isWatched(t.id, t.watched)
  const favorite = isFavorite(t.id, t.favorite)
  const picked = inPickList(t.id)
  const inProgress = t.progress > 0 && t.progress < 1

  return (
    <div className="group relative flex items-center gap-4 rounded-2xl p-2 transition hover:bg-surface focus-within:bg-surface sm:gap-5">
      {index !== undefined && (
        <span aria-hidden="true" className="hidden w-7 shrink-0 text-right text-lg font-bold tabular-nums text-white/50 sm:block">{index}</span>
      )}
      <div className="relative aspect-video w-[160px] shrink-0 overflow-hidden rounded-xl sm:w-[300px]">
        <Poster
          gradient={t.backdropUrl ? t.backdropColor : backdropFallback(t.hue)}
          src={resizeImage(t.backdropUrl, 960)}
          srcSet={imageSrcSet(t.backdropUrl, [480, 720, 960])}
          sizes="(min-width: 640px) 300px, 160px"
          width={960}
          height={540}
          alt=""
          rounded="rounded-xl"
          className="h-full w-full"
        />
        <Link
          href={`${detailHref(t)}?play=1`}
          aria-label={`Play ${t.title}`}
          className={`absolute inset-0 z-[1] grid place-items-center bg-black/30 transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${HOVER_REVEAL}`}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm"><PlayIcon className="h-5 w-5" /></span>
        </Link>
        {inProgress && (
          <span aria-hidden="true" className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${t.progress * 100}%` }} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <Link href={detailHref(t)} className="block truncate text-base font-bold text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
          {t.title}
        </Link>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-white/60">
          {t.imdb != null && <span className="inline-flex items-center gap-1 font-semibold text-white/85"><StarIcon className="h-3.5 w-3.5" style={{ color: 'var(--star)' }} />{t.imdb.toFixed(1)}</span>}
          <span>{wideMeta(t)}</span>
        </p>
        {t.synopsis && <p className="mt-1.5 hidden text-[13px] leading-snug text-white/65 [text-wrap:pretty] sm:line-clamp-2">{t.synopsis}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => toggleFavorite(t.id, t.favorite)} aria-pressed={favorite} aria-label={favorite ? `Remove ${t.title} from favorites` : `Add ${t.title} to favorites`} className={`${rowBtn} hidden sm:grid ${favorite ? 'border-transparent' : rowBtnIdle}`} style={favorite ? { color: 'var(--fav)' } : undefined}>
          <HeartIcon className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />
        </button>
        <button type="button" onClick={() => togglePickList(t.id)} aria-pressed={picked} aria-label={picked ? `Remove ${t.title} from the picker list` : `Add ${t.title} to the picker list`} className={`${rowBtn} hidden sm:grid ${picked ? rowBtnOn : rowBtnIdle}`}>
          {picked ? <ListIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => toggleWatched(t.id, t.watched)} aria-pressed={watched} aria-label={watched ? `Mark ${t.title} unwatched` : `Mark ${t.title} watched`} className={`${rowBtn} ${watched ? rowBtnOn : 'border-white/20 text-white/60 hover:bg-white/10 hover:text-white'}`}>
          <CheckIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
})
