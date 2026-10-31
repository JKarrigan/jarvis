import 'server-only'
import fs from 'fs'
import path from 'path'
import { CATALOG_REL, PHOTOS_ROOT, libraryMarkerPresent } from './config'
import { catalogTablesEmpty, getCatalogSnapshot, importCatalogSnapshot, type CatalogSnapshot } from './db'

// Favorites and albums are the only state that cannot be rebuilt from the files,
// so a copy lives on the NAS next to the photos: PHOTOS_ROOT/.library/catalog.json.

const DEBOUNCE_MS = 5_000
const CATALOG_VERSION = 1

interface CatalogState { timer: ReturnType<typeof setTimeout> | null; lastBody: string | null; writing: Promise<void> | null }
const g = globalThis as typeof globalThis & { __photos_catalog?: CatalogState }
const state: CatalogState = (g.__photos_catalog ??= { timer: null, lastBody: null, writing: null })

const catalogAbs = () => path.join(PHOTOS_ROOT, CATALOG_REL)

/** Call after any change to favorites, albums or the paths of favorited/album items. */
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
  const body = JSON.stringify({ favorites: snap.favorites, albums: snap.albums }, null, 2)
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
  return { favorites: o.favorites, albums }
}

/**
 * Restore favorites + albums from the NAS when the local tables hold none
 * (fresh Pi, restored SD card). Call after indexing so rel_paths can be matched.
 * Returns the number of rows touched (0 when nothing was imported).
 */
export async function importCatalogIfEmpty(): Promise<number> {
  if (!catalogTablesEmpty()) return 0
  let text: string
  try { text = await fs.promises.readFile(catalogAbs(), 'utf8') } catch { return 0 }
  let snap: CatalogSnapshot | null = null
  try { snap = parseCatalog(JSON.parse(text)) } catch { /* corrupt */ }
  if (!snap) {
    console.warn('[photos] ignoring unreadable catalog', catalogAbs())
    return 0
  }
  const n = importCatalogSnapshot(snap)
  // What we just imported is what's on disk; don't rewrite it.
  const now = getCatalogSnapshot()
  state.lastBody = JSON.stringify({ favorites: now.favorites, albums: now.albums }, null, 2)
  return n
}
