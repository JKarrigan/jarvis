'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { formatTime } from '../playerUi'
import { formatTaken, monthLabel, thumbUrl, type PhotoItem } from './api'
import { CheckboxIcon, HeartIcon, PlayGlyph } from './icons'

/** Square tile min width: 70% of the Reel poster grid's --grid-min (3 columns on a phone). */
export const PHOTO_GRID_STYLE: React.CSSProperties = {
  gridTemplateColumns: 'repeat(auto-fill, minmax(calc(var(--grid-min) * 0.7), 1fr))',
}

/** Thumb over a neutral shimmer placeholder; fades in on load, stays a quiet grey tile on error. */
export function Thumb({ item, size = 't', className = '', eager = false }: { item: Pick<PhotoItem, 'id' | 'size'>; size?: 't' | 'p'; className?: string; eager?: boolean }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const px = size === 't' ? 400 : 1600
  return (
    <div className={`absolute inset-0 overflow-hidden bg-white/[0.06] ${state === 'loading' ? 'reel-shimmer' : ''} ${className}`}>
      {state !== 'error' && (
        <Image
          src={thumbUrl(item, size)}
          alt=""
          width={px}
          height={px}
          unoptimized
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  )
}

const LONG_PRESS_MS = 450

type TileProps = {
  item: PhotoItem
  selecting: boolean
  selected: boolean
  /** Opens the viewer (normal mode). */
  onOpen: (id: string) => void
  /** Toggles selection; `range` = shift-click. */
  onToggle: (id: string, range: boolean) => void
  /** Extra badge in the top-left (e.g. "Missing" in the trash). */
  badge?: React.ReactNode
  /** Above-the-fold tiles load eagerly (LCP). */
  eager?: boolean
}

export const PhotoTile = memo(function PhotoTile({ item, selecting, selected, onOpen, onToggle, badge, eager }: TileProps) {
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const label = `${item.kind === 'video' ? 'Video' : 'Photo'}, ${formatTaken(item.takenAt)}${item.favorite ? ', favourite' : ''}`

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }
  useEffect(() => cancelPress, [])

  // Long-press on touch enters selection mode with this tile selected.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || selecting) return
    const timer = setTimeout(() => {
      press.current = null
      suppressClick.current = true
      if (typeof navigator.vibrate === 'function') navigator.vibrate(12)
      onToggle(item.id, false)
    }, LONG_PRESS_MS)
    press.current = { timer, x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress()
  }

  const onClick = (e: React.MouseEvent) => {
    if (suppressClick.current) { suppressClick.current = false; e.preventDefault(); return }
    if (selecting) { e.preventDefault(); onToggle(item.id, e.shiftKey); return }
    // Let modified clicks open the shareable link normally (new tab etc).
    if (e.metaKey || e.ctrlKey || e.button !== 0) return
    e.preventDefault()
    if (e.shiftKey) { onToggle(item.id, false); return }
    onOpen(item.id)
  }

  const inner = (
    <>
      <div className={`absolute inset-0 overflow-hidden rounded-[6px] transition-transform duration-150 md:rounded-[10px] ${selected ? 'scale-[0.9]' : ''}`}>
        <Thumb item={item} eager={eager} />
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.06]" />
        {item.kind === 'video' && (
          <>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent" />
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
              <PlayGlyph className="h-3 w-3" />
              {item.duration != null ? formatTime(item.duration) : ''}
            </span>
          </>
        )}
        {item.favorite && (
          <HeartIcon className="absolute bottom-1.5 left-1.5 h-4 w-4 drop-shadow" fill="currentColor" style={{ color: 'var(--fav)' }} />
        )}
        {badge && <span className="absolute left-1.5 top-1.5">{badge}</span>}
      </div>
      {/* Select circle: always present, so one tap enters selection mode from any tile.
          Hover-only on mouse devices, faintly visible on touch screens (no hover). */}
      <span
        role="button"
        aria-label={selected ? 'Deselect' : 'Select'}
        onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle(item.id, e.shiftKey) }}
        onPointerDown={e => e.stopPropagation()}
        className={`absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full transition ${
          selected ? 'text-accent' : 'bg-black/35 text-white/90 hover:bg-black/60'
        } ${selecting ? '' : 'opacity-70 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-visible:opacity-100'}`}
      >
        <CheckboxIcon checked={selected} className="h-6 w-6" />
      </span>
      {selected && <span className="pointer-events-none absolute inset-0 rounded-[8px] ring-2 ring-[var(--accent)] md:rounded-[12px]" />}
    </>
  )

  const common = {
    onClick,
    onPointerDown,
    onPointerMove,
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: React.MouseEvent) => { if (press.current || suppressClick.current) e.preventDefault() },
    className: 'group relative block aspect-square w-full select-none outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:rounded-[10px]',
  }

  // One element in both modes (no remount/flash, focus survives entering selection mode);
  // in selection mode it's exposed as a checkbox and Space toggles it.
  return (
    <a
      href={`?v=${item.id}`}
      aria-label={label}
      role={selecting ? 'checkbox' : undefined}
      aria-checked={selecting ? selected : undefined}
      draggable={false}
      onKeyDown={e => { if (selecting && e.key === ' ') { e.preventDefault(); onToggle(item.id, e.shiftKey) } }}
      {...common}
    >
      {inner}
    </a>
  )
})

type GridProps = {
  items: PhotoItem[]
  selecting: boolean
  selected: Set<string>
  onOpen: (id: string) => void
  onToggle: (id: string, range: boolean) => void
  /** Month sections with plain headings (timeline); flat grid otherwise (trash). */
  sections?: boolean
  badge?: (item: PhotoItem) => React.ReactNode
}

type Section = { key: string; label: string; items: PhotoItem[] }

function groupByMonth(items: PhotoItem[]): Section[] {
  const out: Section[] = []
  for (const it of items) {
    const d = new Date(it.takenAt)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    const last = out[out.length - 1]
    if (last && last.key === key) last.items.push(it)
    else out.push({ key, label: monthLabel(d.getFullYear(), d.getMonth() + 1), items: [it] })
  }
  return out
}

/** The square grid, optionally split into month sections with plain headings (no sticky bar). */
export function PhotoGrid({ items, selecting, selected, onOpen, onToggle, sections = true, badge }: GridProps) {
  const groups = useMemo<Section[]>(
    () => (sections ? groupByMonth(items) : [{ key: 'all', label: '', items }]),
    [items, sections],
  )

  const eagerIds = useMemo(() => new Set(items.slice(0, 12).map(i => i.id)), [items])
  const tiles = (list: PhotoItem[]) => (
    <div className="grid gap-1 md:gap-1.5" style={PHOTO_GRID_STYLE}>
      {list.map(it => (
        <PhotoTile
          key={it.id}
          item={it}
          selecting={selecting}
          selected={selected.has(it.id)}
          onOpen={onOpen}
          onToggle={onToggle}
          badge={badge?.(it)}
          eager={eagerIds.has(it.id)}
        />
      ))}
    </div>
  )

  if (!sections) return tiles(items)

  return (
    <div>
      {groups.map(g => (
        <section key={g.key} aria-label={g.label} className="pb-5">
          <h2 className="mb-2.5 flex items-baseline justify-between px-0.5 pt-1 text-[17px] font-bold tracking-[-0.01em] text-ink">
            <span>{g.label}</span>
            <span className="text-[12px] font-semibold text-white/45" style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}>
              {g.items.length.toLocaleString('en-GB')}
            </span>
          </h2>
          {tiles(g.items)}
        </section>
      ))}
    </div>
  )
}

/** Sentinel that calls `onVisible` when it scrolls within ~1.5 screens; re-arms after every page. */
export function LoadMoreSentinel({ onVisible, armed, version }: { onVisible: () => void; armed: boolean; version: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(onVisible)
  useEffect(() => { cb.current = onVisible }, [onVisible])
  useEffect(() => {
    const el = ref.current
    if (!el || !armed) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) cb.current()
    }, { rootMargin: '1200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [armed, version])
  return <div ref={ref} aria-hidden className="h-px w-full" />
}

/** Grid-shaped skeleton (also used by loading.tsx through PhotosSkeleton). */
export function GridSkeleton({ count = 18 }: { count?: number }) {
  return (
    <div className="grid gap-1 md:gap-1.5" style={PHOTO_GRID_STYLE} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="reel-shimmer aspect-square rounded-[6px] md:rounded-[10px]" />
      ))}
    </div>
  )
}
