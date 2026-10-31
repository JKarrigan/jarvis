'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import type { HueLight, HueGroup } from '@/lib/types'
import {
  briPct,
  lightDisplayColor,
  lightHasBrightness,
  GroupBrightnessSlider,
  Toggle,
  LightModal,
  RoomModal,
} from '@/app/_components/HueControls'
import { useHueLights } from '@/app/_components/lights/useHueLights'
import { Toast, useToast } from '@/app/_components/Toast'

/**
 * Card layout: the whole card is a real <button> stretched underneath the
 * content (so it is focusable and announced), with the switch and slider
 * layered above it — interactive elements can't be nested inside a button.
 */
const stretchedButtonCls = 'absolute inset-0 rounded-xl cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'

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
  const lightCount = `${group.lightIds.length} light${group.lightIds.length !== 1 ? 's' : ''}`
  return (
    <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3 hover:border-zinc-700 transition-colors">
      <button
        type="button"
        onClick={() => onSelect(group.id)}
        aria-haspopup="dialog"
        aria-label={`${group.name}, ${group.type}, ${lightCount}`}
        className={stretchedButtonCls}
      />
      <div className="relative flex items-center justify-between gap-4 pointer-events-none">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100 truncate">{group.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{group.type} · {lightCount}</p>
        </div>
        <div className="pointer-events-auto">
          <Toggle on={group.on} disabled={false} onToggle={() => onToggle(group.id, !group.on)} label={`${group.name} lights`} />
        </div>
      </div>
      {group.on && (
        <div className="relative">
          <GroupBrightnessSlider group={group} onBrightness={onBrightness} />
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
      className={`relative rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
        !light.reachable
          ? 'border-zinc-800/50 bg-zinc-900/30 opacity-50'
          : selected
          ? 'border-amber-400/70 bg-amber-500/10'
          : light.on
          ? ''
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
      }`}
      style={light.on && !selected && light.reachable ? {
        borderColor: lightDisplayColor(light, 0.65),
        backgroundColor: lightDisplayColor(light, 0.22),
      } : undefined}
    >
      <button
        type="button"
        onClick={() => onSelect(light.id)}
        disabled={!light.reachable}
        aria-haspopup="dialog"
        aria-label={`${light.name}${light.reachable ? '' : ', unreachable'}`}
        className={stretchedButtonCls}
      />
      <div className="relative flex items-start justify-between gap-2 pointer-events-none">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100 truncate">{light.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5 truncate">{light.type}</p>
        </div>
        <div className="pointer-events-auto">
          <Toggle
            on={light.on}
            disabled={!light.reachable}
            onToggle={() => onToggle(light.id, !light.on)}
            label={`${light.name} power`}
          />
        </div>
      </div>
      {!light.reachable && <p className="relative pointer-events-none text-xs text-zinc-600">Unreachable</p>}
      {light.on && light.reachable && lightHasBrightness(light) && (
        <p className="relative pointer-events-none text-xs text-zinc-500 font-mono">{briPct(light.brightness)}</p>
      )}
    </div>
  )
}

export default function LightsPage() {
  const { toast, showToast, dismissToast } = useToast()
  const { data, error, notConfigured, connection, setLight, setGroup, toggleAll } = useHueLights({
    onActionError: msg => showToast('error', msg),
  })
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [lightModalSource, setLightModalSource] = useState<'grid' | 'room'>('grid')

  // Derived: a room (or light) that disappears from the bridge simply closes its
  // sheet, and a light opened from a room closes with that room.
  const selectedGroup = data?.groups.find(g => g.id === selectedGroupId) ?? null
  const roomLights = selectedGroup && data ? data.lights.filter(l => selectedGroup.lightIds.includes(l.id)) : []
  const selectedLight = lightModalSource === 'room' && !selectedGroup
    ? null
    : data?.lights.find(l => l.id === selectedLightId) ?? null
  const anySheetOpen = selectedGroup !== null || selectedLight !== null

  useEffect(() => {
    document.body.style.overflow = anySheetOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [anySheetOpen])

  function handleSelect(id: string, source: 'grid' | 'room') {
    setSelectedLightId(prev => (source === 'grid' && prev === id) ? null : id)
    setLightModalSource(source)
  }

  const handleLightToggle = (id: string, on: boolean) => setLight(id, { on })
  const handleGroupToggle = (id: string, on: boolean) => setGroup(id, { on })
  const handleGroupBrightness = (id: string, brightness: number) => setGroup(id, { brightness })

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="p-6 space-y-8 max-w-2xl mx-auto w-full">
        {notConfigured ? (
          <div className="text-center space-y-3 pt-12">
            <p className="text-zinc-400 text-sm">Hue Bridge not configured.</p>
            <Link href="/settings" className="inline-block text-xs text-amber-400 hover:text-amber-300 transition-colors">
              Go to Settings to connect your Bridge →
            </Link>
          </div>
        ) : error && data === null ? (
          <div className="text-center pt-12 space-y-1" role="alert">
            <p className="text-red-400 text-sm">{error}</p>
            <p className="text-zinc-500 text-xs">Retrying automatically…</p>
          </div>
        ) : data === null ? (
          <div className="space-y-8" aria-busy="true" aria-label="Loading lights">
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
            {connection === 'reconnecting' && (
              <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                {error ? `${error} — ` : ''}Reconnecting… values shown may be out of date.
              </p>
            )}

            {data.lights.length > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-100">All Lights</p>
                <Toggle on={data.lights.some(l => l.on)} disabled={false} onToggle={toggleAll} label="All lights" />
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
            lights={roomLights}
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
            onSetState={state => setLight(selectedLight.id, state)}
            onToggle={() => handleLightToggle(selectedLight.id, !selectedLight.on)}
          />
        )}
      </AnimatePresence>

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
