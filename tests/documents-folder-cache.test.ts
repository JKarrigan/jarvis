import { describe, expect, it } from 'vitest'
import { DocsApiError, type DocItem } from '@/app/_components/media/documents/api'
import {
  FolderCache, PREFETCH_FRESH, reconcileListing, type Listing,
} from '@/app/_components/media/documents/folderCache'
import { ScrollMemory, navDirection, slideFrom } from '@/app/_components/media/documents/navigation'

const item = (path: string, isDir = false, extra: Partial<DocItem> = {}): DocItem => ({
  path, name: path.slice(path.lastIndexOf('/') + 1), isDir, size: 0, modified: 0, childCount: 0,
  parent: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', ...extra,
})
const paths = (l: Listing | undefined) => (l?.items ?? []).map(i => i.path).sort()

/** A fake server: `tree` is what each folder lists now; every request waits until released. */
function harness(tree: Record<string, DocItem[]>) {
  let clock = 1_000
  const calls: { path: string; resolve: () => void; reject: (e: unknown) => void }[] = []
  const cache = new FolderCache(path => new Promise<Listing>((resolve, reject) => {
    const snapshot = [...(tree[path] ?? [])]
    calls.push({ path, resolve: () => resolve({ items: snapshot, disk: null }), reject })
  }), { now: () => clock })
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
  return {
    cache,
    calls,
    tick: (ms: number) => { clock += ms },
    /** Answers the oldest unanswered request (optionally for `path`). */
    answer: async (path?: string) => {
      const i = calls.findIndex(c => path === undefined || c.path === path)
      const [c] = calls.splice(i, 1)
      c.resolve()
      await flush()
    },
    fail: async (e: unknown, path?: string) => {
      const i = calls.findIndex(c => path === undefined || c.path === path)
      const [c] = calls.splice(i, 1)
      c.reject(e)
      await flush()
    },
    flush,
  }
}

describe('documents folder cache', () => {
  it('misses, loads, then hits; concurrent loads share one request', async () => {
    const h = harness({ a: [item('a/x'), item('a/y')] })
    expect(h.cache.get('a')).toBeUndefined()
    const p1 = h.cache.load('a')
    const p2 = h.cache.load('a')
    expect(h.calls).toHaveLength(1)
    await h.answer()
    expect(await p1).toBe(await p2)
    expect(paths(h.cache.get('a'))).toEqual(['a/x', 'a/y'])
    expect(h.cache.isFresh('a', 2_000)).toBe(true)
    h.tick(2_500)
    expect(h.cache.isFresh('a', 2_000)).toBe(false)
  })

  it('notifies subscribers on change and bumps the version', async () => {
    const h = harness({ a: [item('a/x')] })
    let n = 0
    const off = h.cache.subscribe(() => n++)
    const v0 = h.cache.getVersion()
    void h.cache.load('a')
    await h.answer()
    expect(n).toBe(1)
    expect(h.cache.getVersion()).toBe(v0 + 1)
    off()
    h.cache.patch('a', items => items.filter(() => false))
    expect(n).toBe(1)
  })

  it('stale-while-revalidate: an unchanged answer keeps the same listing object (nothing re-renders)', async () => {
    const tree = { a: [item('a/x'), item('a/y', false, { size: 5 })] }
    const h = harness(tree)
    void h.cache.load('a')
    await h.answer()
    const first = h.cache.get('a')
    let n = 0
    h.cache.subscribe(() => n++)
    void h.cache.load('a', { force: true })
    await h.answer()
    expect(h.cache.get('a')).toBe(first)
    expect(n).toBe(0)
    // One file changed: new listing, but the untouched item object is reused.
    tree.a = [item('a/x'), item('a/y', false, { size: 9 })]
    void h.cache.load('a', { force: true })
    await h.answer()
    const next = h.cache.get('a')
    expect(next).not.toBe(first)
    expect(next?.items.find(i => i.path === 'a/x')).toBe(first?.items.find(i => i.path === 'a/x'))
    expect(n).toBe(1)
  })

  it('an older answer never replaces a newer one', async () => {
    const tree: Record<string, DocItem[]> = { a: [item('a/old')] }
    const h = harness(tree)
    void h.cache.load('a')
    h.tick(10)
    tree.a = [item('a/new')]
    void h.cache.load('a', { force: true })
    await h.answer() // the first (older) request answers first: committed
    expect(paths(h.cache.get('a'))).toEqual(['a/old'])
    await h.answer() // then the newer one
    expect(paths(h.cache.get('a'))).toEqual(['a/new'])
    // Reversed order: the late old answer is ignored.
    h.tick(10)
    tree.a = [item('a/older')]
    void h.cache.load('a', { force: true })
    h.tick(10)
    tree.a = [item('a/newest')]
    void h.cache.load('a', { force: true })
    const [older, newest] = h.calls.splice(0)
    newest.resolve(); await h.flush()
    older.resolve(); await h.flush()
    expect(paths(h.cache.get('a'))).toEqual(['a/newest'])
  })

  it('optimistic additions show at once and survive a refetch that started before them', async () => {
    const h = harness({ a: [item('a/x')], '': [item('a', true, { childCount: 1 })] })
    void h.cache.load('a'); await h.answer()
    void h.cache.load(''); await h.answer()
    void h.cache.load('a', { force: true }) // started before the upload is stored
    h.tick(5)
    h.cache.addLocal([item('a/new.pdf', false, { size: 10 })])
    expect(paths(h.cache.get('a'))).toEqual(['a/new.pdf', 'a/x'])
    // The parent's listing shows a's item count: it goes stale.
    expect(h.cache.isFresh('', PREFETCH_FRESH)).toBe(false)
    await h.answer('a') // server doesn't list it yet
    expect(paths(h.cache.get('a'))).toEqual(['a/new.pdf', 'a/x'])
  })

  it('additions into an uncached folder wait for its listing', async () => {
    const h = harness({ b: [item('b/old')] })
    h.cache.addLocal([item('b/up.txt')])
    expect(h.cache.get('b')).toBeUndefined()
    h.tick(1)
    void h.cache.load('b')
    await h.answer()
    // The request started after the addition, so the server's answer settles it.
    expect(paths(h.cache.get('b'))).toEqual(['b/old'])
  })

  it('moves and deletes take items out, drop their own listings and stale the counts above', async () => {
    const h = harness({
      '': [item('a', true)], a: [item('a/sub', true), item('a/f')], 'a/sub': [item('a/sub/deep')],
    })
    for (const p of ['', 'a', 'a/sub']) { void h.cache.load(p); await h.answer() }
    h.cache.removeItems(['a/sub'])
    expect(paths(h.cache.get('a'))).toEqual(['a/f'])
    expect(h.cache.get('a/sub')).toBeUndefined()
    expect(h.cache.isFresh('', PREFETCH_FRESH)).toBe(false) // a's count changed
    expect(h.cache.isFresh('a', PREFETCH_FRESH)).toBe(true)
  })

  it('a patch drops answers to requests that started before it', async () => {
    const tree = { a: [item('a/old-name')] }
    const h = harness(tree)
    void h.cache.load('a'); await h.answer()
    void h.cache.load('a', { force: true }) // in flight, will still list the old name
    h.tick(5)
    h.cache.patch('a', items => items.map(i => ({ ...i, path: 'a/new-name', name: 'new-name' })))
    await h.answer()
    expect(paths(h.cache.get('a'))).toEqual(['a/new-name'])
    // A load after the patch doesn't join the stale request.
    tree.a = [item('a/new-name')]
    void h.cache.load('a')
    expect(h.calls).toHaveLength(1)
    await h.answer()
    expect(paths(h.cache.get('a'))).toEqual(['a/new-name'])
  })

  it('renamed folders are dropped with everything beneath them', async () => {
    const h = harness({ a: [], 'a/b': [], ab: [] })
    for (const p of ['a', 'a/b', 'ab']) { void h.cache.load(p); await h.answer() }
    h.cache.dropTree('a')
    expect(h.cache.get('a')).toBeUndefined()
    expect(h.cache.get('a/b')).toBeUndefined()
    expect(h.cache.get('ab')).toBeDefined()
  })

  it('a 404 forgets the folder; other errors keep the cached copy', async () => {
    const h = harness({ a: [item('a/x')] })
    void h.cache.load('a'); await h.answer()
    const kept = h.cache.load('a', { force: true })
    await h.fail(new DocsApiError('boom', 500))
    await expect(kept).rejects.toThrow('boom')
    expect(h.cache.get('a')).toBeDefined()
    const gone = h.cache.load('a', { force: true })
    await h.fail(new DocsApiError('Not found', 404))
    await expect(gone).rejects.toThrow('Not found')
    expect(h.cache.get('a')).toBeUndefined()
  })

  it('prefetch: two at a time, hover jumps the queue, fresh or loading folders are skipped', async () => {
    const h = harness({ a: [], b: [], c: [], d: [], e: [] })
    h.cache.prefetch('a', 'low')
    h.cache.prefetch('b', 'low')
    h.cache.prefetch('c', 'low')
    h.cache.prefetch('d', 'low')
    expect(h.calls.map(c => c.path)).toEqual(['a', 'b'])
    h.cache.prefetch('e', 'high')
    expect(h.cache.queuedPaths()).toEqual(['e', 'c', 'd'])
    h.cache.prefetch('a', 'high') // already loading
    expect(h.cache.queuedPaths()).toEqual(['e', 'c', 'd'])
    await h.answer('a')
    await h.flush()
    expect(h.calls.map(c => c.path)).toEqual(['b', 'e'])
    h.cache.cancelQueued('low')
    expect(h.cache.queuedPaths()).toEqual([])
    h.cache.prefetch('a') // fresh
    expect(h.cache.queuedPaths()).toEqual([])
    expect(h.calls).toHaveLength(2)
  })

  it('reconcileListing reuses unchanged items and arrays', () => {
    const prev: Listing = { items: [item('x'), item('y')], disk: { usedBytes: 1, totalBytes: 2 } }
    expect(reconcileListing(prev, { items: [item('x'), item('y')], disk: { usedBytes: 1, totalBytes: 2 } })).toBe(prev)
    const next = reconcileListing(prev, { items: [item('x'), item('z')], disk: { usedBytes: 1, totalBytes: 2 } })
    expect(next).not.toBe(prev)
    expect(next.items[0]).toBe(prev.items[0])
    expect(next.disk).toBe(prev.disk)
    expect(reconcileListing(undefined, prev)).toBe(prev)
  })
})

describe('documents navigation direction', () => {
  it('into a folder (or deeper) goes down, to an ancestor goes up', () => {
    expect(navDirection('', 'a')).toBe('down')
    expect(navDirection('a', 'a/b')).toBe('down')
    expect(navDirection('a', 'a/b/c')).toBe('down')
    expect(navDirection('a/b/c', 'a')).toBe('up')
    expect(navDirection('a/b', '')).toBe('up')
  })
  it('siblings, unrelated folders and look-alike prefixes slide nowhere', () => {
    expect(navDirection('a/b', 'a/c')).toBe('none')
    expect(navDirection('a', 'ab')).toBe('none')
    expect(navDirection('ab', 'a')).toBe('none')
    expect(navDirection('a', 'a')).toBe('none')
  })
  it('slides from the right going down, from the left going up', () => {
    expect(slideFrom('down')).toBeGreaterThan(0)
    expect(slideFrom('up')).toBeLessThan(0)
    expect(slideFrom('none')).toBe(0)
    expect(Math.abs(slideFrom('down'))).toBeGreaterThanOrEqual(8)
    expect(Math.abs(slideFrom('down'))).toBeLessThanOrEqual(12)
  })
  it('scroll memory per folder, forgotten with the folder', () => {
    const m = new ScrollMemory(3)
    m.remember('a', 120.4)
    m.remember('a/b', 50)
    m.remember('c', 7)
    expect(m.recall('a')).toBe(120)
    m.forget('a')
    expect(m.recall('a')).toBeUndefined()
    expect(m.recall('a/b')).toBeUndefined()
    expect(m.recall('c')).toBe(7)
    for (const k of ['d', 'e', 'f']) m.remember(k, 1)
    expect(m.recall('c')).toBeUndefined() // capped
  })
})
