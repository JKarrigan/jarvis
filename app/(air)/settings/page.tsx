'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Toast, useToast } from '@/app/_components/Toast'
import { PM_BATCHES, calibratePm25 } from '@/lib/pmCalibration'
import { usePolling } from '@/app/_components/PollingProvider'
import { HueBridgeSection } from '@/app/_components/HueBridgeSection'
import { Page, PageHeader, Segmented, btnCls, btnPrimaryCls, cardCls, inputCls } from '@/app/_components/air/ui'
import { FadeIn } from '@/app/_components/air/motion'

interface DeviceConfig {
  country: string
  mqttBrokerUrl: string
  httpDomain: string
  configurationControl: string
  pmStandard: string
  temperatureUnit: string
  disableCloudConnection: boolean
  postDataToAirGradient: boolean
  ledBarBrightness: number
  displayBrightness: number
  ledBarMode: string
  tvocLearningOffset: number
  noxLearningOffset: number
  abcDays: number
  model: string
  offlineMode: boolean
  monitorDisplayCompensatedValues: boolean
  extendedPmMeasures: boolean
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors before:absolute before:-inset-x-1 before:-inset-y-[12px] before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-air-card disabled:opacity-50 ${
        checked ? 'bg-emerald-500' : 'bg-zinc-700'
      }`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className={`${cardCls} overflow-hidden`}>
      <div className="px-5 pb-1 pt-5 md:px-6">
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        {description && <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-zinc-400">{description}</p>}
      </div>
      <div className="space-y-5 p-5 md:px-6">{children}</div>
    </section>
  )
}

function FieldRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-100">{label}</p>
        {description && <p className="mt-0.5 text-sm text-zinc-400">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function FieldStack({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-100">{label}</label>
      {children}
    </div>
  )
}

const TEMP_OPTIONS = [{ key: 'c', label: '°C' }, { key: 'f', label: '°F' }] as const
const PM_OPTIONS = [{ key: 'ugm3', label: 'μg/m³' }, { key: 'usaqi', label: 'US AQI' }] as const

/** Lat/lon fields that commit on blur/Enter (not on every keystroke); clearing both clears the location. */
function LocationFields({ initial, onCommit }: {
  initial: { lat: string; lon: string } | null
  onCommit: (loc: { lat: string; lon: string } | null) => void
}) {
  const [lat, setLat] = useState(initial?.lat ?? '')
  const [lon, setLon] = useState(initial?.lon ?? '')
  const [error, setError] = useState<string | null>(null)

  function commit() {
    const la = lat.trim()
    const lo = lon.trim()
    if (!la && !lo) {
      setError(null)
      if (initial) onCommit(null)
      return
    }
    if (!la || !lo) return // wait until both are filled in
    const nLat = Number(la)
    const nLon = Number(lo)
    if (!Number.isFinite(nLat) || nLat < -90 || nLat > 90 || !Number.isFinite(nLon) || nLon < -180 || nLon > 180) {
      setError('Latitude must be −90…90 and longitude −180…180')
      return
    }
    setError(null)
    if (la !== initial?.lat || lo !== initial?.lon) onCommit({ lat: la, lon: lo })
  }

  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') commit() }

  return (
    <>
      <div className="flex gap-3">
        <FieldStack label="Latitude" htmlFor="outdoor-lat">
          <input
            id="outdoor-lat"
            type="text"
            inputMode="decimal"
            value={lat}
            onChange={e => setLat(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            placeholder="37.7749"
            className={`w-32 ${inputCls}`}
          />
        </FieldStack>
        <FieldStack label="Longitude" htmlFor="outdoor-lon">
          <input
            id="outdoor-lon"
            type="text"
            inputMode="decimal"
            value={lon}
            onChange={e => setLon(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            placeholder="-122.4194"
            className={`w-32 ${inputCls}`}
          />
        </FieldStack>
      </div>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      {initial && !error && (
        <p className="text-sm tabular-nums text-zinc-400">Saved: {initial.lat}, {initial.lon}</p>
      )}
    </>
  )
}

type ConfigState = { ip: string; config: DeviceConfig; draft: DeviceConfig } | { ip: string; error: string }

export default function SettingsPage() {
  const { ready, deviceIp, measures, pmBatchId, setPmBatchId, outdoorLocation, setOutdoorLocation } = usePolling()
  const [cfg, setCfg] = useState<ConfigState | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast, showToast, dismissToast } = useToast()

  useEffect(() => {
    if (!deviceIp) return
    const ac = new AbortController()
    fetch(`/api/config?ip=${encodeURIComponent(deviceIp)}`, { signal: ac.signal })
      .then(async r => {
        const body = await r.json().catch(() => null) as (DeviceConfig & { error?: string }) | null
        if (!r.ok || !body) throw new Error(body?.error ?? 'Failed to load config')
        setCfg({ ip: deviceIp, config: body, draft: body })
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        setCfg({ ip: deviceIp, error: err instanceof Error ? err.message : 'Could not load config' })
      })
    return () => ac.abort()
  }, [deviceIp])

  const current = cfg && cfg.ip === deviceIp ? cfg : null
  const loading = !ready || (deviceIp !== null && current === null)
  const config = current && 'config' in current ? current.config : null
  const draft = current && 'draft' in current ? current.draft : null
  const fetchError = current && 'error' in current ? current.error : null
  const latestPm003Count = typeof measures?.pm003Count === 'number' && Number.isFinite(measures.pm003Count) ? measures.pm003Count : null

  function setDraft(next: DeviceConfig | null) {
    setCfg(c => c && 'config' in c && next ? { ...c, draft: next } : c)
  }

  function update<K extends keyof DeviceConfig>(key: K, value: DeviceConfig[K]) {
    setCfg(c => c && 'draft' in c ? { ...c, draft: { ...c.draft, [key]: value } } : c)
  }

  async function handleSave() {
    if (!deviceIp || !draft) return
    setSaving(true)
    try {
      const res = await fetch(`/api/config?ip=${encodeURIComponent(deviceIp)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const e = await res.json() as { error?: string }
        showToast('error', e.error ?? 'Failed to save')
      } else {
        setCfg(c => c && 'draft' in c ? { ...c, config: draft } : c)
        showToast('success', 'Settings saved')
      }
    } catch {
      showToast('error', 'Network error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Page width="narrow">
        <PageHeader title="Settings" />
        <FadeIn key="loading" className="flex flex-col gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`${cardCls} space-y-3 p-5`}>
              <div className="h-4 w-28 animate-pulse rounded bg-air-active" />
              <div className="h-10 animate-pulse rounded-xl bg-air-raised" />
              <div className="h-10 animate-pulse rounded-xl bg-air-raised" />
            </div>
          ))}
        </FadeIn>
      </Page>
    )
  }

  if (!deviceIp) {
    return (
      <Page width="narrow">
        <PageHeader title="Settings" subtitle="No air sensor is connected yet." />
        <FadeIn key="no-device" className="flex flex-col gap-4">
          <div className={`${cardCls} flex flex-wrap items-center justify-between gap-3 px-5 py-5`}>
            <p className="text-sm text-zinc-300">Sensor settings appear here once a device is set up.</p>
            <Link href="/" className="text-sm font-medium text-emerald-400 transition-colors hover:text-emerald-300">Set up on Overview</Link>
          </div>
          <HueBridgeSection />
        </FadeIn>
      </Page>
    )
  }

  if (fetchError || !draft) {
    return (
      <Page width="narrow">
        <PageHeader title="Settings" />
        <FadeIn key="error" className="flex flex-col gap-4">
          <div role="alert" className={`${cardCls} px-5 py-5`}>
            <p className="text-sm text-zinc-200">{fetchError ?? 'Could not load the sensor configuration'}</p>
            <p className="mt-1 text-sm text-zinc-400">The sensor did not answer. Reload the page once it is back online.</p>
          </div>
          <HueBridgeSection />
        </FadeIn>
      </Page>
    )
  }

  const dirty = config !== draft

  return (
    <>
      <Page width="narrow">
        <PageHeader title="Settings" subtitle="The air sensor, outdoor comparison, calibration and the Hue bridge." />
        <FadeIn key="ready" className="flex flex-col gap-4">

          <Section title="Display">
            <FieldStack label="Display brightness">
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={100} step={1}
                  value={draft.displayBrightness}
                  onChange={e => update('displayBrightness', Number(e.target.value))}
                  disabled={saving}
                  className="h-10 flex-1 accent-emerald-500 disabled:opacity-50"
                />
                <span className="w-10 text-right text-sm tabular-nums text-zinc-300">{draft.displayBrightness}%</span>
              </div>
            </FieldStack>

            <FieldStack label="LED bar brightness">
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={100} step={1}
                  value={draft.ledBarBrightness}
                  onChange={e => update('ledBarBrightness', Number(e.target.value))}
                  disabled={saving}
                  className="h-10 flex-1 accent-emerald-500 disabled:opacity-50"
                />
                <span className="w-10 text-right text-sm tabular-nums text-zinc-300">{draft.ledBarBrightness}%</span>
              </div>
            </FieldStack>

            <FieldRow label="LED bar mode" description="Which metric drives the LED color bar">
              <select
                value={draft.ledBarMode}
                onChange={e => update('ledBarMode', e.target.value)}
                disabled={saving}
                className={`${inputCls} pr-8`}
              >
                <option value="co2">CO₂</option>
                <option value="pm">PM2.5</option>
                <option value="off">Off</option>
              </select>
            </FieldRow>

            <FieldRow label="Temperature unit" description="The unit shown on the device display">
              <Segmented
                options={TEMP_OPTIONS}
                value={draft.temperatureUnit === 'f' ? 'f' : 'c'}
                onChange={v => update('temperatureUnit', v)}
                label="Temperature unit"
                disabled={saving}
              />
            </FieldRow>

            <FieldRow label="Compensated values" description="Show corrected readings on the device display">
              <Toggle
                label="Compensated values"
                checked={draft.monitorDisplayCompensatedValues}
                onChange={v => update('monitorDisplayCompensatedValues', v)}
                disabled={saving}
              />
            </FieldRow>
          </Section>

          <Section title="Connectivity">
            <FieldRow label="Disable cloud connection" description="Stop sending data to AirGradient servers">
              <Toggle
                label="Disable cloud connection"
                checked={draft.disableCloudConnection}
                onChange={v => update('disableCloudConnection', v)}
                disabled={saving}
              />
            </FieldRow>

            <FieldRow label="Post data to AirGradient" description="Share readings with the AirGradient network">
              <Toggle
                label="Post data to AirGradient"
                checked={draft.postDataToAirGradient}
                onChange={v => update('postDataToAirGradient', v)}
                disabled={saving}
              />
            </FieldRow>

            <FieldRow label="Offline mode" description="Disable all network communication">
              <Toggle
                label="Offline mode"
                checked={draft.offlineMode}
                onChange={v => update('offlineMode', v)}
                disabled={saving}
              />
            </FieldRow>

            <FieldStack label="MQTT broker URL">
              <input
                type="text"
                value={draft.mqttBrokerUrl}
                onChange={e => update('mqttBrokerUrl', e.target.value)}
                disabled={saving}
                placeholder="mqtt://192.168.1.x:1883"
                className={`w-full ${inputCls}`}
              />
            </FieldStack>

            <FieldStack label="HTTP domain">
              <input
                type="text"
                value={draft.httpDomain}
                onChange={e => update('httpDomain', e.target.value)}
                disabled={saving}
                placeholder="https://your-server.example.com"
                className={`w-full ${inputCls}`}
              />
            </FieldStack>
          </Section>

          <Section title="Sensors">
            <FieldRow label="PM standard">
              <Segmented
                options={PM_OPTIONS}
                value={draft.pmStandard === 'usaqi' ? 'usaqi' : 'ugm3'}
                onChange={v => update('pmStandard', v)}
                label="PM standard"
                disabled={saving}
              />
            </FieldRow>

            <FieldRow label="Extended PM measures" description="Enable additional particulate size measurements">
              <Toggle
                label="Extended PM measures"
                checked={draft.extendedPmMeasures}
                onChange={v => update('extendedPmMeasures', v)}
                disabled={saving}
              />
            </FieldRow>

            <FieldStack label="Country">
              <input
                type="text"
                value={draft.country}
                onChange={e => update('country', e.target.value)}
                disabled={saving}
                placeholder="TH"
                className={`w-24 ${inputCls}`}
              />
            </FieldStack>
          </Section>

          <Section title="Location">
            <p className="max-w-[70ch] text-sm leading-relaxed text-zinc-400">
              Set your location to compare indoor air quality against outdoor conditions.
              Used for outdoor AQI display only — not sent to the device.
            </p>
            <LocationFields
              key={`${outdoorLocation?.lat ?? ''}|${outdoorLocation?.lon ?? ''}`}
              initial={outdoorLocation}
              onCommit={setOutdoorLocation}
            />
          </Section>

          <Section title="Calibration">
            <FieldStack label="PM2.5 batch correction">
              <p className="max-w-[70ch] text-sm leading-relaxed text-zinc-400">
                Select your PMS5003 sensor batch to recalculate PM2.5 from the raw particle count.
                Check the sticker on the sensor inside your device for the batch date. Applied client-side only — does not change device firmware.
              </p>
              <select
                value={pmBatchId ?? ''}
                onChange={e => setPmBatchId(e.target.value || null)}
                className={`w-full ${inputCls}`}
              >
                <option value="">None — use raw device value</option>
                {PM_BATCHES.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.id} (×{b.factor})
                  </option>
                ))}
              </select>
              {pmBatchId && latestPm003Count !== null && (() => {
                const batch = PM_BATCHES.find(b => b.id === pmBatchId)!
                const calibrated = calibratePm25(latestPm003Count, batch)
                return (
                  <p className="text-sm tabular-nums text-zinc-400">
                    Latest reading: pm003Count = {latestPm003Count.toLocaleString()} →{' '}
                    <span className="text-emerald-400">{calibrated.toFixed(1)} μg/m³</span>
                  </p>
                )
              })()}
            </FieldStack>

            <FieldRow label="CO₂ ABC period" description="Days between automatic baseline corrections">
              <input
                type="number"
                min={0}
                value={draft.abcDays}
                onChange={e => update('abcDays', Number(e.target.value))}
                disabled={saving}
                className={`w-20 text-right ${inputCls}`}
              />
            </FieldRow>

            <FieldRow label="TVOC learning offset" description="Hours for the VOC baseline algorithm">
              <input
                type="number"
                min={0}
                value={draft.tvocLearningOffset}
                onChange={e => update('tvocLearningOffset', Number(e.target.value))}
                disabled={saving}
                className={`w-20 text-right ${inputCls}`}
              />
            </FieldRow>

            <FieldRow label="NOx learning offset" description="Hours for the NOx baseline algorithm">
              <input
                type="number"
                min={0}
                value={draft.noxLearningOffset}
                onChange={e => update('noxLearningOffset', Number(e.target.value))}
                disabled={saving}
                className={`w-20 text-right ${inputCls}`}
              />
            </FieldRow>
          </Section>

          <HueBridgeSection />

          {/* Save bar: stays in view above the phone tab bar while there are unsaved changes. */}
          <div className={`sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border px-4 py-3 transition-colors md:bottom-4 ${
            dirty ? 'border-emerald-500/40 bg-air-raised shadow-[0_12px_30px_rgba(0,0,0,0.5)]' : 'border-transparent'
          }`}>
            {dirty && <p className="mr-auto text-sm text-zinc-300">Unsaved changes to the sensor</p>}
            {dirty && (
              <button type="button" onClick={() => setDraft(config)} disabled={saving} className={btnCls}>Discard</button>
            )}
            <button type="button" onClick={handleSave} disabled={saving || !dirty} className={btnPrimaryCls}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </FadeIn>
      </Page>

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  )
}
