'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter, notFound } from 'next/navigation'
import { useMedia } from './MediaProvider'
import type { ReelTitle, CollectionSummary } from './types'
import { collArt, collColor, backdropFallback } from './artwork'
import { effectiveRuntime } from './selectors'
import { Poster, PosterCard, detailHref } from './ReelCards'
import { StarIcon, CheckIcon, ChevronLeftIcon } from './icons'

function totalHours(titles: ReelTitle[]): number {
  return Math.round(titles.reduce((s, t) => s + effectiveRuntime(t), 0) / 60)
}

function meta(t: ReelTitle): string {
  const bits: string[] = []
  if (t.year) bits.push(String(t.year))
  if (t.type === 'movie' && t.runtime) bits.push(`${Math.floor(t.runtime / 60)}h ${t.runtime % 60}m`)
  if (t.type === 'tv' && t.seasons) bits.push(`${t.seasons} Season${t.seasons > 1 ? 's' : ''}`)
  return bits.join(' · ')
}

export function CollectionDetail({
  catalog, collectionId, franchise,
}: { catalog: ReelTitle[]; collectionId: string; franchise: CollectionSummary | null }) {
  const router = useRouter()
  const { customCollections, isWatched } = useMedia()

  const byId = useMemo(() => new Map(catalog.map(t => [t.id, t])), [catalog])

  const collection: CollectionSummary | null = useMemo(() => {
    if (franchise) return franchise
    const custom = customCollections.find(c => c.id === collectionId)
    return custom ? { id: custom.id, name: custom.name, hue: custom.hue, tagline: custom.tagline, itemIds: custom.items, custom: true } : null
  }, [franchise, customCollections, collectionId])

  if (!collection) {
    // Custom collection not found in this profile's local state.
    notFound()
  }

  const titles = collection.itemIds.map(id => byId.get(id)).filter((t): t is ReelTitle => Boolean(t))
  const small = titles.length <= 4

  return (
    <div className="pb-20">
      <button
        type="button"
        onClick={() => router.back()}
        className="fixed right-4 top-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-sm font-medium text-ink backdrop-blur-xl transition hover:bg-white/10 md:right-6"
      >
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>

      {/* Banner tinted to the collection hue */}
      <div className="relative h-[46vh] min-h-[320px] w-full overflow-hidden">
        <div className="absolute inset-0" style={{ background: collArt(collection.hue) }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,6,13,0.25), rgba(8,6,13,0.55) 60%, #0a0810)' }} />
        <div className="absolute inset-x-0 bottom-0 max-w-[760px] pb-9 pl-[var(--rail)] pr-[var(--gx)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: collColor(collection.hue) }}>Collection</p>
          <h1 className="mt-1 text-[clamp(34px,8vw,58px)] font-[800] leading-[1] tracking-[-0.025em] text-ink">{collection.name}</h1>
          {collection.tagline && <p className="mt-3 max-w-[600px] text-[15px] leading-[1.6] text-white/70">{collection.tagline}</p>}
          <p className="mt-3 text-sm text-white/55">{titles.length} film{titles.length === 1 ? '' : 's'} · {totalHours(titles)}h total</p>
        </div>
      </div>

      <section className="mt-9">
        <h2 className="mb-4 pl-[var(--rail)] pr-[var(--gx)] text-[20px] font-bold text-ink">In this collection</h2>

        {titles.length === 0 ? (
          <p className="pl-[var(--rail)] pr-[var(--gx)] text-sm text-white/45">This collection is empty.</p>
        ) : small ? (
          <div className="space-y-3 pl-[var(--rail)] pr-[var(--gx)]">
            {titles.map((t, i) => {
              const watched = isWatched(t.id, t.watched)
              return (
                <Link key={t.id} href={detailHref(t)} className="group flex gap-4 rounded-2xl border border-border bg-surface p-3 transition hover:bg-surface-2">
                  <div className="relative aspect-video w-[200px] shrink-0">
                    <Poster gradient={t.backdropUrl ? t.backdropColor : backdropFallback(t.hue)} src={t.backdropUrl} alt={t.title} className="h-full w-full" />
                    <span className="absolute left-2 top-2 font-mono text-lg font-bold text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">{String(i + 1).padStart(2, '0')}</span>
                    {watched && (
                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                        <CheckIcon className="h-3 w-3" style={{ color: 'var(--accent)' }} /> Watched
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{t.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-white/55">
                      {t.imdb != null && <span className="inline-flex items-center gap-1"><StarIcon className="h-3.5 w-3.5" style={{ color: 'var(--star)' }} />{t.imdb.toFixed(1)}</span>}
                      <span>{meta(t)}</span>
                    </p>
                    {t.synopsis && <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-white/55 [text-wrap:pretty]">{t.synopsis}</p>}
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="grid gap-x-5 gap-y-7 pl-[var(--rail)] pr-[var(--gx)]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min), 1fr))' }}>
            {titles.map(t => <PosterCard key={t.id} title={t} width="w-full" overlays />)}
          </div>
        )}
      </section>
    </div>
  )
}
