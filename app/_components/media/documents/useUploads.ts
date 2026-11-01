'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { listFolder } from './api'
import { keepBothName } from './fileKinds'

export type UploadState = 'queued' | 'uploading' | 'done' | 'conflict' | 'error' | 'cancelled' | 'skipped'

export interface UploadEntry {
  id: string
  file: File
  /** Target folder ('' = root). */
  dir: string
  /** Name it is stored under (differs from file.name after "Keep both"). */
  name: string
  state: UploadState
  loaded: number
  total: number
  error?: string
}

/** Two files at a time: keeps the Pi's SD card / the NAS link busy without swamping either. */
const CONCURRENCY = 2

export const IN_FLIGHT: ReadonlySet<UploadState> = new Set(['queued', 'uploading'])

/**
 * Upload queue: one XHR per file (real per-file progress and a per-file 409), two in
 * flight. A name that already exists stops as a `conflict` the user resolves with Keep
 * both (uploads as "name 2.ext") or Skip; failures stay with Retry; Cancel all aborts
 * everything. `onUploaded(dir)` fires after each stored file so the view can refresh.
 * Warns before unload while anything is still queued or uploading.
 */
export function useUploads(onUploaded: (dir: string) => void) {
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const list = useRef<UploadEntry[]>([])
  const xhrs = useRef(new Map<string, XMLHttpRequest>())
  const uploadedRef = useRef(onUploaded)
  useEffect(() => { uploadedRef.current = onUploaded }, [onUploaded])
  const seq = useRef(0)

  const commit = useCallback((next: UploadEntry[]) => {
    list.current = next
    setEntries(next)
  }, [])
  const patch = useCallback((id: string, p: Partial<UploadEntry>) => {
    commit(list.current.map(e => (e.id === id ? { ...e, ...p } : e)))
  }, [commit])

  const pumpRef = useRef<() => void>(() => {})

  const send = useCallback((entry: UploadEntry) => {
    const xhr = new XMLHttpRequest()
    xhrs.current.set(entry.id, xhr)
    patch(entry.id, { state: 'uploading', loaded: 0, error: undefined })
    const finish = (p: Partial<UploadEntry>) => {
      xhrs.current.delete(entry.id)
      patch(entry.id, p)
      pumpRef.current()
    }
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) patch(entry.id, { loaded: Math.min(entry.total, (ev.loaded / ev.total) * entry.total) })
    }
    xhr.onload = () => {
      let body: { error?: string; conflicts?: string[] } = {}
      try { body = JSON.parse(xhr.responseText) as typeof body } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        finish({ state: 'done', loaded: entry.total })
        uploadedRef.current(entry.dir)
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
  }, [patch])

  const pump = useCallback(() => {
    let running = list.current.filter(e => e.state === 'uploading').length
    for (const e of list.current) {
      if (running >= CONCURRENCY) break
      if (e.state === 'queued' && !xhrs.current.has(e.id)) {
        running++
        send(e)
      }
    }
  }, [send])
  useEffect(() => { pumpRef.current = pump }, [pump])

  const add = useCallback((files: File[], dir: string) => {
    if (files.length === 0) return
    const fresh = files.map((file): UploadEntry => ({
      id: `u${++seq.current}`,
      file,
      dir,
      name: file.name,
      state: 'queued',
      loaded: 0,
      total: file.size,
    }))
    // Finished rows from an earlier batch make way for the new one.
    commit([...list.current.filter(e => IN_FLIGHT.has(e.state) || e.state === 'conflict' || e.state === 'error'), ...fresh])
    pump()
  }, [commit, pump])

  const retry = useCallback((id: string) => {
    patch(id, { state: 'queued', loaded: 0, error: undefined })
    pump()
  }, [patch, pump])

  const keepBoth = useCallback(async (id: string) => {
    const entry = list.current.find(e => e.id === id)
    if (!entry) return
    patch(id, { error: 'Finding a free name…' })
    try {
      const { items } = await listFolder(entry.dir)
      // Also avoid names other queued uploads to this folder are about to take.
      const taken = [
        ...items.map(i => i.name),
        ...list.current.filter(e => e.dir === entry.dir && e.id !== id && e.state !== 'skipped' && e.state !== 'cancelled').map(e => e.name),
      ]
      patch(id, { name: keepBothName(entry.name, taken), state: 'queued', loaded: 0, error: undefined })
      pump()
    } catch {
      patch(id, { state: 'conflict', error: 'Couldn’t check the folder — try again' })
    }
  }, [patch, pump])

  const skip = useCallback((id: string) => patch(id, { state: 'skipped', error: undefined }), [patch])

  const cancel = useCallback((id: string) => {
    const xhr = xhrs.current.get(id)
    if (xhr) xhr.abort()
    else patch(id, { state: 'cancelled' })
  }, [patch])

  const cancelAll = useCallback(() => {
    commit(list.current.map(e => (e.state === 'queued' || e.state === 'conflict' ? { ...e, state: 'cancelled' } : e)))
    for (const xhr of [...xhrs.current.values()]) xhr.abort()
  }, [commit])

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

  return { entries, running, add, retry, keepBoth, skip, cancel, cancelAll, dismiss }
}
