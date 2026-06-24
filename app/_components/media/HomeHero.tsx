import Link from 'next/link'
import type { ReelTitle } from './types'
import { Poster, detailHref } from './ReelCards'
import { PlayIcon, StarIcon } from './icons'

function meta(t: ReelTitle): string {
  const bits: string[] = []
  if (t.year) bits.push(String(t.year))
  if (t.type === 'movie' && t.runtime) bits.push(`${Math.floor(t.runtime / 60)}h ${t.runtime % 60}m`)
  if (t.type === 'tv' && t.seasons) bits.push(`${t.seasons} Season${t.seasons > 1 ? 's' : ''}`)
  if (t.genres.length) bits.push(t.genres.slice(0, 2).join(', '))
  return bits.join(' · ')
}

export function HomeHero({ title }: { title: ReelTitle }) {
  return (
    <section className="relative -mt-px h-[52vh] min-h-[420px] w-full">
      {/* Full-bleed backdrop */}
      <div className="absolute inset-0">
        <Poster gradient={title.backdropColor} src={title.backdropUrl} alt={title.title} rounded="rounded-none" className="h-full w-full" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(8,6,13,0.95), rgba(8,6,13,0.6) 45%, transparent 80%)' }} />
        <div className="absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(180deg, transparent, #0a0810)' }} />
      </div>

      {/* Left-weighted content */}
      <div className="relative flex h-full max-w-[640px] flex-col justify-end pb-10 pl-[var(--rail)] pr-[var(--gx)]">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">
          Featured · {title.type === 'tv' ? 'TV Series' : 'Film'}
        </p>
        <h1 className="font-[800] leading-[0.98] tracking-[-0.025em] text-ink" style={{ fontSize: 'clamp(30px, 7vw, 54px)' }}>
          {title.title}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-white/70">
          {title.imdb != null && (
            <span className="inline-flex items-center gap-1 font-semibold text-white">
              <StarIcon className="h-3.5 w-3.5" style={{ color: 'var(--star)' }} />
              {title.imdb.toFixed(1)}
            </span>
          )}
          {title.imdb != null && <span className="text-white/30">·</span>}
          <span>{meta(title)}</span>
        </p>
        {title.synopsis && (
          <p className="mt-4 max-w-[620px] text-[15px] leading-[1.6] text-white/70 [text-wrap:pretty] line-clamp-3">
            {title.synopsis}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`${detailHref(title)}?play=1`}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-ink-on-accent shadow-[0_12px_34px_var(--glow)] transition hover:brightness-[1.06]"
            style={{ background: 'var(--accent)' }}
          >
            <PlayIcon className="h-4 w-4" /> Play
          </Link>
          <Link
            href={detailHref(title)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-ink backdrop-blur-md transition hover:bg-white/10"
          >
            More info
          </Link>
        </div>
      </div>
    </section>
  )
}
