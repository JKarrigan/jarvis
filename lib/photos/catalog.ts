import 'server-only'
import fs from 'fs'
import path from 'path'
import { CATALOG_REL, PHOTOS_ROOT, libraryMarkerPresent } from './config'
import { catalogTablesEmpty, getCatalogSnapshot, importCatalogSnapshot, tagTableEmpty, type CatalogSnapshot } from './db'

// Favorites, albums and tags are the only state that cannot be rebuilt from the files,
// so a copy lives on the NAS next to the photos: PHOTOS_ROOT/.library/catalog.json.
// `tags` (rel_path → tags) was added later; catalogs without it simply carry no tags.

const DEBOUNCE_MS = 5_000
const CATALOG_VERSION = 1

interface CatalogState { timer: ReturnType<typeof setTimeout> | null; lastBody: string | null; writing: Promise<void> | null }
const g = globalThis as typeof globalThis & { __photos_catalog?: CatalogState }
const state: CatalogState = (g.__photos_catalog ??= { timer: null, lastBody: null, writing: null })

const catalogAbs = () => path.join(PHOTOS_ROOT, CATALOG_REL)

/** Call after any change to favorites, albums, tags or the paths of items carrying them. */
export function markCatalogDirty(): void {
  if (state.timer) clearTimeout(state.timer)
  state.timer = setTimeout(() => {
    state.timer = null
    writeCatalogNow().catch(e => console.error('[photos] catalog write failed:', e))
  }, DEBOUNCE_MS)
  state.timer.unref?.()
}

/** Write the catalog if it changed. Skipped while the library is offline (never write onto a bare mount point). */
export async function writeCatalogNow(): Promise<boolean> {
  while (state.writing) await state.writing
  if (!(await libraryMarkerPresent())) return false
  const snap = getCatalogSnapshot()
  const body = snapshotBody(snap)
  if (body === state.lastBody) return false
  const run = (async () => {
    const dest = catalogAbs()
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    const doc = { version: CATALOG_VERSION, updatedAt: new Date().toISOString(), ...snap }
    const tmp = `${dest}.${process.pid}.tmp`
    await fs.promises.writeFile(tmp, JSON.stringify(doc, null, 2) + '\n')
    await fs.promises.rename(tmp, dest)
    state.lastBody = body
  })()
  state.writing = run
  try { await run } finally { state.writing = null }
  return true
}

/** What decides whether the file needs rewriting (the snapshot without timestamps). */
function snapshotBody(snap: CatalogSnapshot): string {
  return JSON.stringify({ favorites: snap.favorites, albums: snap.albums, tags: snap.tags }, null, 2)
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 4096
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)

function parseCatalog(raw: unknown): CatalogSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isStrArr(o.favorites) || !Array.isArray(o.albums)) return null
  const albums: CatalogSnapshot['albums'] = []
  for (const a of o.albums as unknown[]) {
    if (!a || typeof a !== 'object') continue
    const r = a as Record<string, unknown>
    if (!isStr(r.name) || !isStrArr(r.items)) continue
    albums.push({
      id: isStr(r.id) ? r.id : '',
      name: r.name.slice(0, 200),
      createdAt: typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : Date.now(),
      cover: isStr(r.cover) ? r.cover : null,
      items: r.items,
    })
  }
  const tags: CatalogSnapshot['tags'] = {}
  if (o.tags && typeof o.tags === 'object' && !Array.isArray(o.tags)) {
    for (const [rel, list] of Object.entries(o.tags as Record<string, unknown>)) {
      if (isStr(rel) && isStrArr(list)) tags[rel] = list
    }
  }
  return { favorites: o.favorites, albums, tags }
}

/**
 * Restore favorites + albums from the NAS when the local tables hold none, and tags when
 * no item has any (fresh Pi, restored SD card, or the first scan after tags shipped).
 * Call after indexing so rel_paths can be matched. Returns the number of rows touched
 * (0 when nothing was imported).
 */
export async function importCatalogIfEmpty(): Promise<number> {
  const parts = { library: catalogTablesEmpty(), tags: tagTableEmpty() }
  if (!parts.library && !parts.tags) return 0
  let text: string
  try { text = await fs.promises.readFile(catalogAbs(), 'utf8') } catch { return 0 }
  let snap: CatalogSnapshot | null = null
  try { snap = parseCatalog(JSON.parse(text)) } catch { /* corrupt */ }
  if (!snap) {
    console.warn('[photos] ignoring unreadable catalog', catalogAbs())
    return 0
  }
  const n = importCatalogSnapshot(snap, parts)
  // After a full import, what we hold is what's on disk; don't rewrite it. (A partial
  // import merged with local state, so the next change should write the file.)
  if (parts.library && parts.tags) state.lastBody = snapshotBody(getCatalogSnapshot())
  return n
}
