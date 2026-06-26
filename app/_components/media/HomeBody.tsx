'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useMedia } from './MediaProvider'
import type { ReelTitle, ContinueItem, CollectionSummary } from './types'
import { recommendations, type UserView } from './selectors'
import { HomeHero } from './HomeHero'
import { PosterCard, CollectionCard, Row, SectionHeader } from './ReelCards'
import { ContinueCard } from './ContinueCard'
import { useFilteredLibrary, LibraryFilterBar, LibraryGridInner } from './library'

export function HomeBody({
  featured, resume, catalog, collections,
}: { featured: ReelTitle | null; resume: ContinueItem[]; catalog: ReelTitle[]; collections: CollectionSummary[] }) {
  const { isWatched, isFavorite, watchlist } = useMedia()
  const view: UserView = useMemo(() => ({
    watched: (t) => isWatched(t.id, t.watched),
    favorite: (t) => isFavorite(t.id, t.favorite),
  }), [isWatched, isFavorite])

  const lib = useFilteredLibrary(catalog)

  const router = useRouter()
  const [clearedResume, setClearedResume] = useState<Set<string>>(() => new Set())
  const resumeShown = useMemo(() => resume.filter(r => !clearedResume.has(r.id)), [resume, clearedResume])

  const recentlyAdded = useMemo(
    // Newest first (far left), by precise add time so same-day items still order correctly.
    () => [...catalog].sort((a, b) => (b.addedAt ?? -Infinity) - (a.addedAt ?? -Infinity)).slice(0, 14),
    [catalog],
  )
  const watchlistTitles = useMemo(() => {
    const byId = new Map(catalog.map(t => [t.id, t]))
    return watchlist.map(id => byId.get(id)).filter((t): t is ReelTitle => Boolean(t))
  }, [catalog, watchlist])
  const recs = useMemo(() => recommendations(catalog, view), [catalog, view])

  const showRows = !lib.filtersActive

  return (
    <div className="pb-16">
      {showRows && featured && <HomeHero title={featured} />}

      <div className="space-y-10 pt-8">
        {showRows && resumeShown.length > 0 && (
          <section>
            <SectionHeader title="Continue watching" />
            <Row>
              <AnimatePresence initial={false}>
                {resumeShown.map(r => (
                  <motion.div
                    key={r.id}
                    layout
                    exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
                    className="shrink-0"
                  >
                    <ContinueCard
                      item={r}
                      onCleared={() => { setClearedResume(s => new Set(s).add(r.id)); router.refresh() }}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </Row>
          </section>
        )}

        {showRows && recentlyAdded.length > 0 && (
          <section>
            <SectionHeader title="Recently added" />
            <Row>{recentlyAdded.map(t => <PosterCard key={t.id} title={t} showAddedDays />)}</Row>
          </section>
        )}

        {showRows && collections.length > 0 && (
          <section>
            <SectionHeader title="Collections" />
            <Row>{collections.slice(0, 18).map(c => <CollectionCard key={c.id} collection={c} />)}</Row>
          </section>
        )}

        {showRows && watchlistTitles.length > 0 && (
          <section>
            <SectionHeader title="Your watchlist" />
            <Row>{watchlistTitles.map(t => <PosterCard key={t.id} title={t} />)}</Row>
          </section>
        )}

        {showRows && recs.titles.length > 0 && (
          <section>
            <SectionHeader title={`More ${recs.topGenre ?? 'picks'} for you`} />
            <Row>{recs.titles.map(t => <PosterCard key={t.id} title={t} />)}</Row>
          </section>
        )}

        <section>
          <SectionHeader title={showRows ? 'Your library' : 'Movies & shows'} />
          <LibraryFilterBar
            sort={lib.sort} setSort={lib.setSort}
            genre={lib.genre} setGenre={lib.setGenre}
            tag={lib.tag} setTag={lib.setTag}
            show={lib.show} setShow={lib.setShow}
            genres={lib.genres} tags={lib.tags} count={lib.result.length}
          />
          <LibraryGridInner titles={lib.result} />
        </section>
      </div>
    </div>
  )
}
