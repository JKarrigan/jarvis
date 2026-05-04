'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import type { HueLight, HueGroup } from '@/lib/types'
import {
  type LightState,
  briPct,
  sliderFill,
  lightDisplayColor,
  Toggle,
  Sheet,
  SliderRow,
  LightMiniCard,
  LightModal,
  RoomModal,
} from '@/app/_components/HueControls'

interface LightsData {
  lights: HueLight[]
  groups: HueGroup[]
}

function RoomCard({
  group,
  onToggle,
  onBrightness,
  onSelect,
}: {
  group: HueGroup
  onToggle: (id: string, on: boolean) => void
  onBrightness: (id: string, bri: number) => void
  onSelect: (id: string) => void
}) {
  const [localBri, setLocalBri] = useState(group.brightness)
  const [pending, setPending] = useState(false)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!pending) setLocalBri(group.brightness)
  }, [group.brightness, pending])

  function handleBriChange(val: number) {
    setLocalBri(val)
    setPending(true)
    if (commitTimer.current) clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(() => {
      onBrightness(group.id, val)
      setPending(false)
    }, 300)
  }

  return (
    <div
      onClick={() => onSelect(group.id)}
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3 cursor-pointer hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100 truncate">{group.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{group.type} · {group.lightIds.length} light{group.lightIds.length !== 1 ? 's' : ''}</p>
        </div>
        <div onClick={e => e.stopPropagation()}>
          <Toggle on={group.on} disabled={false} onToggle={() => onToggle(group.id, !group.on)} />
        </div>
      </div>
      {group.on && (
        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
          <input
            type="range"
            min={1}
            max={254}
            value={localBri}
            onChange={e => handleBriChange(Number(e.target.value))}
            style={sliderFill(localBri, 1, 254)}
            className="flex-1 accent-slider"
          />
          <span className="text-xs font-mono text-zinc-400 w-9 text-right">{briPct(localBri)}</span>
        </div>
      )}
    </div>
  )
}

function LightCard({
  light,
  selected,
  onToggle,
  onSelect,
}: {
  light: HueLight
  selected: boolean
  onToggle: (id: string, on: boolean) => void
  onSelect: (id: string) => void
}) {
  return (
    <div
      onClick={() => light.reachable && onSelect(light.id)}
      className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
        !light.reachable
          ? 'border-zinc-800/50 bg-zinc-900/30 opacity-50 cursor-default'
          : selected
          ? 'border-amber-400/70 bg-amber-500/10 cursor-pointer'
          : light.on
          ? 'cursor-pointer'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 cursor-pointer'
      }`}
      style={light.on && !selected && light.reachable ? {
        borderColor: lightDisplayColor(light, 0.65),
        backgroundColor: lightDisplayColor(light, 0.22),
      } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100 truncate">{light.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5 truncate">{light.type}</p>
        </div>
        <div onClick={e => e.stopPropagation()}>
          <Toggle
            on={light.on}
            disabled={!light.reachable}
            onToggle={() => onToggle(light.id, !light.on)}
          />
        </div>
      </div>
      {!light.reachable && <p className="text-xs text-zinc-600">Unreachable</p>}
      {light.on && light.reachable && (
        <p className="text-xs text-zinc-500 font-mono">{briPct(light.brightness)}</p>
      )}
    </div>
  )
}

// Keep SliderRow available for any future use — it's re-exported from HueControls
export { SliderRow }

type PendingState = Partial<Pick<HueLight, 'on' | 'brightness' | 'colorTemp' | 'hue' | 'saturation'>>

export default function LightsPage() {
  const [data, setData] = useState<LightsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [lightModalSource, setLightModalSource] = useState<'grid' | 'room'>('grid')

  const pendingRef = useRef<Map<string, { state: PendingState; until: number }>>(new Map())

  function addPending(key: string, ps: PendingState, ms = 1500) {
    pendingRef.current.set(key, { state: ps, until: Date.now() + ms })
  }

  function mergePending(incoming: LightsData): LightsData {
    const now = Date.now()
    return {
      lights: incoming.lights.map(l => {
        const p = pendingRef.current.get(`l:${l.id}`)
        if (p && now < p.until) return { ...l, ...p.state }
        pendingRef.current.delete(`l:${l.id}`)
        return l
      }),
      groups: incoming.groups.map(g => {
        const p = pendingRef.current.get(`g:${g.id}`)
        if (p && now < p.until) return { ...g, ...p.state }
        pendingRef.current.delete(`g:${g.id}`)
        return g
      }),
    }
  }

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/lights')
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        setError(j.error ?? 'Failed to load lights')
        return
      }
      const j = await res.json() as LightsData
      setData(j)
      setError(null)

    } catch {
      setError('Could not reach lights API')
    }
  }, [])

  useEffect(() => {
    fetchData()

    const es = new EventSource('/api/lights/stream')
    es.onmessage = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data as string) as LightsData
        setData(mergePending(d))
  
        setError(null)
      } catch { /* malformed event */ }
    }
    return () => es.close()
  }, [fetchData])

  useEffect(() => {
    document.body.style.overflow =
      selectedGroupId !== null || selectedLightId !== null ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [selectedGroupId, selectedLightId])

  useEffect(() => {
    if (selectedGroupId && data && !data.groups.find(g => g.id === selectedGroupId)) {
      setSelectedGroupId(null)
      setSelectedLightId(null)
    }
  }, [data, selectedGroupId])

  async function handleGlobalToggle() {
    if (!data) return
    const next = !data.lights.some(l => l.on)
    data.lights.forEach(l => addPending(`l:${l.id}`, { on: next }))
    data.groups.forEach(g => addPending(`g:${g.id}`, { on: next }))
    setData(d => d ? {
      ...d,
      lights: d.lights.map(l => ({ ...l, on: next })),
      groups: d.groups.map(g => ({ ...g, on: next })),
    } : d)
    try {
      await fetch('/api/lights/groups/0', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: next }),
      })
    } catch {
      data.lights.forEach(l => pendingRef.current.delete(`l:${l.id}`))
      data.groups.forEach(g => pendingRef.current.delete(`g:${g.id}`))
      fetchData()
    }
  }

  async function handleGroupToggle(id: string, on: boolean) {
    addPending(`g:${id}`, { on })
    setData(d => d ? { ...d, groups: d.groups.map(g => g.id === id ? { ...g, on } : g) } : d)
    try {
      await fetch(`/api/lights/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }),
      })
    } catch {
      pendingRef.current.delete(`g:${id}`)
    }
  }

  async function handleGroupBrightness(id: string, brightness: number) {
    addPending(`g:${id}`, { brightness })
    setData(d => d ? { ...d, groups: d.groups.map(g => g.id === id ? { ...g, brightness } : g) } : d)
    try {
      await fetch(`/api/lights/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brightness }),
      })
    } catch {
      pendingRef.current.delete(`g:${id}`)
    }
  }

  async function handleLightToggle(id: string, on: boolean) {
    addPending(`l:${id}`, { on })
    setData(d => d ? { ...d, lights: d.lights.map(l => l.id === id ? { ...l, on } : l) } : d)
    try {
      await fetch(`/api/lights/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }),
      })
    } catch {
      pendingRef.current.delete(`l:${id}`)
    }
  }

  function handleLightSetState(id: string, state: LightState) {
    addPending(`l:${id}`, state)
    setData(d => d ? { ...d, lights: d.lights.map(l => l.id === id ? { ...l, ...state } : l) } : d)
    fetch(`/api/lights/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => { pendingRef.current.delete(`l:${id}`) })
  }

  function handleSelect(id: string, source: 'grid' | 'room' = 'grid') {
    setSelectedLightId(prev => (source === 'grid' && prev === id) ? null : id)
    setLightModalSource(source)
  }

  const selectedLight = data?.lights.find(l => l.id === selectedLightId) ?? null
  const selectedGroup = data?.groups.find(g => g.id === selectedGroupId) ?? null
  const isNotConfigured = error?.toLowerCase().includes('not configured')

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="p-6 space-y-8 max-w-2xl mx-auto w-full">
        {isNotConfigured ? (
          <div className="text-center space-y-3 pt-12">
            <p className="text-zinc-400 text-sm">Hue Bridge not configured.</p>
            <Link href="/settings" className="inline-block text-xs text-amber-400 hover:text-amber-300 transition-colors">
              Go to Settings to connect your Bridge →
            </Link>
          </div>
        ) : error ? (
          <div className="text-center pt-12">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : data === null ? (
          <div className="space-y-8">
            <div className="space-y-3">
              <div className="h-3 w-16 rounded bg-zinc-800 animate-pulse" />
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 h-20 animate-pulse" />
              ))}
            </div>
            <div className="space-y-3">
              <div className="h-3 w-24 rounded bg-zinc-800 animate-pulse" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 h-24 animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {data.lights.length > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-100">All Lights</p>
                <Toggle on={data.lights.some(l => l.on)} disabled={false} onToggle={handleGlobalToggle} />
              </div>
            )}

            {data.groups.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Rooms</h2>
                {data.groups.map(g => (
                  <RoomCard
                    key={g.id}
                    group={g}
                    onToggle={handleGroupToggle}
                    onBrightness={handleGroupBrightness}
                    onSelect={id => setSelectedGroupId(id)}
                  />
                ))}
              </section>
            )}

            {data.lights.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">All Lights</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.lights.map(l => (
                    <LightCard
                      key={l.id}
                      light={l}
                      selected={lightModalSource === 'grid' && selectedLightId === l.id}
                      onToggle={handleLightToggle}
                      onSelect={id => handleSelect(id, 'grid')}
                    />
                  ))}
                </div>
              </section>
            )}

            {data.groups.length === 0 && data.lights.length === 0 && (
              <p className="text-zinc-500 text-sm text-center pt-12">No lights found on your Bridge.</p>
            )}
          </>
        )}
      </main>

      <AnimatePresence>
        {selectedGroup && (
          <RoomModal
            key={selectedGroup.id}
            group={selectedGroup}
            lights={data!.lights.filter(l => selectedGroup.lightIds.includes(l.id))}
            selectedLightId={lightModalSource === 'room' ? selectedLightId : null}
            onClose={() => { setSelectedGroupId(null); setSelectedLightId(null) }}
            onGroupToggle={handleGroupToggle}
            onGroupBrightness={handleGroupBrightness}
            onLightToggle={handleLightToggle}
            onLightSelect={id => handleSelect(id, 'room')}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedLight && (
          <LightModal
            key={selectedLight.id}
            light={selectedLight}
            onClose={() => setSelectedLightId(null)}
            onSetState={state => handleLightSetState(selectedLight.id, state)}
            onToggle={() => handleLightToggle(selectedLight.id, !selectedLight.on)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
