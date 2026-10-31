'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { HueLight, HueGroup } from '@/lib/types'

export interface LightsData {
  lights: HueLight[]
  groups: HueGroup[]
}

export type LightChange = Partial<Pick<HueLight, 'on' | 'brightness' | 'colorTemp' | 'hue' | 'saturation'>>
export type GroupChange = Partial<Pick<HueGroup, 'on' | 'brightness'>>

/** 'connecting' until the first snapshot, 'live' while streaming, 'reconnecting' after a drop. */
export type LightsConnection = 'connecting' | 'live' | 'reconnecting'

type PendingEntry = { state: LightChange; until: number }

/** How long an optimistic value overrides broadcasts after its request finished. */
const PENDING_HOLD_MS = 1500
/** Fallback reconnect when the browser gives up on the EventSource (non-SSE response). */
const RECONNECT_MS = 15_000

function applyPending<T extends { id: string }>(items: T[], prefix: 'l' | 'g', pending: Map<string, PendingEntry>, now: number): T[] {
  return items.map(item => {
    const key = `${prefix}:${item.id}`
    const p = pending.get(key)
    if (!p) return item
    if (now < p.until) return { ...item, ...p.state }
    pending.delete(key)
    return item
  })
}

/**
 * Live Hue state from /api/lights/stream plus optimistic actions.
 *
 * - Optimistic values are held per light/group ("pending") so a broadcast that
 *   predates the command can't flip a control back; they are held until the
 *   request finishes + PENDING_HOLD_MS.
 * - One request in flight per light/group; changes made meanwhile are merged and
 *   sent next (latest wins), so dragging never queues a backlog at the bridge.
 * - A rejected command (HTTP error or the bridge's own error) drops the
 *   optimistic value, re-fetches the real state and reports the message.
 */
export function useHueLights({ onActionError }: { onActionError?: (message: string) => void } = {}) {
  const [data, setData] = useState<LightsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [connection, setConnection] = useState<LightsConnection>('connecting')

  const pendingRef = useRef(new Map<string, PendingEntry>())
  const inflightRef = useRef(new Map<string, { next: Record<string, unknown> | null }>())
  const onErrorRef = useRef(onActionError)
  useEffect(() => { onErrorRef.current = onActionError })

  const mergePending = useCallback((incoming: LightsData): LightsData => {
    const now = Date.now()
    return {
      lights: applyPending(incoming.lights, 'l', pendingRef.current, now),
      groups: applyPending(incoming.groups, 'g', pendingRef.current, now),
    }
  }, [])

  // ── Stream ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    function connect() {
      es = new EventSource('/api/lights/stream')
      es.onmessage = (e: MessageEvent<string>) => {
        try {
          const d = JSON.parse(e.data) as LightsData
          setData(mergePending(d))
          setError(null)
          setNotConfigured(false)
          setConnection('live')
        } catch { /* malformed event */ }
      }
      // Server-reported problem; the server then closes and EventSource retries after `retry:`.
      es.addEventListener('hue-error', (e: MessageEvent<string>) => {
        try {
          const { error: msg, configured } = JSON.parse(e.data) as { error: string; configured: boolean }
          setNotConfigured(!configured)
          setError(msg)
        } catch { /* ignore */ }
        setConnection('reconnecting')
      })
      es.onerror = () => {
        setConnection(c => (c === 'connecting' ? c : 'reconnecting'))
        // CLOSED means the browser won't retry by itself (e.g. a non-SSE error response).
        if (es?.readyState === EventSource.CLOSED && !disposed) {
          setError(prev => prev ?? 'Lost connection to the lights service')
          es.close()
          retryTimer = setTimeout(connect, RECONNECT_MS)
        }
      }
    }
    connect()

    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      es?.close()
    }
  }, [mergePending])

  const resync = useCallback(async () => {
    try {
      const res = await fetch('/api/lights')
      if (!res.ok) return
      setData(mergePending(await res.json() as LightsData))
    } catch { /* the stream will catch up */ }
  }, [mergePending])

  // ── Commands ──────────────────────────────────────────────────────────────
  const addPending = useCallback((key: string, change: LightChange, until = Infinity) => {
    const prev = pendingRef.current.get(key)
    pendingRef.current.set(key, { state: { ...prev?.state, ...change }, until })
  }, [])

  const send = useCallback((keys: string[], url: string, body: Record<string, unknown>) => {
    const target = url
    const slot = inflightRef.current.get(target)
    if (slot) {
      slot.next = { ...slot.next, ...body }
      return
    }
    inflightRef.current.set(target, { next: null })

    const run = async (payload: Record<string, unknown>) => {
      let failure: string | null = null
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => null) as { error?: string } | null
          failure = j?.error ?? `Request failed (${res.status})`
        }
      } catch {
        failure = 'Could not reach the lights service'
      }

      const s = inflightRef.current.get(target)
      const next = s?.next ?? null
      if (failure) {
        // Roll back: forget optimistic values (including queued ones) and re-read the truth.
        inflightRef.current.delete(target)
        for (const k of keys) pendingRef.current.delete(k)
        onErrorRef.current?.(failure)
        void resync()
        return
      }
      if (next && s) {
        s.next = null
        void run(next)
        return
      }
      inflightRef.current.delete(target)
      const until = Date.now() + PENDING_HOLD_MS
      for (const k of keys) {
        const p = pendingRef.current.get(k)
        if (p) p.until = until
      }
    }
    void run(body)
  }, [resync])

  const setLight = useCallback((id: string, change: LightChange) => {
    addPending(`l:${id}`, change)
    setData(d => d ? { ...d, lights: d.lights.map(l => l.id === id ? { ...l, ...change } : l) } : d)
    send([`l:${id}`], `/api/lights/${id}`, change)
  }, [addPending, send])

  const setGroup = useCallback((id: string, change: GroupChange) => {
    addPending(`g:${id}`, change)
    setData(d => d ? { ...d, groups: d.groups.map(g => g.id === id ? { ...g, ...change } : g) } : d)
    send([`g:${id}`], `/api/lights/groups/${id}`, change)
  }, [addPending, send])

  /** Switch every light (group 0) on if none is on, otherwise off. */
  const toggleAll = useCallback(() => {
    if (!data) return
    const on = !data.lights.some(l => l.on)
    const keys = [...data.lights.map(l => `l:${l.id}`), ...data.groups.map(g => `g:${g.id}`)]
    for (const k of keys) addPending(k, { on })
    setData(d => d ? {
      ...d,
      lights: d.lights.map(l => ({ ...l, on })),
      groups: d.groups.map(g => ({ ...g, on })),
    } : d)
    send(keys, '/api/lights/groups/0', { on })
  }, [data, addPending, send])

  return { data, error, notConfigured, connection, setLight, setGroup, toggleAll }
}
