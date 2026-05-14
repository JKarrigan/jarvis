'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { MediaRow } from './MediaCard'
import { MOCK_MOVIES, MOCK_TV } from './mockData'
import type { JellyfinItem, JellyfinEpisode } from '@/lib/jellyfin'
import { formatRuntime } from '@/lib/jellyfin'

const PERSON_COLORS = [
  'linear-gradient(135deg, #6d28d9, #4c1d95)',
  'linear-gradient(135deg, #0e7490, #0c4a6e)',
  'linear-gradient(135deg, #166534, #14532d)',
  'linear-gradient(135deg, #9a3412, #7f1d1d)',
  'linear-gradient(135deg, #92400e, #78350f)',
  'linear-gradient(135deg, #1e3a5f, #1e293b)',
  'linear-gradient(135deg, #9d174d, #881337)',
  'linear-gradient(135deg, #1c4a2a, #052e16)',
]

function personColor(id: string): string {
  const n = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return PERSON_COLORS[n % PERSON_COLORS.length]
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-amber-400 text-sm font-medium">
      <svg viewBox="0 0 12 12" className="w-3.5 h-3.5 fill-current">
        <path d="M6 0l1.545 3.782 4.045.587-2.927 2.853.691 4.028L6 9.125l-3.354 2.125.691-4.028L.41 4.369l4.045-.587z" />
      </svg>
      {rating.toFixed(1)}
    </span>
  )
}

function EpisodeRow({ ep, index }: { ep: JellyfinEpisode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className="flex gap-5 py-4 border-b border-zinc-800 last:border-0"
    >
      <span className="text-zinc-600 text-base font-mono w-7 shrink-0 pt-0.5 text-right">
        {ep.IndexNumber}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-base font-medium text-zinc-100 truncate">{ep.Name}</p>
          {ep.RunTimeTicks && (
            <span className="text-sm text-zinc-500 shrink-0">{formatRuntime(ep.RunTimeTicks)}</span>
          )}
        </div>
        {ep.Overview && (
          <p className="text-sm text-zinc-500 mt-1.5 line-clamp-2">{ep.Overview}</p>
        )}
      </div>
    </motion.div>
  )
}

export default function MediaDetail({
  item,
  backHref,
}: {
  item: JellyfinItem
  backHref: string
}) {
  const [overviewExpanded, setOverviewExpanded] = useState(false)
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(
    item.Seasons?.[0]?.Id ?? '',
  )

  const selectedSeason = item.Seasons?.find(s => s.Id === selectedSeasonId)
  const actors = item.People.filter(p => p.Type === 'Actor')
  const directors = item.People.filter(p => p.Type === 'Director')

  const moreItems = item.Type === 'Movie'
    ? MOCK_MOVIES.filter(m => m.id !== item.Id).slice(0, 8)
    : MOCK_TV.filter(t => t.id !== item.Id).slice(0, 8)

  const runtime = item.RunTimeTicks ? formatRuntime(item.RunTimeTicks) : null

  return (
    <div className="min-h-screen pb-16">
      {/* Hero */}
      <div className="relative w-full" style={{ height: '68vh', minHeight: 460 }}>
        <div
          className="absolute inset-0"
          style={{ background: item.backdropColor }}
          aria-hidden="true"
        />
        {/* bottom fade */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/40 to-transparent" />
        {/* top fade so sidebar area blends */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#09090b]/30 to-transparent" />

        {/* Back button */}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute top-5 left-6 md:left-8 z-10"
        >
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-base text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-5 h-5 fill-current">
              <path d="M10.293 3.293a1 1 0 010 1.414L7.414 8l2.879 2.879a1 1 0 01-1.414 1.414l-3.586-3.586a1 1 0 010-1.414l3.586-3.586a1 1 0 011.414 0z" />
            </svg>
            Back
          </Link>
        </motion.div>

        {/* Hero content */}
        <div className="absolute bottom-0 left-0 right-0 px-6 md:px-8 pb-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            {item.Taglines?.[0] && (
              <p className="text-base text-zinc-400 italic mb-2">{item.Taglines[0]}</p>
            )}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-zinc-100 leading-tight max-w-3xl">
              {item.Name}
            </h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2.5 mt-4 text-base text-zinc-400">
              {item.ProductionYear && (
                <span className="text-zinc-300 font-medium">{item.ProductionYear}</span>
              )}
              {item.OfficialRating && (
                <span className="border border-zinc-600 text-zinc-400 text-sm px-2 py-0.5 rounded">
                  {item.OfficialRating}
                </span>
              )}
              {runtime && <span>{runtime}</span>}
              {item.Type === 'Series' && item.SeasonCount && (
                <span>
                  {item.SeasonCount} season{item.SeasonCount !== 1 ? 's' : ''}
                </span>
              )}
              {item.CommunityRating && <StarRating rating={item.CommunityRating} />}
              {item.Status === 'Ended' && (
                <span className="text-sm text-zinc-600 uppercase tracking-wide">Ended</span>
              )}
            </div>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3 }}
              className="flex items-center gap-3 mt-6"
            >
              <button className="inline-flex items-center gap-2.5 bg-zinc-100 hover:bg-white text-zinc-900 font-semibold text-base px-7 py-3 rounded-lg transition-colors">
                <svg viewBox="0 0 16 16" className="w-5 h-5 fill-current">
                  <path d="M3 2.5a.5.5 0 01.768-.422l10 5.5a.5.5 0 010 .844l-10 5.5A.5.5 0 013 13.5v-11z" />
                </svg>
                Play
              </button>
              <button className="inline-flex items-center gap-2.5 border border-zinc-600 hover:border-zinc-400 text-zinc-300 hover:text-zinc-100 text-base px-6 py-3 rounded-lg transition-colors">
                <svg viewBox="0 0 16 16" className="w-5 h-5 fill-current">
                  <path d="M8 1.5a.5.5 0 01.5.5v5.5H14a.5.5 0 010 1H8.5V14a.5.5 0 01-1 0V8.5H2a.5.5 0 010-1h5.5V2a.5.5 0 01.5-.5z" />
                </svg>
                My List
              </button>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 md:px-8 mt-10 space-y-12">
        {/* Genres */}
        {item.Genres.length > 0 && (
          <div className="flex flex-wrap gap-2.5">
            {item.Genres.map(g => (
              <span
                key={g}
                className="text-sm text-zinc-400 bg-zinc-800 border border-zinc-700 px-3.5 py-1.5 rounded-full"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Overview */}
        {item.Overview && (
          <div className="max-w-3xl">
            <AnimatePresence initial={false}>
              <motion.p
                key={overviewExpanded ? 'expanded' : 'collapsed'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`text-base text-zinc-300 leading-relaxed ${!overviewExpanded ? 'line-clamp-3' : ''}`}
              >
                {item.Overview}
              </motion.p>
            </AnimatePresence>
            {item.Overview.length > 200 && (
              <button
                onClick={() => setOverviewExpanded(v => !v)}
                className="text-sm text-zinc-500 hover:text-zinc-300 mt-2.5 transition-colors"
              >
                {overviewExpanded ? 'Less' : 'More'}
              </button>
            )}
          </div>
        )}

        {/* Director */}
        {directors.length > 0 && (
          <div className="text-base text-zinc-500">
            <span className="text-zinc-400">Director{directors.length > 1 ? 's' : ''}: </span>
            {directors.map((d, i) => (
              <span key={d.Id}>
                <span className="text-zinc-300">{d.Name}</span>
                {i < directors.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Cast */}
        {actors.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-zinc-400 uppercase tracking-wider mb-5">Cast</h2>
            <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide -mx-6 md:-mx-8 px-6 md:px-8">
              {actors.map((person, i) => (
                <motion.div
                  key={person.Id}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                  className="flex flex-col items-center gap-2.5 shrink-0 w-28"
                >
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-bold text-white/70 ring-2 ring-white/10"
                    style={{ background: personColor(person.Id) }}
                  >
                    {person.Name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-zinc-200 font-medium leading-tight line-clamp-2">
                      {person.Name}
                    </p>
                    {person.Role && (
                      <p className="text-xs text-zinc-600 mt-0.5 line-clamp-1">{person.Role}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Seasons & Episodes (TV only) */}
        {item.Type === 'Series' && item.Seasons && item.Seasons.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-zinc-400 uppercase tracking-wider">Episodes</h2>
              {item.Seasons.length > 1 && (
                <div className="flex gap-1">
                  {item.Seasons.map(season => (
                    <button
                      key={season.Id}
                      onClick={() => setSelectedSeasonId(season.Id)}
                      className="relative text-sm px-4 py-2 rounded-md transition-colors"
                      style={{
                        color: selectedSeasonId === season.Id ? '#f4f4f5' : '#71717a',
                      }}
                    >
                      {selectedSeasonId === season.Id && (
                        <motion.span
                          layoutId="season-tab-bg"
                          className="absolute inset-0 bg-zinc-700 rounded-md"
                          transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                        />
                      )}
                      <span className="relative z-10">S{season.IndexNumber}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <AnimatePresence mode="wait">
              {selectedSeason && (
                <motion.div
                  key={selectedSeason.Id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  {selectedSeason.Episodes?.map((ep, i) => (
                    <EpisodeRow key={ep.Id} ep={ep} index={i} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* Studios */}
        {item.Studios && item.Studios.length > 0 && (
          <div className="text-base text-zinc-500">
            <span className="text-zinc-600">Studio: </span>
            {item.Studios.map((s, i) => (
              <span key={s.Id}>
                <span className="text-zinc-500">{s.Name}</span>
                {i < item.Studios!.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}

        {/* More Like This */}
        {moreItems.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-zinc-400 uppercase tracking-wider mb-5 px-0">
              More Like This
            </h2>
            <div className="-mx-6 md:-mx-8">
              <MediaRow items={moreItems} />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
