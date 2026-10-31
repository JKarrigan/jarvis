'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Toast, useToast } from '@/app/_components/Toast'
import { PM_BATCHES, calibratePm25 } from '@/lib/pmCalibration'
import { usePolling } from '@/app/_components/PollingProvider'
import { HueBridgeSection } from '@/app/_components/HueBridgeSection'

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

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
        checked ? 'bg-emerald-500' : 'bg-zinc-700'
      }`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`} />
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800/60">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{title}</h2>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </section>
  )
}

function FieldRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm text-zinc-200">{label}</p>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function FieldStack({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition-colors disabled:opacity-50'

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
        <p className="text-xs text-zinc-500 font-mono">Saved: {initial.lat}, {initial.lon}</p>
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
      <div className="min-h-screen bg-zinc-950 p-6">
        <div className="max-w-2xl mx-auto w-full space-y-4">
          <div className="h-8 w-36 rounded-lg bg-zinc-800 animate-pulse" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
              <div className="h-3 w-24 rounded bg-zinc-800 animate-pulse" />
              <div className="h-9 rounded-lg bg-zinc-800 animate-pulse" />
              <div className="h-9 rounded-lg bg-zinc-800 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!deviceIp) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-zinc-400 text-sm">No device configured</p>
          <Link href="/" className="block text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            ← Go to overview to set up your device
          </Link>
        </div>
      </div>
    )
  }

  if (fetchError || !draft) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-zinc-400 text-sm">{fetchError ?? 'Could not load config'}</p>
          <Link href="/" className="block text-xs text-zinc-600 hover:text-zinc-400 transition-colors">← Overview</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <main className="p-6 space-y-6 max-w-2xl mx-auto w-full">

        <Section title="Display">
          <FieldStack label="Display Brightness">
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} step={1}
                value={draft.displayBrightness}
                onChange={e => update('displayBrightness', Number(e.target.value))}
                disabled={saving}
                className="flex-1 accent-emerald-500 disabled:opacity-50"
              />
              <span className="text-xs font-mono text-zinc-400 w-9 text-right">{draft.displayBrightness}%</span>
            </div>
          </FieldStack>

          <FieldStack label="LED Bar Brightness">
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} step={1}
                value={draft.ledBarBrightness}
                onChange={e => update('ledBarBrightness', Number(e.target.value))}
                disabled={saving}
                className="flex-1 accent-emerald-500 disabled:opacity-50"
              />
              <span className="text-xs font-mono text-zinc-400 w-9 text-right">{draft.ledBarBrightness}%</span>
            </div>
          </FieldStack>

          <FieldRow label="LED Bar Mode" description="Which metric drives the LED color bar">
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

          <FieldRow label="Temperature Unit">
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
              {(['c', 'f'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => update('temperatureUnit', v)}
                  disabled={saving}
                  className={`px-3 py-1.5 text-xs font-mono transition-colors disabled:opacity-50 ${
                    draft.temperatureUnit === v
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'bg-transparent text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  °{v.toUpperCase()}
                </button>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="Compensated Values" description="Show corrected readings on the device display">
            <Toggle
              checked={draft.monitorDisplayCompensatedValues}
              onChange={v => update('monitorDisplayCompensatedValues', v)}
              disabled={saving}
            />
          </FieldRow>
        </Section>

        <Section title="Connectivity">
          <FieldRow label="Disable Cloud Connection" description="Stop sending data to AirGradient servers">
            <Toggle
              checked={draft.disableCloudConnection}
              onChange={v => update('disableCloudConnection', v)}
              disabled={saving}
            />
          </FieldRow>

          <FieldRow label="Post Data to AirGradient" description="Share readings with the AirGradient network">
            <Toggle
              checked={draft.postDataToAirGradient}
              onChange={v => update('postDataToAirGradient', v)}
              disabled={saving}
            />
          </FieldRow>

          <FieldRow label="Offline Mode" description="Disable all network communication">
            <Toggle
              checked={draft.offlineMode}
              onChange={v => update('offlineMode', v)}
              disabled={saving}
            />
          </FieldRow>

          <FieldStack label="MQTT Broker URL">
            <input
              type="text"
              value={draft.mqttBrokerUrl}
              onChange={e => update('mqttBrokerUrl', e.target.value)}
              disabled={saving}
              placeholder="mqtt://192.168.1.x:1883"
              className={`w-full ${inputCls}`}
            />
          </FieldStack>

          <FieldStack label="HTTP Domain">
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
          <FieldRow label="PM Standard">
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
              {(['ugm3', 'usaqi'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => update('pmStandard', v)}
                  disabled={saving}
                  className={`px-3 py-1.5 text-xs font-mono transition-colors disabled:opacity-50 ${
                    draft.pmStandard === v
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'bg-transparent text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {v === 'ugm3' ? 'μg/m³' : 'US AQI'}
                </button>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="Extended PM Measures" description="Enable additional particulate size measurements">
            <Toggle
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
          <p className="text-xs text-zinc-500">
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
          <FieldStack label="PM2.5 Batch Correction">
            <p className="text-xs text-zinc-500">
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
                <p className="text-xs text-zinc-400 font-mono">
                  Latest reading: pm003Count = {latestPm003Count.toLocaleString()} →{' '}
                  <span className="text-emerald-400">{calibrated.toFixed(1)} μg/m³</span>
                </p>
              )
            })()}
          </FieldStack>

          <FieldRow label="CO₂ ABC Period" description="Days between automatic baseline corrections">
            <input
              type="number"
              min={0}
              value={draft.abcDays}
              onChange={e => update('abcDays', Number(e.target.value))}
              disabled={saving}
              className={`w-20 text-right ${inputCls}`}
            />
          </FieldRow>

          <FieldRow label="TVOC Learning Offset" description="Hours for the VOC baseline algorithm">
            <input
              type="number"
              min={0}
              value={draft.tvocLearningOffset}
              onChange={e => update('tvocLearningOffset', Number(e.target.value))}
              disabled={saving}
              className={`w-20 text-right ${inputCls}`}
            />
          </FieldRow>

          <FieldRow label="NOx Learning Offset" description="Hours for the NOx baseline algorithm">
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

        <div className="flex items-center justify-end gap-3 pt-2 pb-8">
          {config !== draft && (
            <button
              type="button"
              onClick={() => setDraft(config)}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
            >
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </main>

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
