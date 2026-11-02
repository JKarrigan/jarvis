'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { DocsApiError, errorText, isWithin, joinPath, listFolder, makeFolder } from './api'
import { keepBothName } from './fileKinds'
import { planUploads, type DropTree } from './uploadPlan'

export type UploadState = 'queued' | 'uploading' | 'done' | 'conflict' | 'error' | 'cancelled' | 'skipped'

export interface UploadEntry {
  id: string
  file: File
  /** Target folder ('' = root). */
  dir: string
  /** Where the batch was dropped / picked into (the panel groups a folder drop's files under it). */
  root: string
  /** The target folder is created by this batch (a folder drop) and must exist before sending. */
  needsDir: boolean
  /** Name it is stored under (NFC; differs from file.name after "Keep both"). */
  name: string
  state: UploadState
  loaded: number
  total: number
  /** When it was queued (ms): its placeholder's "modified". */
  addedAt: number
  error?: string
}

export interface UploadCallbacks {
  /** A file was stored under `name` in `entry.dir` (patch the listing in place). */
  onStored: (entry: UploadEntry, name: string) => void
  /** A folder drop created (or found) `path`. */
  onFolder: (path: string) => void
  /** The queue has nothing left queued or uploading (one final refresh). */
  onDrained: () => void
}

/** Three at a time: keeps the NAS link busy without swamping the Pi. */
export const CONCURRENCY = 3

export const IN_FLIGHT: ReadonlySet<UploadState> = new Set(['queued', 'uploading'])

/**
 * Upload queue: one XHR per file (real per-file progress and a per-file 409), three in
 * flight, files in name order within each folder. Folder drops recreate their tree:
 * folders are made parents-first (mkdir is idempotent) before their files go up. A name
 * that already exists stops as a `conflict` the user resolves with Keep both (uploads as
 * "name 2.ext") or Skip — one by one or for the whole batch; failures stay with Retry;
 * Cancel all aborts everything. Warns before unload while anything is in flight.
 */
export function useUploads(callbacks: UploadCallbacks) {
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const list = useRef<UploadEntry[]>([])
  const xhrs = useRef(new Map<string, XMLHttpRequest>())
  const cbRef = useRef(callbacks)
  useEffect(() => { cbRef.current = callbacks }, [callbacks])
  const seq = useRef(0)
  /** mkdir per folder path, shared by every file waiting for it (dropped on failure so Retry re-tries). */
  const dirs = useRef(new Map<string, Promise<void>>())

  const commit = useCallback((next: UploadEntry[]) => {
    list.current = next
    setEntries(next)
  }, [])
  const patch = useCallback((id: string, p: Partial<UploadEntry>) => {
    commit(list.current.map(e => (e.id === id ? { ...e, ...p } : e)))
  }, [commit])

  const pumpRef = useRef<() => void>(() => {})

  /** Creates `path` and every missing ancestor below `root` (which exists), parents first. */
  const ensureDir = useCallback((path: string, root: string): Promise<void> => {
    if (path === root || !isWithin(path, root)) return Promise.resolve()
    const parts = (root ? path.slice(root.length + 1) : path).split('/')
    let chain: Promise<void> = Promise.resolve()
    for (let i = 1; i <= parts.length; i++) {
      const dir = joinPath(root, parts.slice(0, i).join('/'))
      let made = dirs.current.get(dir)
      if (!made) {
        const mine: Promise<void> = chain.then(() => makeFolder(dir)).then(() => { cbRef.current.onFolder(dir) })
        mine.catch(() => { if (dirs.current.get(dir) === mine) dirs.current.delete(dir) })
        dirs.current.set(dir, mine)
        made = mine
      }
      chain = made
    }
    return chain
  }, [])

  const drainCheck = useCallback(() => {
    if (!list.current.some(e => IN_FLIGHT.has(e.state))) cbRef.current.onDrained()
  }, [])

  const send = useCallback((entry: UploadEntry) => {
    const xhr = new XMLHttpRequest()
    xhrs.current.set(entry.id, xhr)
    patch(entry.id, { state: 'uploading', loaded: 0, error: undefined })
    const finish = (p: Partial<UploadEntry>) => {
      xhrs.current.delete(entry.id)
      patch(entry.id, p)
      pumpRef.current()
      drainCheck()
    }
    let lastPct = -1
    xhr.upload.onprogress = ev => {
      if (!ev.lengthComputable) return
      // Whole percents only: three uploads' progress events would otherwise re-render the listing ~60×/s.
      const pct = Math.floor((ev.loaded / ev.total) * 100)
      if (pct === lastPct) return
      lastPct = pct
      patch(entry.id, { loaded: Math.min(entry.total, (ev.loaded / ev.total) * entry.total) })
    }
    xhr.onload = () => {
      let body: { error?: string; saved?: string[] } = {}
      try { body = JSON.parse(xhr.responseText) as typeof body } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        const name = body.saved?.[0] ?? entry.name
        // Same tick as the state change, so the placeholder and the stored item swap in one render.
        cbRef.current.onStored(entry, name)
        finish({ state: 'done', loaded: entry.total, name })
      } else if (xhr.status === 409) {
        finish({ state: 'conflict', error: `“${entry.name}” already exists here` })
      } else if (xhr.status === 503) {
        finish({ state: 'error', error: 'Storage is offline' })
      } else {
        finish({ state: 'error', error: body.error || `Upload failed (${xhr.status})` })
      }
    }
    xhr.onerror = () => finish({ state: 'error', error: 'Network error' })
    xhr.onabort = () => finish({ state: 'cancelled' })
    const form = new FormData()
    form.append('files', entry.file, entry.name)
    xhr.open('POST', `/api/files/upload?${new URLSearchParams({ path: entry.dir })}`)
    xhr.send(form)
  }, [patch, drainCheck])

  const start = useCallback((entry: UploadEntry) => {
    if (!entry.needsDir) { send(entry); return }
    // Counts as running while its folder is made, so concurrency holds.
    patch(entry.id, { state: 'uploading', loaded: 0, error: undefined })
    ensureDir(entry.dir, entry.root).then(
      () => {
        const now = list.current.find(e => e.id === entry.id)
        if (now?.state === 'uploading' && !xhrs.current.has(entry.id)) send(now)
      },
      err => {
        const where = entry.dir.slice(entry.dir.lastIndexOf('/') + 1)
        patch(entry.id, { state: 'error', error: `Couldn’t create the folder “${where}”: ${errorText(err)}` })
        pumpRef.current()
        drainCheck()
      },
    )
  }, [send, patch, ensureDir, drainCheck])

  const pump = useCallback(() => {
    let running = list.current.filter(e => e.state === 'uploading').length
    for (const e of list.current) {
      if (running >= CONCURRENCY) break
      if (e.state === 'queued' && !xhrs.current.has(e.id)) {
        running++
        start(e)
      }
    }
  }, [start])
  useEffect(() => { pumpRef.current = pump }, [pump])

  /** Queues a drop or a file pick (every relDir '') into `target`. */
  const addTree = useCallback((tree: DropTree<File>, target: string) => {
    const plan = planUploads(target, tree)
    if (plan.uploads.length === 0 && plan.dirs.length === 0) return
    const now = Date.now()
    const made = new Set(plan.dirs)
    const fresh = plan.uploads.map(({ file, dir }): UploadEntry => ({
      id: `u${++seq.current}`,
      file,
      dir,
      root: target,
      needsDir: made.has(dir),
      name: file.name.normalize('NFC'),
      state: 'queued',
      loaded: 0,
      total: file.size,
      addedAt: now,
    }))
    // Folders (empty ones too) are made right away, parents first; their files wait on them.
    for (const d of plan.dirs) ensureDir(d, target).catch(() => { /* reported on the files that need it */ })
    // Finished rows from an earlier batch make way for the new one.
    commit([...list.current.filter(e => IN_FLIGHT.has(e.state) || e.state === 'conflict' || e.state === 'error'), ...fresh])
    pump()
  }, [commit, pump, ensureDir])

  const add = useCallback((files: File[], dir: string) => {
    addTree({ files: files.map(file => ({ file, relDir: '' })), dirs: [] }, dir)
  }, [addTree])

  const retry = useCallback((id: string) => {
    patch(id, { state: 'queued', loaded: 0, error: undefined })
    pump()
  }, [patch, pump])

  /** Free "name N.ext" names for `ids` (all conflicts in one folder share one listing). */
  const rename = useCallback(async (ids: string[]) => {
    const targets = list.current.filter(e => ids.includes(e.id))
    for (const id of ids) patch(id, { error: 'Finding a free name…' })
    const byDir = new Map<string, UploadEntry[]>()
    for (const e of targets) byDir.set(e.dir, [...(byDir.get(e.dir) ?? []), e])
    for (const [dir, group] of byDir) {
      try {
        const { items } = await listFolder(dir)
        // Also avoid names other uploads to this folder hold or are about to take.
        const taken = [
          ...items.map(i => i.name),
          ...list.current.filter(e => e.dir === dir && !ids.includes(e.id) && e.state !== 'skipped' && e.state !== 'cancelled').map(e => e.name),
        ]
        for (const e of group) {
          const name = keepBothName(e.name, taken)
          taken.push(name)
          patch(e.id, { name, state: 'queued', loaded: 0, error: undefined })
        }
      } catch (err) {
        const msg = err instanceof DocsApiError && err.offline ? 'Storage is offline' : 'Couldn’t check the folder — try again'
        for (const e of group) patch(e.id, { state: 'conflict', error: msg })
      }
    }
    pump()
  }, [patch, pump])

  const keepBoth = useCallback((id: string) => rename([id]), [rename])
  const keepBothAll = useCallback(() => rename(list.current.filter(e => e.state === 'conflict').map(e => e.id)), [rename])

  const skip = useCallback((id: string) => {
    patch(id, { state: 'skipped', error: undefined })
    drainCheck()
  }, [patch, drainCheck])
  const skipAll = useCallback(() => {
    commit(list.current.map(e => (e.state === 'conflict' ? { ...e, state: 'skipped', error: undefined } : e)))
    drainCheck()
  }, [commit, drainCheck])

  const cancel = useCallback((id: string) => {
    const xhr = xhrs.current.get(id)
    if (xhr) xhr.abort()
    else {
      patch(id, { state: 'cancelled' })
      pumpRef.current()
      drainCheck()
    }
  }, [patch, drainCheck])

  const cancelAll = useCallback(() => {
    commit(list.current.map(e => (e.state === 'queued' || e.state === 'conflict' || (e.state === 'uploading' && !xhrs.current.has(e.id))
      ? { ...e, state: 'cancelled' }
      : e)))
    for (const xhr of [...xhrs.current.values()]) xhr.abort()
    drainCheck()
  }, [commit, drainCheck])

  /** Clears the panel (only when nothing is in flight). */
  const dismiss = useCallback(() => {
    if (list.current.some(e => IN_FLIGHT.has(e.state))) return
    commit([])
  }, [commit])

  const running = entries.some(e => IN_FLIGHT.has(e.state))
  useEffect(() => {
    if (!running) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])

  // Abort whatever is still running when the page goes away (client navigation).
  useEffect(() => {
    const map = xhrs.current
    return () => { for (const xhr of map.values()) xhr.abort() }
  }, [])

  return { entries, running, add, addTree, retry, keepBoth, keepBothAll, skip, skipAll, cancel, cancelAll, dismiss }
}
