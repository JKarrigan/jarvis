'use client'

import { useState } from 'react'
import type { HueLight, HueGroup } from '@/lib/types'
import { useDraft } from '@/lib/useDraft'
import { CloseButton, Sheet } from './lights/dialog'

// The dialog primitives live in ./lights/dialog; re-exported here because the
// file browser and media sheets import them from this module.
export { Modal, Drawer, Sheet, CloseButton, useIsMobile } from './lights/dialog'

export type LightState = {
  on?: boolean
  brightness?: number
  colorTemp?: number
  hue?: number
  saturation?: number
}

/** The API also returns the CIE xy colour (used when colormode === 'xy'). */
type LampColor = HueLight & { xy?: [number, number] }

/** Commit throttles: lights accept ~10 commands/s, groups ~1/s. */
const LIGHT_THROTTLE_MS = 100
const GROUP_THROTTLE_MS = 1000

export function briPct(bri: number) {
  return `${Math.round((bri / 254) * 100)}%`
}

export function sliderFill(value: number, min: number, max: number): React.CSSProperties {
  return { '--fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties
}

/** On/off-only devices (smart plugs) have no dimmer. */
export function lightHasBrightness(light: HueLight): boolean {
  return !light.type.toLowerCase().includes('on/off')
}

// CIE 1931 xy → sRGB (Philips' wide-gamut matrix), normalised to full brightness.
function xyToRgb(x: number, y: number): [number, number, number] {
  if (y <= 0) return [255, 255, 255]
  const Y = 1
  const X = (Y / y) * x
  const Z = (Y / y) * (1 - x - y)
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.011530
  const max = Math.max(r, g, b)
  if (max > 1) { r /= max; g /= max; b /= max }
  const gamma = (c: number) => {
    const v = Math.max(0, c)
    return Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
  }
  return [Math.round(gamma(r) * 255), Math.round(gamma(g) * 255), Math.round(gamma(b) * 255)]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}

// Full-brightness HSL for the lamp's configured color, ignoring on/off state.
// Follows the bridge's colormode: the hue/sat/ct values of the other modes are stale.
function lampHsl(light: LampColor): [number, number, number] {
  const fromHs = (): [number, number, number] | null =>
    light.hue !== undefined && light.saturation !== undefined
      ? [Math.round((light.hue / 65535) * 360), Math.round((light.saturation / 254) * 100), 55]
      : null
  const fromCt = (): [number, number, number] | null => {
    if (light.colorTemp === undefined) return null
    const ratio = (light.colorTemp - 153) / (500 - 153)
    return [Math.round(ratio * 38), Math.round(ratio * 80), 70]
  }
  const fromXy = (): [number, number, number] | null => {
    if (!light.xy) return null
    const [h, s, l] = rgbToHsl(...xyToRgb(light.xy[0], light.xy[1]))
    return [h, s, Math.max(45, Math.min(70, l))]
  }
  const order = light.colormode === 'xy' ? [fromXy, fromHs, fromCt]
    : light.colormode === 'ct' ? [fromCt, fromHs, fromXy]
    : [fromHs, fromXy, fromCt]
  for (const f of order) {
    const hsl = f()
    if (hsl) return hsl
  }
  return [38, 92, 60]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

// Returns the lamp's display color as hsla(). Off lights show a dim version of their
// actual configured color so the hue is always visible in backgrounds.
export function lightDisplayColor(light: HueLight, alpha = 1): string {
  const [h, s, l] = lampHsl(light)
  const displayL = light.on ? l : Math.max(14, Math.round(l * 0.38))
  return `hsla(${h}, ${s}%, ${displayL}%, ${alpha})`
}

// Hex code of the lamp's configured color at full brightness (ignores on/off).
export function lightColorHex(light: HueLight): string {
  const [r, g, b] = hslToRgb(...lampHsl(light))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// '#ffffff' or '#000000' — whichever provides higher WCAG contrast against the lamp's color.
export function lightTextColor(light: HueLight): '#ffffff' | '#000000' {
  const [r, g, b] = hslToRgb(...lampHsl(light))
  const toLinear = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? '#ffffff' : '#000000'
}

/**
 * Switch. `label` is its accessible name (e.g. the light's name); the visible
 * 24×44 track gets an invisible 44 px-tall hit area.
 */
export function Toggle({ on, disabled, onToggle, label }: {
  on: boolean
  disabled: boolean
  onToggle: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors before:absolute before:-inset-x-1 before:-inset-y-[12px] before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:opacity-40 ${
        on ? 'bg-amber-400' : 'bg-zinc-700'
      }`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
        on ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  )
}

export function SliderRow({ label, value, children }: { label: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</span>
        <span className="text-xs font-mono text-zinc-400">{value}</span>
      </div>
      {children}
    </div>
  )
}

/** Horizontal brightness slider for a room, throttled to the bridge's ~1 group command/s. */
export function GroupBrightnessSlider({ group, onBrightness }: {
  group: HueGroup
  onBrightness: (id: string, bri: number) => void
}) {
  const [bri, setBri] = useDraft(group.brightness, v => onBrightness(group.id, v), GROUP_THROTTLE_MS)
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={1}
        max={254}
        value={bri}
        aria-label={`${group.name} brightness`}
        aria-valuetext={briPct(bri)}
        onChange={e => setBri(Number(e.target.value))}
        style={sliderFill(bri, 1, 254)}
        className="flex-1 accent-slider"
      />
      <span className="text-xs font-mono text-zinc-400 w-9 text-right">{briPct(bri)}</span>
    </div>
  )
}

function VerticalSlider({
  value, min, max, onChange, label, valueText,
  trackBackground, fillColor, thumbColor,
  width = 'w-36',
}: {
  value: number
  min: number
  max: number
  onChange: (val: number) => void
  label: string
  valueText?: string
  trackBackground: string
  fillColor?: string
  thumbColor?: string
  width?: string
}) {
  const [dragging, setDragging] = useState(false)
  const fillPct = ((value - min) / (max - min)) * 100
  const step = Math.max(1, Math.round((max - min) / 100))
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)))

  function valueFromY(el: HTMLElement, clientY: number) {
    const rect = el.getBoundingClientRect()
    const ratio = 1 - (clientY - rect.top) / rect.height
    return clamp(min + Math.max(0, Math.min(1, ratio)) * (max - min))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const next = {
      ArrowUp: value + step, ArrowRight: value + step,
      ArrowDown: value - step, ArrowLeft: value - step,
      PageUp: value + step * 10, PageDown: value - step * 10,
      Home: min, End: max,
    }[e.key]
    if (next === undefined) return
    e.preventDefault()
    const v = clamp(next)
    if (v !== value) onChange(v)
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      className={`relative ${width} h-[50vh] rounded-2xl overflow-hidden cursor-pointer select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900`}
      style={{ background: trackBackground }}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.focus({ preventScroll: true })
        setDragging(true)
        onChange(valueFromY(e.currentTarget, e.clientY))
      }}
      onPointerMove={e => {
        if (!dragging) return
        onChange(valueFromY(e.currentTarget, e.clientY))
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      {fillColor && (
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ height: `${fillPct}%`, background: fillColor }}
        />
      )}
      <div
        className="absolute left-1 right-1 h-2.5 rounded-full pointer-events-none"
        style={{
          bottom: `max(5px, min(calc(100% - 10px), calc(${fillPct}% - 5px)))`,
          background: thumbColor ?? 'rgba(255,255,255,0.92)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.55)',
        }}
      />
    </div>
  )
}

type SliderMode = 'brightness' | 'colorTemp' | 'color'

const TAB_LABEL: Record<SliderMode, string> = {
  brightness: 'Brightness',
  colorTemp: 'Color Temp',
  color: 'Color',
}

export function LightDetail({
  light,
  onClose,
  onSetState,
  onToggle,
}: {
  light: HueLight
  onClose: () => void
  onSetState: (state: LightState) => void
  onToggle: () => void
}) {
  const hasBrightness = lightHasBrightness(light)
  const hasColorTemp = light.colorTemp !== undefined
  const hasColor = light.hue !== undefined

  const tabs: SliderMode[] = []
  if (hasBrightness) tabs.push('brightness')
  if (hasColorTemp) tabs.push('colorTemp')
  if (hasColor) tabs.push('color')

  const [mode, setMode] = useState<SliderMode>('brightness')
  const activeMode: SliderMode | undefined = tabs.includes(mode) ? mode : tabs[0]

  // The bridge rejects bri/ct/hue/sat on a light that is off ("Device is set to
  // off"), so moving a slider on an off light switches it on in the same command.
  const withOn = (s: LightState): LightState => (light.on ? s : { on: true, ...s })

  // One draft per field: a broadcast for another field (or a stale echo) never
  // resets the slider being dragged.
  const [bri, setBri] = useDraft(light.brightness || 128, v => onSetState(withOn({ brightness: v })), LIGHT_THROTTLE_MS)
  const [ct, setCt] = useDraft(light.colorTemp ?? 366, v => onSetState(withOn({ colorTemp: v })), LIGHT_THROTTLE_MS)
  const [hue, setHue] = useDraft(light.hue ?? 0, v => onSetState(withOn({ hue: v })), LIGHT_THROTTLE_MS)
  const [sat, setSat] = useDraft(light.saturation ?? 254, v => onSetState(withOn({ saturation: v })), LIGHT_THROTTLE_MS)

  const hueAngle = Math.round((hue / 65535) * 360)
  const satPct = Math.round((sat / 254) * 100)
  const kelvin = Math.round(1000000 / ct)
  // CT slider: invert so warm (high mireds) = bottom, cool (low mireds) = top
  const ctDisplayVal = 653 - ct

  return (
    <div
      className="p-5 space-y-5"
      style={{ background: `linear-gradient(to bottom, ${lightDisplayColor(light, 0.2)} 0%, transparent 55%)` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-zinc-100 truncate">{light.name}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{light.type}{!light.reachable && ' · Unreachable'}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <Toggle on={light.on} disabled={!light.reachable} onToggle={onToggle} label={`${light.name} power`} />
          <CloseButton onClick={onClose} />
        </div>
      </div>

      {/* Tab switcher */}
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Control" className="flex gap-2">
          {tabs.map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeMode === tab}
              onClick={() => setMode(tab)}
              className={`min-h-10 px-4 py-2 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                activeMode === tab
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {TAB_LABEL[tab]}
            </button>
          ))}
        </div>
      )}

      {/* Slider area */}
      <div className="flex justify-center pb-2">
        {activeMode === undefined && (
          <p className="text-sm text-zinc-500 py-6">This device can only be switched on and off.</p>
        )}

        {activeMode === 'brightness' && (
          <div className="flex flex-col items-center gap-3">
            <VerticalSlider
              value={bri}
              min={1}
              max={254}
              onChange={setBri}
              label="Brightness"
              valueText={briPct(bri)}
              trackBackground="#27272a"
              fillColor="#fbbf24"
            />
            <span aria-hidden className="text-sm font-mono text-zinc-400">{briPct(bri)}</span>
          </div>
        )}

        {activeMode === 'colorTemp' && (
          <div className="flex flex-col items-center gap-3">
            <VerticalSlider
              value={ctDisplayVal}
              min={153}
              max={500}
              onChange={displayVal => setCt(653 - displayVal)}
              label="Color temperature"
              valueText={`${kelvin} kelvin`}
              trackBackground="linear-gradient(to top, #ff6a00, #ff9a3c, #ffd28c, #fff8e7, #c9e8ff)"
            />
            <span aria-hidden className="text-sm font-mono text-zinc-400">{kelvin}K</span>
          </div>
        )}

        {activeMode === 'color' && (
          <div className="flex gap-6 justify-center">
            <div className="flex flex-col items-center gap-3">
              <VerticalSlider
                value={hue}
                min={0}
                max={65535}
                onChange={setHue}
                label="Hue"
                valueText={`${hueAngle} degrees`}
                trackBackground="linear-gradient(to top, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)"
                thumbColor={`hsl(${hueAngle}, 100%, 50%)`}
                width="w-24"
              />
              <div aria-hidden className="text-center space-y-0.5">
                <span className="text-sm font-mono text-zinc-400 block">{hueAngle}°</span>
                <span className="text-[10px] uppercase tracking-widest text-zinc-600">Hue</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <VerticalSlider
                value={sat}
                min={0}
                max={254}
                onChange={setSat}
                label="Saturation"
                valueText={`${satPct}%`}
                trackBackground={`linear-gradient(to top, #808080, hsl(${hueAngle}, 100%, 50%))`}
                thumbColor={`hsl(${hueAngle}, ${satPct}%, 50%)`}
                width="w-24"
              />
              <div aria-hidden className="text-center space-y-0.5">
                <span className="text-sm font-mono text-zinc-400 block">{satPct}%</span>
                <span className="text-[10px] uppercase tracking-widest text-zinc-600">Saturation</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Compact light tile inside the room sheet. The whole tile is a real button
 * (stretched under the content) so it is keyboard- and screen-reader-operable;
 * the switch sits above it.
 */
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
      className={`relative rounded-lg border p-3 flex flex-col gap-2 transition-colors ${
        !light.reachable
          ? 'border-zinc-800/50 bg-zinc-900/30 opacity-50'
          : selected
          ? 'border-amber-400/70 bg-amber-500/10'
          : light.on
          ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(light.id)}
        disabled={!light.reachable}
        aria-haspopup="dialog"
        aria-label={`${light.name}${light.reachable ? '' : ', unreachable'}`}
        className="absolute inset-0 rounded-lg cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      />
      <div className="relative flex items-start justify-between gap-2 pointer-events-none">
        <p className="text-xs font-medium text-zinc-100 truncate flex-1">{light.name}</p>
        <div className="pointer-events-auto">
          <Toggle
            on={light.on}
            disabled={!light.reachable}
            onToggle={() => onToggle(light.id, !light.on)}
            label={`${light.name} power`}
          />
        </div>
      </div>
      {light.on && light.reachable && lightHasBrightness(light) && (
        <p className="relative pointer-events-none text-[10px] text-zinc-500 font-mono">{briPct(light.brightness)}</p>
      )}
    </div>
  )
}

export function LightModal({
  light,
  onClose,
  onSetState,
  onToggle,
}: {
  light: HueLight
  onClose: () => void
  onSetState: (state: LightState) => void
  onToggle: () => void
}) {
  return (
    <Sheet onClose={onClose}>
      <LightDetail light={light} onClose={onClose} onSetState={onSetState} onToggle={onToggle} />
    </Sheet>
  )
}

export function RoomModal({
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
  // Escape is handled by the dialog stack: with a light sheet open on top, only that one closes.
  return (
    <Sheet onClose={onClose} wide secondary>
      <div className="flex items-start justify-between gap-3 p-5 pb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{group.name}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {group.type} · {group.lightIds.length} light{group.lightIds.length !== 1 ? 's' : ''}
          </p>
        </div>
        <CloseButton onClick={onClose} className="mt-0.5" />
      </div>

      <div className="px-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">All Lights</span>
          <Toggle
            on={group.on}
            disabled={false}
            onToggle={() => onGroupToggle(group.id, !group.on)}
            label={`All lights in ${group.name}`}
          />
        </div>
        {group.on && <GroupBrightnessSlider group={group} onBrightness={onGroupBrightness} />}
      </div>

      <div aria-hidden className="flex items-center gap-3 px-5 py-4">
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Lights</span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

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
    </Sheet>
  )
}
