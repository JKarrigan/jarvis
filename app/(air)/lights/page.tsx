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
import { EmptyState, Page, PageHeader, PageState, SectionTitle, cardCls } from '@/app/_components/air/ui'

/**
 * Card layout: the whole card is a real <button> stretched underneath the
 * content (so it is focusable and announced), with the switch and slider
 * layered above it — interactive elements can't be nested inside a button.
 */
const stretchedButtonCls = 'absolute inset-0 rounded-2xl cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'

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
    <div className={`relative space-y-3 rounded-2xl border p-4 transition-colors md:p-5 ${group.on ? 'border-amber-400/40 bg-[#1c170c]' : 'border-air-line bg-air-card hover:border-white/20'}`}>
      <button
        type="button"
        onClick={() => onSelect(group.id)}
        aria-haspopup="dialog"
        aria-label={`${group.name}, ${group.type}, ${lightCount}`}
        className={stretchedButtonCls}
      />
      <div className="relative flex items-center justify-between gap-4 pointer-events-none">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-zinc-50">{group.name}</p>
          <p className="mt-0.5 text-sm text-zinc-400">{group.type} · {lightCount}{group.on ? ` · ${briPct(group.brightness)}` : ' · off'}</p>
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
      className={`relative flex min-h-[104px] flex-col gap-3 rounded-2xl border p-4 transition-colors ${
        !light.reachable
          ? 'border-air-line bg-air-card opacity-50'
          : selected
          ? 'border-amber-400/70 bg-amber-500/10'
          : light.on
          ? ''
          : 'border-air-line bg-air-card hover:border-white/20'
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
          <p className="truncate text-sm font-semibold text-zinc-50">{light.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-zinc-400">{light.type}</p>
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
      {!light.reachable && <p className="pointer-events-none relative mt-auto text-sm text-zinc-400">Unreachable</p>}
      {light.on && light.reachable && lightHasBrightness(light) && (
        <p className="pointer-events-none relative mt-auto text-sm tabular-nums text-zinc-300">{briPct(light.brightness)}</p>
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
    <>
      <Page>
        <PageHeader
          title="Lights"
          subtitle={data && data.lights.length > 0 ? `${data.lights.filter(l => l.on).length} of ${data.lights.length} on` : undefined}
        >
          {data && data.lights.length > 0 && (
            <div className="flex min-h-11 items-center gap-3 rounded-xl border border-air-line bg-air-card pl-4 pr-3 text-sm font-medium text-zinc-200">
              <span aria-hidden="true">All lights</span>
              <Toggle on={data.lights.some(l => l.on)} disabled={false} onToggle={toggleAll} label="All lights" />
            </div>
          )}
        </PageHeader>

        {notConfigured ? (
          <EmptyState title="No Hue bridge connected yet">
            <Link href="/settings" className="mt-2 text-sm font-medium text-amber-300 transition-colors hover:text-amber-200">
              Connect your bridge in Settings
            </Link>
          </EmptyState>
        ) : error && data === null ? (
          <PageState>
            <div role="alert" className="space-y-1">
              <p className="text-sm text-red-400">{error}</p>
              <p className="text-sm text-zinc-400">Retrying automatically.</p>
            </div>
          </PageState>
        ) : data === null ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading lights">
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className={`${cardCls} h-[92px] animate-pulse`} />)}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {[...Array(8)].map((_, i) => <div key={i} className={`${cardCls} h-[104px] animate-pulse`} />)}
            </div>
          </div>
        ) : (
          <>
            {connection === 'reconnecting' && (
              <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
                {error ? `${error}. ` : ''}Reconnecting. Values shown may be out of date.
              </p>
            )}

            {data.groups.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionTitle>Rooms</SectionTitle>
                <div className="grid gap-3 md:grid-cols-2 md:gap-4">
                  {data.groups.map(g => (
                    <RoomCard
                      key={g.id}
                      group={g}
                      onToggle={handleGroupToggle}
                      onBrightness={handleGroupBrightness}
                      onSelect={id => setSelectedGroupId(id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {data.lights.length > 0 && (
              <section className="mt-2 flex flex-col gap-3">
                <SectionTitle>All lights</SectionTitle>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
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
              <EmptyState title="No lights found on your bridge" />
            )}
          </>
        )}
      </Page>

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
    </>
  )
}
