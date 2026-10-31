'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ApiEntry } from '@/lib/fileTypes'
import { apiFetch, errorMessage, isAbort } from './api'

export type DiskInfo = { usedBytes: number; totalBytes: number }

type Listing = {
  key: string
  entries: ApiEntry[]
  error: string | null
}

const NO_ENTRIES: ApiEntry[] = []

/**
 * Directory listing keyed by path. A response is only ever shown for the path
 * it was fetched for (and in-flight requests are aborted on navigation), so a
 * slow listing can never overwrite the folder the user has since moved to —
 * which would make rename/delete/move act on the wrong path.
 */
export function useDirectory(pathKey: string) {
  const [listing, setListing] = useState<Listing | null>(null)
  const [disk, setDisk] = useState<DiskInfo | null>(null)
  const [reloadSeq, setReloadSeq] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    apiFetch(`/api/files/list?path=${encodeURIComponent(pathKey)}`, { signal: ctrl.signal })
      .then(res => res.json() as Promise<{ entries: ApiEntry[]; disk?: DiskInfo }>)
      .then(data => {
        setListing({ key: pathKey, entries: data.entries ?? [], error: null })
        if (data.disk) setDisk(data.disk)
      })
      .catch(e => {
        if (isAbort(e)) return
        setListing({ key: pathKey, entries: [], error: errorMessage(e) })
      })
    return () => ctrl.abort()
  }, [pathKey, reloadSeq])

  const reload = useCallback(() => setReloadSeq(n => n + 1), [])

  const current = listing?.key === pathKey ? listing : null
  return {
    entries: current?.entries ?? NO_ENTRIES,
    error: current?.error ?? null,
    loading: current === null,
    disk,
    reload,
  }
}
