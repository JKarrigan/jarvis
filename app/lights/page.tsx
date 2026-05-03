'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { HsvColorPicker, type HsvColor } from 'react-colorful'
import type { HueLight, HueGroup } from '@/lib/types'

interface LightsData {
  lights: HueLight[]
  groups: HueGroup[]
}

type LightState = { on?: boolean; brightness?: number; colorTemp?: number; hue?: number; saturation?: number }

function briPct(bri: number) {
  return `${Math.round((bri / 254) * 100)}%`
}

function Toggle({ on, disabled, onToggle }: { on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-40 ${
        on ? 'bg-amber-400' : 'bg-zinc-700'
      }`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  )
}


function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[90] w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {children}
      </div>
    </div>
  )
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
            className="flex-1 accent-amber-400"
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
          ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 cursor-pointer'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 cursor-pointer'
      }`}
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

function LightMiniCard({
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
      className={`rounded-lg border p-3 flex flex-col gap-2 transition-colors ${
        !light.reachable
          ? 'border-zinc-800/50 bg-zinc-900/30 opacity-50 cursor-default'
          : selected
          ? 'border-amber-400/70 bg-amber-500/10 cursor-pointer'
          : light.on
          ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 cursor-pointer'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-zinc-100 truncate flex-1">{light.name}</p>
        <div onClick={e => e.stopPropagation()}>
          <Toggle
            on={light.on}
            disabled={!light.reachable}
            onToggle={() => onToggle(light.id, !light.on)}
          />
        </div>
      </div>
      {light.on && light.reachable && (
        <p className="text-[10px] text-zinc-500 font-mono">{briPct(light.brightness)}</p>
      )}
    </div>
  )
}

function SliderRow({ label, value, children }: { label: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</label>
        <span className="text-xs font-mono text-zinc-400">{value}</span>
      </div>
      {children}
    </div>
  )
}

function LightDetail({
  light,
  onClose,
  onSetState,
}: {
  light: HueLight
  onClose: () => void
  onSetState: (state: LightState) => void
}) {
  const hasBrightness = !light.type.toLowerCase().includes('on/off')
  const hasColorTemp = light.colorTemp !== undefined
  const hasColor = light.hue !== undefined

  const [hsvColor, setHsvColor] = useState<HsvColor>({
    h: Math.round(((light.hue ?? 0) / 65535) * 360),
    s: Math.round(((light.saturation ?? 254) / 254) * 100),
    v: Math.round((light.brightness / 254) * 100),
  })

  const [localBri, setLocalBri] = useState(light.brightness)
  const [localCt, setLocalCt] = useState(light.colorTemp ?? 366)

  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const briTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ctTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setHsvColor({
      h: Math.round(((light.hue ?? 0) / 65535) * 360),
      s: Math.round(((light.saturation ?? 254) / 254) * 100),
      v: Math.round((light.brightness / 254) * 100),
    })
    setLocalBri(light.brightness)
    if (light.colorTemp) setLocalCt(light.colorTemp)
  }, [light])

  function handleColorChange(color: HsvColor) {
    setHsvColor(color)
    if (colorTimer.current) clearTimeout(colorTimer.current)
    colorTimer.current = setTimeout(() => {
      onSetState({
        hue: Math.round((color.h / 360) * 65535),
        saturation: Math.round((color.s / 100) * 254),
        brightness: Math.round((color.v / 100) * 254),
      })
    }, 150)
  }

  function handleBri(val: number) {
    setLocalBri(val)
    if (briTimer.current) clearTimeout(briTimer.current)
    briTimer.current = setTimeout(() => onSetState({ brightness: val }), 300)
  }

  function handleCt(displayVal: number) {
    const actual = 653 - displayVal
    setLocalCt(actual)
    if (ctTimer.current) clearTimeout(ctTimer.current)
    ctTimer.current = setTimeout(() => onSetState({ colorTemp: actual }), 300)
  }

  const displayCt = 653 - localCt
  const kelvin = Math.round(1000000 / localCt)

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">{light.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{light.type}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none p-0.5 mt-0.5"
        >
          ×
        </button>
      </div>

      {!light.on && (
        <p className="text-xs text-zinc-600">Turn the light on to adjust settings.</p>
      )}

      {light.on && (
        <>
          {hasColor && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Color & Brightness</label>
              <HsvColorPicker
                color={hsvColor}
                onChange={handleColorChange}
                style={{ width: '100%', height: '200px' }}
              />
            </div>
          )}

          {!hasColor && hasBrightness && (
            <SliderRow label="Brightness" value={briPct(localBri)}>
              <input
                type="range" min={1} max={254} value={localBri}
                onChange={e => handleBri(Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </SliderRow>
          )}

          {hasColorTemp && (
            <SliderRow label="Color Temperature" value={`${kelvin}K`}>
              <input
                type="range" min={153} max={500} value={displayCt}
                onChange={e => handleCt(Number(e.target.value))}
                className="gradient-slider w-full"
                style={{ background: 'linear-gradient(to right, #ff6a00, #ff9a3c, #ffd28c, #fff8e7, #c9e8ff)' }}
              />
              <div className="flex justify-between text-[10px] text-zinc-700 px-0.5">
                <span>Warm</span>
                <span>Cool</span>
              </div>
            </SliderRow>
          )}
        </>
      )}
    </div>
  )
}

function LightModal({
  light,
  onClose,
  onSetState,
}: {
  light: HueLight
  onClose: () => void
  onSetState: (state: LightState) => void
}) {
  return (
    <Modal onClose={onClose}>
      <LightDetail light={light} onClose={onClose} onSetState={onSetState} />
    </Modal>
  )
}

function RoomModal({
  group,
  lights,
  selectedLightId,
  onClose,
  onGroupToggle,
  onGroupBrightness,
  onLightToggle,
  onLightSelect,
}: {
  group: HueGroup
  lights: HueLight[]
  selectedLightId: string | null
  onClose: () => void
  onGroupToggle: (id: string, on: boolean) => void
  onGroupBrightness: (id: string, bri: number) => void
  onLightToggle: (id: string, on: boolean) => void
  onLightSelect: (id: string) => void
}) {
  const [localBri, setLocalBri] = useState(group.brightness)
  const [pending, setPending] = useState(false)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!pending) setLocalBri(group.brightness)
  }, [group.brightness, pending])

  // ESC closes this modal only if the light modal isn't open on top
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !selectedLightId) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, selectedLightId])

  function handleBriChange(val: number) {
    setLocalBri(val)
    setPending(true)
    if (commitTimer.current) clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(() => {
      onGroupBrightness(group.id, val)
      setPending(false)
    }, 300)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[70] w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-4">
          <div>
            <p className="text-sm font-semibold text-zinc-100">{group.name}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {group.type} · {group.lightIds.length} light{group.lightIds.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none p-0.5 mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Master controls */}
        <div className="px-5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">All Lights</span>
            <Toggle on={group.on} disabled={false} onToggle={() => onGroupToggle(group.id, !group.on)} />
          </div>
          {group.on && (
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={254}
                value={localBri}
                onChange={e => handleBriChange(Number(e.target.value))}
                className="flex-1 accent-amber-400"
              />
              <span className="text-xs font-mono text-zinc-400 w-9 text-right">{briPct(localBri)}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Lights</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        {/* Light grid */}
        <div className="px-5 pb-5 grid grid-cols-2 gap-2">
          {lights.map(l => (
            <LightMiniCard
              key={l.id}
              light={l}
              selected={selectedLightId === l.id}
              onToggle={onLightToggle}
              onSelect={onLightSelect}
            />
          ))}
          {lights.length === 0 && (
            <p className="col-span-2 text-xs text-zinc-600 text-center py-4">No lights found in this room.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LightsPage() {
  const [data, setData] = useState<LightsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [lightModalSource, setLightModalSource] = useState<'grid' | 'room'>('grid')

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
      setLastUpdated(new Date())
    } catch {
      setError('Could not reach lights API')
    }
  }, [])

  useEffect(() => {
    // One-time fetch to surface any "not configured" error before SSE connects
    fetchData()

    const es = new EventSource('/api/lights/stream')
    es.onmessage = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data as string) as LightsData
        setData(d)
        setLastUpdated(new Date())
        setError(null)
      } catch { /* malformed event */ }
    }
    return () => es.close()
  }, [fetchData])

  // Scroll lock while any modal is open
  useEffect(() => {
    document.body.style.overflow =
      selectedGroupId !== null || selectedLightId !== null ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [selectedGroupId, selectedLightId])

  // Close room modal if group disappears from data
  useEffect(() => {
    if (selectedGroupId && data && !data.groups.find(g => g.id === selectedGroupId)) {
      setSelectedGroupId(null)
      setSelectedLightId(null)
    }
  }, [data, selectedGroupId])

  async function handleGlobalToggle() {
    if (!data) return
    const next = !data.lights.some(l => l.on)
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
      fetchData()
    }
  }

  async function handleGroupToggle(id: string, on: boolean) {
    setData(d => d ? { ...d, groups: d.groups.map(g => g.id === id ? { ...g, on } : g) } : d)
    await fetch(`/api/lights/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
    })
  }

  async function handleGroupBrightness(id: string, brightness: number) {
    setData(d => d ? { ...d, groups: d.groups.map(g => g.id === id ? { ...g, brightness } : g) } : d)
    await fetch(`/api/lights/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brightness }),
    })
  }

  async function handleLightToggle(id: string, on: boolean) {
    setData(d => d ? { ...d, lights: d.lights.map(l => l.id === id ? { ...l, on } : l) } : d)
    await fetch(`/api/lights/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
    })
  }

  function handleLightSetState(id: string, state: LightState) {
    setData(d => d ? { ...d, lights: d.lights.map(l => l.id === id ? { ...l, ...state } : l) } : d)
    fetch(`/api/lights/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => {})
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
      <header className="h-14 flex items-center justify-between px-6 border-b border-zinc-800 shrink-0">
        <h1 className="text-base font-semibold text-zinc-100 tracking-tight">Lights</h1>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-zinc-600">
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={fetchData}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded"
          >
            Refresh
          </button>
        </div>
      </header>

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

      {selectedGroup && (
        <RoomModal
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

      {selectedLight && (
        <LightModal
          key={selectedLight.id}
          light={selectedLight}
          onClose={() => setSelectedLightId(null)}
          onSetState={state => handleLightSetState(selectedLight.id, state)}
        />
      )}
    </div>
  )
}
