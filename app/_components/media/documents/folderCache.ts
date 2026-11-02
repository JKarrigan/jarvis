// Per-tab, in-memory cache of folder listings for the Documents browser. Navigation
// reads it first (a cached folder shows in the same frame) and revalidates in the
// background (stale-while-revalidate); hovering or pressing a folder, the parent of the
// folder shown and its visible subfolders are prefetched into it through a small queue.
// Edits (uploads, renames, moves, deletes) patch or invalidate the affected entries.
// React-free so tests can drive it; `useFolder` subscribes to it.

import { DocsApiError, isWithin, listFolder, parentOf, type DiskInfo, type DocItem } from './api'
import { mergeListing, upsertItems, type PendingItem } from './uploadPlan'

/** One folder's contents as the server last listed it (plus local edits). Immutable. */
export interface Listing {
  readonly items: DocItem[]
  readonly disk: DiskInfo | null
}

export type ListingFetcher = (path: string) => Promise<Listing>
export type PrefetchPriority = 'high' | 'low'

interface Entry {
  listing: Listing
  /** When the listing was confirmed by the server (0 = stale: an edit changed what it should hold). */
  fetchedAt: number
  /** When the request behind it started (an older answer never replaces a newer one). */
  startedAt: number
}

/** A navigation to a cached folder refetches it when it's older than this (ms). */
export const REVALIDATE_AFTER = 2_000
/** A prefetch skips folders confirmed within this window (ms). */
export const PREFETCH_FRESH = 15_000

export interface FolderCacheOptions {
  now?: () => number
  /** Folders kept (least recently stored dropped first). */
  max?: number
  /** Prefetches in flight at once (navigation loads don't wait for the queue). */
  concurrency?: number
}

const sameItem = (a: DocItem, b: DocItem) =>
  a.path === b.path && a.name === b.name && a.isDir === b.isDir && a.size === b.size
  && a.modified === b.modified && a.childCount === b.childCount && a.parent === b.parent

const sameDisk = (a: DiskInfo | null, b: DiskInfo | null) =>
  a === b || (a !== null && b !== null && a.usedBytes === b.usedBytes && a.totalBytes === b.totalBytes)

/**
 * `next` with every unchanged item (and the arrays themselves, when nothing changed)
 * taken from `prev`, so a revalidation that finds the same folder re-renders nothing.
 */
export function reconcileListing(prev: Listing | undefined, next: Listing): Listing {
  if (!prev) return next
  const byPath = new Map(prev.items.map(i => [i.path, i]))
  let changed = prev.items.length !== next.items.length
  const items = next.items.map((item, i) => {
    const old = byPath.get(item.path)
    const kept = old && sameItem(old, item) ? old : item
    if (kept !== prev.items[i]) changed = true
    return kept
  })
  const disk = sameDisk(prev.disk, next.disk) ? prev.disk : next.disk
  if (!changed && disk === prev.disk) return prev
  return { items: changed ? items : prev.items, disk }
}

export class FolderCache {
  private readonly entries = new Map<string, Entry>()
  /** Answers to requests started before this time are dropped (an edit made them stale). */
  private readonly floors = new Map<string, number>()
  private readonly inflight = new Map<string, { startedAt: number; promise: Promise<Listing> }>()
  /** Optimistic additions waiting for a listing that started after them to confirm them. */
  private pending: PendingItem[] = []
  private queue: { path: string; priority: PrefetchPriority }[] = []
  private active = 0
  private readonly listeners = new Set<() => void>()
  private version = 0
  private readonly now: () => number
  private readonly max: number
  private readonly concurrency: number

  constructor(private readonly fetcher: ListingFetcher, opts: FolderCacheOptions = {}) {
    this.now = opts.now ?? Date.now
    this.max = opts.max ?? 300
    this.concurrency = opts.concurrency ?? 2
  }

  // --- store (useSyncExternalStore) ---------------------------------------------------

  readonly subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  readonly getVersion = () => this.version

  private emit() {
    this.version++
    for (const l of [...this.listeners]) l()
  }

  // --- reads --------------------------------------------------------------------------

  get(path: string): Listing | undefined {
    return this.entries.get(path)?.listing
  }

  /** Cached and confirmed by the server within `maxAge` ms (stale entries never are). */
  isFresh(path: string, maxAge: number): boolean {
    const e = this.entries.get(path)
    return Boolean(e && e.fetchedAt > 0 && this.now() - e.fetchedAt < maxAge)
  }

  isLoading(path: string): boolean {
    return this.inflight.has(path)
  }

  /**
   * Fetches `path` into the cache; concurrent calls share one request unless `force`
   * (after an edit: the answer must reflect it). Resolves to the cached listing. A 404
   * drops the entry (the folder is gone); other errors leave the cached copy in place.
   */
  load(path: string, { force = false }: { force?: boolean } = {}): Promise<Listing> {
    const running = this.inflight.get(path)
    if (running && !force && running.startedAt >= (this.floors.get(path) ?? 0)) return running.promise
    const startedAt = this.now()
    const promise: Promise<Listing> = this.fetcher(path).then(
      listing => {
        this.settle(path, promise)
        return this.commit(path, startedAt, listing)
      },
      (err: unknown) => {
        this.settle(path, promise)
        if (err instanceof DocsApiError && err.status === 404) this.dropTree(path)
        throw err
      },
    )
    this.inflight.set(path, { startedAt, promise })
    return promise
  }

  private settle(path: string, promise: Promise<Listing>) {
    if (this.inflight.get(path)?.promise === promise) this.inflight.delete(path)
  }

  private commit(path: string, startedAt: number, server: Listing): Listing {
    const old = this.entries.get(path)
    if (startedAt < (this.floors.get(path) ?? 0) || (old && startedAt < old.startedAt)) return old?.listing ?? server
    const mine = this.pending.filter(p => p.item.parent === path)
    const merged = mergeListing(server.items, mine, startedAt)
    this.pending = [...this.pending.filter(p => p.item.parent !== path), ...merged.pending]
    const listing = reconcileListing(old?.listing, { items: merged.items, disk: server.disk })
    this.entries.delete(path)
    this.entries.set(path, { listing, fetchedAt: this.now(), startedAt })
    this.evict()
    if (listing !== old?.listing) this.emit()
    return listing
  }

  private evict() {
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  // --- prefetch -----------------------------------------------------------------------

  /**
   * Queues a background fetch unless the folder is fresh or already loading. `high`
   * (a hover or press: the user is about to open it) jumps the queue; `low` (idle
   * prefetch of what's on screen) waits behind it. At most `concurrency` run at once.
   */
  prefetch(path: string, priority: PrefetchPriority = 'high') {
    if (this.inflight.has(path) || this.isFresh(path, PREFETCH_FRESH)) return
    const queued = this.queue.find(q => q.path === path)
    if (queued && (queued.priority === 'high' || priority === 'low')) return
    this.queue = this.queue.filter(q => q.path !== path)
    if (priority === 'high') this.queue.unshift({ path, priority })
    else this.queue.push({ path, priority })
    this.pump()
  }

  /** Drops queued (not yet started) low-priority prefetches: the view they were for is gone. */
  cancelQueued(priority: PrefetchPriority = 'low') {
    this.queue = this.queue.filter(q => q.priority !== priority)
  }

  /** Prefetches waiting for a slot (tests, diagnostics). */
  queuedPaths(): string[] {
    return this.queue.map(q => q.path)
  }

  private pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const next = this.queue.shift()
      if (!next) break
      if (this.inflight.has(next.path) || this.isFresh(next.path, PREFETCH_FRESH)) continue
      this.active++
      this.load(next.path)
        .catch(() => { /* a failed prefetch just leaves the folder uncached */ })
        .finally(() => {
          this.active--
          this.pump()
        })
    }
  }

  // --- edits --------------------------------------------------------------------------

  /** Local edit of a cached folder's items (rename in place). Older answers in flight are dropped. */
  patch(path: string, fn: (items: DocItem[]) => DocItem[]) {
    const e = this.entries.get(path)
    if (!e) return
    const items = fn(e.listing.items)
    if (items === e.listing.items) return
    this.floors.set(path, this.now())
    e.listing = { ...e.listing, items }
    this.emit()
  }

  /**
   * Optimistic additions (stored uploads, folders a drop created), into any cached
   * folder; they survive a refetch that started before them. The folder they went into
   * shows a new item count in its own parent, so that listing goes stale.
   */
  addLocal(items: DocItem[]) {
    if (items.length === 0) return
    const at = this.now()
    this.pending = [...this.pending.filter(p => !items.some(i => i.path === p.item.path)), ...items.map(item => ({ item, at }))]
    let changed = false
    for (const parent of new Set(items.map(i => i.parent))) {
      if (parent) this.markStale(parentOf(parent))
      const e = this.entries.get(parent)
      if (!e) continue
      e.listing = { ...e.listing, items: upsertItems(e.listing.items, items.filter(i => i.parent === parent)) }
      changed = true
    }
    if (changed) this.emit()
  }

  /** Moved or deleted items: gone from their folders now, their own listings dropped. */
  removeItems(paths: string[]) {
    for (const p of paths) {
      const parent = parentOf(p)
      this.patch(parent, items => (items.some(i => i.path === p) ? items.filter(i => i.path !== p) : items))
      if (parent) this.markStale(parentOf(parent))
      this.dropTree(p)
    }
  }

  /** The cached copy may be out of date: shown as is, refetched on the next visit or prefetch. */
  markStale(path: string) {
    const e = this.entries.get(path)
    if (e) e.fetchedAt = 0
  }

  /** Forgets a folder and everything beneath it (moved, renamed, deleted, or 404). */
  dropTree(path: string) {
    const at = this.now()
    let changed = false
    for (const key of [...this.entries.keys()]) {
      if (!isWithin(key, path)) continue
      this.entries.delete(key)
      this.floors.set(key, at)
      changed = true
    }
    this.pending = this.pending.filter(p => !isWithin(p.item.path, path))
    this.queue = this.queue.filter(q => !isWithin(q.path, path))
    if (changed) this.emit()
  }
}

/** The tab's listing cache. */
export const folderCache = new FolderCache(path => listFolder(path))
