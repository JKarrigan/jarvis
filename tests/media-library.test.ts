import { describe, expect, it } from 'vitest'
import type { ReelTitle } from '@/app/_components/media/types'
import { addedLabel, firstDirector, lengthLabel, sortTitles } from '@/app/_components/media/selectors'
import { LIBRARY_DEFAULTS, parseLibraryQuery, serializeLibraryQuery } from '@/app/_components/media/libraryQuery'

function title(over: Partial<ReelTitle> & { id: string; title: string }): ReelTitle {
  return { type: 'movie', genres: [], hue: 0, progress: 0, watched: false, favorite: false, posterColor: '', backdropColor: '', ...over }
}

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 21, 12)

describe('sortTitles', () => {
  const a = title({ id: 'a', title: 'Alpha', year: 1990, imdb: 7, runtime: 120, addedAt: 300 })
  const b = title({ id: 'b', title: 'Bravo', year: 2010, imdb: 8.5, runtime: 90, addedAt: 100 })
  const c = title({ id: 'c', title: 'Charlie', year: 2000, imdb: 6, runtime: 150, addedAt: 200 })
  const ids = (list: ReelTitle[]) => list.map(t => t.id).join('')

  it('uses each sort\'s natural direction by default', () => {
    expect(ids(sortTitles([c, a, b], 'added'))).toBe('acb')   // newest first
    expect(ids(sortTitles([c, a, b], 'title'))).toBe('abc')   // A to Z
    expect(ids(sortTitles([c, a, b], 'year'))).toBe('bca')    // newest first
    expect(ids(sortTitles([c, a, b], 'rating'))).toBe('bac')  // highest first
    expect(ids(sortTitles([c, a, b], 'runtime'))).toBe('bac') // shortest first
  })

  it('reverses with the other direction', () => {
    expect(ids(sortTitles([c, a, b], 'year', 'asc'))).toBe('acb')
    expect(ids(sortTitles([c, a, b], 'title', 'desc'))).toBe('cba')
    expect(ids(sortTitles([c, a, b], 'runtime', 'desc'))).toBe('cab')
  })

  it('puts titles without the sorted value last in both directions', () => {
    const noYear = title({ id: 'n', title: 'Nameless' })
    expect(ids(sortTitles([noYear, a, b], 'year', 'desc'))).toBe('ban')
    expect(ids(sortTitles([noYear, a, b], 'year', 'asc'))).toBe('abn')
    expect(ids(sortTitles([noYear, a, b], 'rating'))).toBe('ban')
  })

  it('breaks ties by title, whatever the direction', () => {
    const x = title({ id: 'x', title: 'Xray', year: 2000 })
    const m = title({ id: 'm', title: 'Mike', year: 2000 })
    expect(ids(sortTitles([x, m], 'year', 'desc'))).toBe('mx')
    expect(ids(sortTitles([x, m], 'year', 'asc'))).toBe('mx')
  })

  it('does not mutate its input', () => {
    const input = [c, a, b]
    sortTitles(input, 'title')
    expect(ids(input)).toBe('cab')
  })
})

describe('library URL state', () => {
  it('writes nothing for the defaults', () => {
    expect(serializeLibraryQuery(LIBRARY_DEFAULTS)).toBe('')
  })

  it('round-trips a filtered, sorted list view', () => {
    const state = { ...LIBRARY_DEFAULTS, genre: 'Drama', show: 'unwatched' as const, sort: 'year' as const, dir: 'asc' as const, q: 'roman', view: 'list' as const }
    const qs = serializeLibraryQuery(state)
    expect(qs.startsWith('?')).toBe(true)
    expect(parseLibraryQuery(new URLSearchParams(qs))).toEqual(state)
  })

  it('leaves out the direction when it is the sort\'s natural one', () => {
    expect(serializeLibraryQuery({ ...LIBRARY_DEFAULTS, sort: 'title', dir: 'asc' })).toBe('?sort=title')
    expect(serializeLibraryQuery({ ...LIBRARY_DEFAULTS, sort: 'title', dir: 'desc' })).toBe('?sort=title&dir=desc')
  })

  it('falls back to defaults for unknown values', () => {
    const parsed = parseLibraryQuery(new URLSearchParams('sort=bogus&dir=sideways&show=nope&type=x&view=tiles'))
    expect(parsed).toEqual(LIBRARY_DEFAULTS)
    expect(parsed.view).toBeUndefined()
  })

  it('gives a sort its natural direction when none is given', () => {
    expect(parseLibraryQuery(new URLSearchParams('sort=title')).dir).toBe('asc')
    expect(parseLibraryQuery(new URLSearchParams('sort=rating')).dir).toBe('desc')
  })

  it('keeps existing genre and tag links working', () => {
    const parsed = parseLibraryQuery(new URLSearchParams('genre=Science+Fiction&tag=rome%2C+italy'))
    expect(parsed.genre).toBe('Science Fiction')
    expect(parsed.tag).toBe('rome, italy')
  })
})

describe('list labels', () => {
  it('labels how long ago a title was added', () => {
    expect(addedLabel(undefined, undefined, NOW)).toBe('')
    expect(addedLabel(0, NOW, NOW)).toBe('Today')
    expect(addedLabel(1, NOW - DAY, NOW)).toBe('Yesterday')
    expect(addedLabel(30, NOW - 30 * DAY, NOW)).toBe('30d ago')
    expect(addedLabel(35, NOW - 35 * DAY, NOW)).toBe('Oct 17')
    expect(addedLabel(400, NOW - 400 * DAY, NOW)).toBe('Oct 17, 2025')
    // No timestamp to make a date from: keep counting days.
    expect(addedLabel(90, undefined, NOW)).toBe('90d ago')
  })

  it('formats length for movies and shows', () => {
    expect(lengthLabel(title({ id: 'm', title: 'M', runtime: 129 }))).toBe('2h 9m')
    expect(lengthLabel(title({ id: 's', title: 'S', runtime: 45 }))).toBe('45m')
    expect(lengthLabel(title({ id: 'n', title: 'N' }))).toBe('')
    expect(lengthLabel(title({ id: 't', title: 'T', type: 'tv', seasons: 1 }))).toBe('1 season')
    expect(lengthLabel(title({ id: 'u', title: 'U', type: 'tv', seasons: 3 }))).toBe('3 seasons')
  })

  it('picks the first directing credit', () => {
    const t = title({ id: 'p', title: 'P', people: [{ id: '1', name: 'An Actor' }, { id: '2', name: 'First Director', director: true }, { id: '3', name: 'Second Director', director: true }] })
    expect(firstDirector(t)).toBe('First Director')
    expect(firstDirector(title({ id: 'q', title: 'Q', people: [{ id: '1', name: 'An Actor' }] }))).toBeUndefined()
    expect(firstDirector(title({ id: 'r', title: 'R' }))).toBeUndefined()
  })
})
