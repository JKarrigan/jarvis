'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { HueLight, HueGroup } from '@/lib/types'

export type LightState = {
  on?: boolean
  brightness?: number
  colorTemp?: number
  hue?: number
  saturation?: number
}

export function briPct(bri: number) {
  return `${Math.round((bri / 254) * 100)}%`
}

export function sliderFill(value: number, min: number, max: number): React.CSSProperties {
  return { '--fill': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties
}

// Full-brightness HSL for the lamp's configured color, ignoring on/off state.
// Used by lightColorHex and lightTextColor which describe the lamp's color, not its power state.
function lampHsl(light: HueLight): [number, number, number] {
  if (light.hue !== undefined && light.saturation !== undefined) {
    return [Math.round((light.hue / 65535) * 360), Math.round((light.saturation / 254) * 100), 55]
  }
  if (light.colorTemp !== undefined) {
    const ratio = (light.colorTemp - 153) / (500 - 153)
    return [Math.round(ratio * 38), Math.round(ratio * 80), 70]
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

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return isMobile
}

export function Toggle({ on, disabled, onToggle }: { on: boolean; disabled: boolean; onToggle: () => void }) {
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

export function Modal({ onClose, wide, children }: { onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={onClose}
      />
      <motion.div
        className={`relative z-[90] w-full ${wide ? 'max-w-md' : 'max-w-sm'} max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18, ease: [0.32, 0, 0.67, 0] } }}
        transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
      >
        {children}
      </motion.div>
    </div>
  )
}

export function Drawer({ onClose, secondary, children }: { onClose: () => void; secondary?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    if (secondary) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, secondary])

  return (
    <div className={`fixed inset-0 flex flex-col justify-end ${secondary ? 'z-[60]' : 'z-[80]'}`}>
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={onClose}
      />
      <motion.div
        className={`relative w-full max-h-[92vh] overflow-y-auto rounded-t-2xl border-t border-zinc-700 bg-zinc-900 shadow-2xl ${secondary ? 'z-[70]' : 'z-[90]'}`}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.28, ease: [0.32, 0, 0.67, 0] } }}
        transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>
        {children}
      </motion.div>
    </div>
  )
}

export function Sheet({ onClose, wide, secondary, children }: { onClose: () => void; wide?: boolean; secondary?: boolean; children: React.ReactNode }) {
  const isMobile = useIsMobile()
  return isMobile
    ? <Drawer onClose={onClose} secondary={secondary}>{children}</Drawer>
    : <Modal onClose={onClose} wide={wide}>{children}</Modal>
}

export function SliderRow({ label, value, children }: { label: string; value: React.ReactNode; children: React.ReactNode }) {
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

function VerticalSlider({
  value, min, max, onChange,
  trackBackground, fillColor, thumbColor,
  width = 'w-36',
}: {
  value: number
  min: number
  max: number
  onChange: (val: number) => void
  trackBackground: string
  fillColor?: string
  thumbColor?: string
  width?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const fillPct = ((value - min) / (max - min)) * 100

  function getValueFromY(clientY: number) {
    if (!trackRef.current) return value
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = 1 - (clientY - rect.top) / rect.height
    return Math.round(min + Math.max(0, Math.min(1, ratio)) * (max - min))
  }

  return (
    <div
      ref={trackRef}
      className={`relative ${width} h-[50vh] rounded-2xl overflow-hidden cursor-pointer select-none touch-none`}
      style={{ background: trackBackground }}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = true
        onChange(getValueFromY(e.clientY))
      }}
      onPointerMove={e => {
        if (!dragging.current) return
        onChange(getValueFromY(e.clientY))
      }}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
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
  const hasBrightness = !light.type.toLowerCase().includes('on/off')
  const hasColorTemp = light.colorTemp !== undefined
  const hasColor = light.hue !== undefined

  const defaultMode: SliderMode = 'brightness'
  const [mode, setMode] = useState<SliderMode>(defaultMode)

  const [localBri, setLocalBri] = useState(light.brightness || 128)
  const [localCt, setLocalCt] = useState(light.colorTemp ?? 366)
  const [localHue, setLocalHue] = useState(light.hue ?? 0)
  const [localSat, setLocalSat] = useState(light.saturation ?? 254)

  const briTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ctTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hueTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const satTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalBri(light.brightness || 128)
    if (light.colorTemp) setLocalCt(light.colorTemp)
    if (light.hue !== undefined) setLocalHue(light.hue)
    if (light.saturation !== undefined) setLocalSat(light.saturation)
  }, [light])

  function handleBri(val: number) {
    setLocalBri(val)
    if (briTimer.current) clearTimeout(briTimer.current)
    briTimer.current = setTimeout(() => onSetState({ brightness: val }), 300)
  }

  function handleCt(val: number) {
    setLocalCt(val)
    if (ctTimer.current) clearTimeout(ctTimer.current)
    ctTimer.current = setTimeout(() => onSetState({ colorTemp: val }), 300)
  }

  function handleHue(val: number) {
    setLocalHue(val)
    if (hueTimer.current) clearTimeout(hueTimer.current)
    hueTimer.current = setTimeout(() => onSetState({ hue: val }), 150)
  }

  function handleSat(val: number) {
    setLocalSat(val)
    if (satTimer.current) clearTimeout(satTimer.current)
    satTimer.current = setTimeout(() => onSetState({ saturation: val }), 150)
  }

  const hueAngle = Math.round((localHue / 65535) * 360)
  const satPct = Math.round((localSat / 254) * 100)
  const kelvin = Math.round(1000000 / localCt)
  // CT slider: invert so warm (high mireds) = bottom, cool (low mireds) = top
  const ctDisplayVal = 653 - localCt

  const tabs: SliderMode[] = []
  if (hasBrightness) tabs.push('brightness')
  if (hasColorTemp) tabs.push('colorTemp')
  if (hasColor) tabs.push('color')

  const tabLabel: Record<SliderMode, string> = {
    brightness: 'Brightness',
    colorTemp: 'Color Temp',
    color: 'Color',
  }

  return (
    <div
      className="p-5 space-y-5"
      style={{ background: `linear-gradient(to bottom, ${lightDisplayColor(light, 0.2)} 0%, transparent 55%)` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100 truncate">{light.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{light.type}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Toggle on={light.on} disabled={!light.reachable} onToggle={onToggle} />
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none p-0.5"
          >
            ×
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      {tabs.length > 1 && (
        <div className="flex gap-2">
          {tabs.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setMode(tab)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                mode === tab
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tabLabel[tab]}
            </button>
          ))}
        </div>
      )}

      {/* Slider area */}
      <div className="flex justify-center pb-2">
        {mode === 'brightness' && (
          <div className="flex flex-col items-center gap-3">
            <VerticalSlider
              value={localBri}
              min={1}
              max={254}
              onChange={handleBri}
              trackBackground="#27272a"
              fillColor="#fbbf24"
            />
            <span className="text-sm font-mono text-zinc-400">{briPct(localBri)}</span>
          </div>
        )}

        {mode === 'colorTemp' && (
          <div className="flex flex-col items-center gap-3">
            <VerticalSlider
              value={ctDisplayVal}
              min={153}
              max={500}
              onChange={displayVal => handleCt(653 - displayVal)}
              trackBackground="linear-gradient(to top, #ff6a00, #ff9a3c, #ffd28c, #fff8e7, #c9e8ff)"
            />
            <span className="text-sm font-mono text-zinc-400">{kelvin}K</span>
          </div>
        )}

        {mode === 'color' && (
          <div className="flex gap-6 justify-center">
            <div className="flex flex-col items-center gap-3">
              <VerticalSlider
                value={localHue}
                min={0}
                max={65535}
                onChange={handleHue}
                trackBackground="linear-gradient(to top, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)"
                thumbColor={`hsl(${hueAngle}, 100%, 50%)`}
                width="w-24"
              />
              <div className="text-center space-y-0.5">
                <span className="text-sm font-mono text-zinc-400 block">{hueAngle}°</span>
                <span className="text-[10px] uppercase tracking-widest text-zinc-600">Hue</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <VerticalSlider
                value={localSat}
                min={0}
                max={254}
                onChange={handleSat}
                trackBackground={`linear-gradient(to top, #808080, hsl(${hueAngle}, 100%, 50%))`}
                thumbColor={`hsl(${hueAngle}, ${satPct}%, 50%)`}
                width="w-24"
              />
              <div className="text-center space-y-0.5">
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

export function LightMiniCard({
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
  const [localBri, setLocalBri] = useState(group.brightness)
  const [pending, setPending] = useState(false)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!pending) setLocalBri(group.brightness)
  }, [group.brightness, pending])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !selectedLightId) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedLightId, onClose])

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
    <Sheet onClose={onClose} wide secondary>
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
              style={sliderFill(localBri, 1, 254)}
              className="flex-1 accent-slider"
            />
            <span className="text-xs font-mono text-zinc-400 w-9 text-right">{briPct(localBri)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 px-5 py-4">
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
