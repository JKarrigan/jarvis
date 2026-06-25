'use client'

import { useMemo } from 'react'
import { useMedia } from './MediaProvider'
import type { ReelTitle, ContinueItem } from './types'
import { recommendations, type UserView } from './selectors'
import { HomeHero } from './HomeHero'
import { PosterCard, Row, SectionHeader } from './ReelCards'
import { ContinueCard } from './ContinueCard'
import { useFilteredLibrary, LibraryFilterBar, LibraryGridInner } from './library'

export function HomeBody({
  featured, resume, catalog,
}: { featured: ReelTitle | null; resume: ContinueItem[]; catalog: ReelTitle[] }) {
  const { isWatched, isFavorite, watchlist } = useMedia()
  const view: UserView = useMemo(() => ({
    watched: (t) => isWatched(t.id, t.watched),
    favorite: (t) => isFavorite(t.id, t.favorite),
  }), [isWatched, isFavorite])

  const lib = useFilteredLibrary(catalog)

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
        {showRows && resume.length > 0 && (
          <section>
            <SectionHeader title="Continue watching" />
            <Row>{resume.map(r => <ContinueCard key={r.id} item={r} />)}</Row>
          </section>
        )}

        {showRows && recentlyAdded.length > 0 && (
          <section>
            <SectionHeader title="Recently added" />
            <Row>{recentlyAdded.map(t => <PosterCard key={t.id} title={t} showAddedDays />)}</Row>
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
            show={lib.show} setShow={lib.setShow}
            genres={lib.genres} count={lib.result.length}
          />
          <LibraryGridInner titles={lib.result} />
        </section>
      </div>
    </div>
  )
}
