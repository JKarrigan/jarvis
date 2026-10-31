'use client'

import { useEffect, useState } from 'react'
import type { SearchResult } from '@/lib/fileTypes'
import { apiFetch, isAbort } from './api'

const NO_RESULTS: SearchResult[] = []

/**
 * Debounced, abortable search. Results are stored with the query they answer,
 * so a slow response for an older query is never shown for the current one.
 */
export function useFileSearch(query: string) {
  const q = query.trim()
  const [search, setSearch] = useState<{ q: string; results: SearchResult[]; truncated: boolean } | null>(null)

  useEffect(() => {
    if (!q) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      apiFetch(`/api/files/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then(res => res.json() as Promise<{ results?: SearchResult[]; truncated?: boolean }>)
        .then(data => setSearch({ q, results: data.results ?? [], truncated: data.truncated === true }))
        .catch(e => { if (!isAbort(e)) setSearch({ q, results: [], truncated: false }) })
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  const current = q && search?.q === q ? search : null
  return {
    isSearching: q.length > 0,
    searchLoading: q.length > 0 && current === null,
    results: current?.results ?? NO_RESULTS,
    /** The server stopped at its result cap — there are more matches. */
    truncated: current?.truncated ?? false,
  }
}
