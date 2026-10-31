'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  deleteForever, errorText, fetchJson, fileUrl, formatTaken, isAbort, restorePhoto, setFavorite, thumbUrl, trashPhoto,
  type PhotoDetail, type PhotoItem,
} from './api'
import { useBodyScrollLock, useIsDesktop } from './hooks'
import { ConfirmDialog } from './Dialog'
import { ZoomImage, type ZoomHandle } from './ZoomImage'
import { VideoView } from './VideoView'
import { InfoPanel } from './InfoPanel'
import {
  ChevronLeftIcon, ChevronRightIcon, CloseIcon, DownloadIcon, HeartIcon, InfoIcon, RestoreIcon, TrashIcon, ZoomIcon,
} from './icons'

export type ViewerMode = 'library' | 'trash'

type Props = {
  id: string
  items: PhotoItem[]
  mode?: ViewerMode
  hasMore: boolean
  onNeedMore: () => void
  /** Move to another item (replaces the `?v=` history entry). */
  onGo: (id: string) => void
  onClose: () => void
  /** Local update of an item (optimistic favorite). */
  onItemChange: (id: string, patch: Partial<PhotoItem>) => void
  /** The item left this list (trashed / restored / deleted forever). */
  onRemoved: (id: string) => void
}

function TopButton({ label, onClick, active, children, disabled }: { label: string; onClick?: () => void; active?: boolean; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={label}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/15 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/**
 * Full-screen lightbox over the current page. Opened via `?v=<id>`; prev/next by swipe,
 * arrow keys, edge taps and the side chevrons; preloads the neighbours' previews.
 */
export function PhotoViewer({ id, items, mode = 'library', hasMore, onNeedMore, onGo, onClose, onItemChange, onRemoved }: Props) {
  useBodyScrollLock()
  const reduce = useReducedMotion()
  const desktop = useIsDesktop()
  const index = items.findIndex(i => i.id === id)

  // Opened from a link to an item that isn't in the loaded list: fetch it on its own.
  const [solo, setSolo] = useState<{ id: string; item: PhotoItem | null; error: string | null } | null>(null)
  useEffect(() => {
    if (index >= 0) return
    const ctrl = new AbortController()
    fetchJson<PhotoDetail>(`/api/photos/${id}`, { signal: ctrl.signal })
      .then(item => setSolo({ id, item, error: null }))
      .catch(e => { if (!isAbort(e)) setSolo({ id, item: null, error: errorText(e) }) })
    return () => ctrl.abort()
  }, [id, index])
  const soloHere = solo?.id === id ? solo : null
  const item: PhotoItem | null = index >= 0 ? items[index] : soloHere?.item ?? null

  const prev = index > 0 ? items[index - 1] : null
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null

  const [dir, setDir] = useState<1 | -1>(1)
  const [chrome, setChrome] = useState(true)
  const [info, setInfo] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [confirm, setConfirm] = useState<null | 'trash' | 'forever'>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const zoomRef = useRef<ZoomHandle>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)

  const registerVideo = useCallback((el: HTMLVideoElement | null) => { videoRef.current = el }, [])

  const go = useCallback((delta: 1 | -1) => {
    const target = delta > 0 ? next : prev
    if (!target) return
    setDir(delta)
    setZoomed(false)
    onGo(target.id)
  }, [next, prev, onGo])

  // Keep paging the list as the viewer approaches the loaded end.
  useEffect(() => {
    if (hasMore && index >= 0 && index >= items.length - 4) onNeedMore()
  }, [hasMore, index, items.length, onNeedMore])

  // Preload the neighbours' previews.
  useEffect(() => {
    for (const n of [next, prev]) {
      if (!n) continue
      const img = new Image()
      img.decoding = 'async'
      img.src = thumbUrl(n, 'p')
    }
  }, [next, prev])

  // Focus the close button on open; give focus back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeBtn.current?.focus({ preventScroll: true })
    return () => { if (opener && document.contains(opener)) opener.focus({ preventScroll: true }) }
  }, [])

  const flash = useCallback((text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice(n => (n === text ? null : n)), 2800)
  }, [])

  const toggleFavorite = useCallback(async () => {
    if (!item || mode === 'trash') return
    const want = !item.favorite
    onItemChange(item.id, { favorite: want })
    if (soloHere?.item?.id === item.id) setSolo({ ...soloHere, item: { ...item, favorite: want } })
    try {
      await setFavorite(item.id, want)
    } catch (e) {
      onItemChange(item.id, { favorite: !want })
      if (soloHere?.item?.id === item.id) setSolo({ ...soloHere, item: { ...item, favorite: !want } })
      flash(errorText(e))
    }
  }, [item, mode, onItemChange, soloHere, flash])

  /** After the current item leaves the list: show the next (or previous), else close. */
  const leave = useCallback((removedId: string) => {
    const target = next ?? prev
    if (target && index >= 0) {
      setDir(next ? 1 : -1)
      onGo(target.id)
      onRemoved(removedId)
    } else {
      onRemoved(removedId)
      onClose()
    }
  }, [next, prev, index, onGo, onRemoved, onClose])

  const runRemoval = useCallback(async (kind: 'trash' | 'forever' | 'restore') => {
    if (!item) return
    setBusy(true)
    try {
      if (kind === 'trash') await trashPhoto(item.id)
      else if (kind === 'forever') await deleteForever(item.id)
      else await restorePhoto(item.id)
      setConfirm(null)
      leave(item.id)
    } catch (e) {
      setConfirm(null)
      flash(errorText(e))
    } finally {
      setBusy(false)
    }
  }, [item, leave, flash])

  // Keyboard: Esc close (info first), ←/→, F favorite, I info, Space play/pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          if (info) setInfo(false)
          else onClose()
          break
        case 'ArrowRight': e.preventDefault(); go(1); break
        case 'ArrowLeft': e.preventDefault(); go(-1); break
        case 'f': case 'F': e.preventDefault(); void toggleFavorite(); break
        case 'i': case 'I': e.preventDefault(); setInfo(v => !v); break
        case ' ': {
          const v = videoRef.current
          if (!v || item?.kind !== 'video' || t?.tagName === 'VIDEO') return
          e.preventDefault()
          if (v.paused) void v.play().catch(() => {})
          else v.pause()
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirm, info, go, onClose, toggleFavorite, item?.kind])

  const onTap = useCallback((fx: number) => {
    if (fx < 0.2 && prev) go(-1)
    else if (fx > 0.8 && next) go(1)
    else setChrome(c => !c)
  }, [prev, next, go])

  // Video swipes are handled here (the image component owns its own gestures). Only the
  // upper part of the stage counts, so dragging the native scrubber never changes item.
  const vSwipe = useRef<{ x: number; y: number } | null>(null)
  const onStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (item?.kind !== 'video') return
    const r = e.currentTarget.getBoundingClientRect()
    vSwipe.current = e.clientY - r.top < r.height * 0.72 ? { x: e.clientX, y: e.clientY } : null
  }
  const onStagePointerUp = (e: React.PointerEvent) => {
    const s = vSwipe.current
    vSwipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1)
    else if (dy > 110 && dy > Math.abs(dx) * 1.2) onClose()
  }

  const slide = reduce ? 0 : 56
  const taken = item ? formatTaken(item.takenAt).split(' · ') : []
  const position = index >= 0 ? `${index + 1} of ${items.length}${hasMore ? '+' : ''}` : ''

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={item ? `${item.kind === 'video' ? 'Video' : 'Photo'} viewer` : 'Viewer'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.2 }}
      className="fixed inset-0 z-[80] flex bg-[#050407] text-ink"
      style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}
    >
      <div className="relative min-w-0 flex-1" onPointerDown={onStagePointerDown} onPointerUp={onStagePointerUp}>
        <AnimatePresence initial={false} custom={dir}>
          {item && (
            <motion.div
              key={item.id}
              custom={dir}
              className="absolute inset-0"
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * slide }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: -d * slide }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduce ? 0 : 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            >
              {item.kind === 'video' ? (
                <VideoView item={item} registerVideo={registerVideo} />
              ) : (
                <ZoomImage
                  item={item}
                  handleRef={zoomRef}
                  onSwipe={d => go(d)}
                  onSwipeDown={onClose}
                  onTap={onTap}
                  onZoomChange={setZoomed}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!item && (
          <div className="absolute inset-0 grid place-items-center text-[14px] text-white/60">
            {soloHere?.error ? <p role="alert">{soloHere.error === 'Not found' ? 'This item is no longer in the library.' : soloHere.error}</p> : (
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" aria-label="Loading" />
            )}
          </div>
        )}

        {/* Top bar */}
        <div
          className={`absolute inset-x-0 top-0 z-20 flex items-center gap-1 bg-gradient-to-b from-black/75 via-black/35 to-transparent px-2 pb-8 pt-[calc(env(safe-area-inset-top)+8px)] transition-opacity duration-200 md:px-4 ${chrome ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          onPointerDown={e => e.stopPropagation()}
        >
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label="Close viewer"
            title="Close (Esc)"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 px-1">
            {/* Phones: date on top, time + position below; desktop: the full title on one line. */}
            <p className="truncate text-[14.5px] font-bold text-white" style={{ fontFamily: 'var(--font-schibsted), var(--font-manrope), sans-serif' }}>
              <span className="md:hidden">{taken[0]}</span>
              <span className="hidden md:inline">{taken.join(' · ')}</span>
            </p>
            <p className="truncate text-[11.5px] text-white/50">
              <span className="md:hidden">{[taken[1], position].filter(Boolean).join(' · ')}</span>
              <span className="hidden md:inline">{position}</span>
            </p>
          </div>
          {item && mode === 'library' && (
            <>
              <TopButton label={item.favorite ? 'Remove from favourites (F)' : 'Add to favourites (F)'} onClick={() => void toggleFavorite()} active={item.favorite}>
                <HeartIcon className="h-5 w-5" fill={item.favorite ? 'currentColor' : 'none'} style={item.favorite ? { color: 'var(--fav)' } : undefined} />
              </TopButton>
              {item.kind === 'image' && (
                <span className="hidden md:inline-flex">
                  <TopButton label={zoomed ? 'Zoom out' : 'Zoom in'} onClick={() => zoomRef.current?.toggleZoom()} active={zoomed}>
                    <ZoomIcon className="h-5 w-5" />
                  </TopButton>
                </span>
              )}
              <TopButton label="Info (I)" onClick={() => setInfo(v => !v)} active={info}>
                <InfoIcon className="h-5 w-5" />
              </TopButton>
              <a
                href={fileUrl(item.id, true)}
                download
                aria-label="Download original"
                title="Download original"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/15"
              >
                <DownloadIcon className="h-5 w-5" />
              </a>
              <TopButton label="Delete" onClick={() => setConfirm('trash')}>
                <TrashIcon className="h-5 w-5" />
              </TopButton>
            </>
          )}
          {item && mode === 'trash' && (
            <>
              <TopButton label="Info (I)" onClick={() => setInfo(v => !v)} active={info}>
                <InfoIcon className="h-5 w-5" />
              </TopButton>
              <button
                type="button"
                onClick={() => void runRemoval('restore')}
                disabled={busy || item.missing}
                title={item.missing ? 'The file is gone from the library and cannot be restored' : 'Restore'}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 text-[13px] font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
              >
                <RestoreIcon className="h-4 w-4" /> Restore
              </button>
              <TopButton label="Delete forever" onClick={() => setConfirm('forever')} disabled={busy}>
                <TrashIcon className="h-5 w-5" />
              </TopButton>
            </>
          )}
        </div>

        {/* Side chevrons (desktop / keyboard) */}
        {prev && (
          <button
            type="button"
            onClick={() => go(-1)}
            onPointerDown={e => e.stopPropagation()}
            aria-label="Previous"
            className={`absolute left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/60 md:grid ${chrome ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        )}
        {next && (
          <button
            type="button"
            onClick={() => go(1)}
            onPointerDown={e => e.stopPropagation()}
            aria-label="Next"
            className={`absolute right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/60 md:grid ${chrome ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
        )}

        {notice && (
          <div role="status" className="absolute bottom-[calc(env(safe-area-inset-bottom)+80px)] left-1/2 z-30 -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-[13px] text-white backdrop-blur">
            {notice}
          </div>
        )}

        {info && item && !desktop && <InfoPanel item={item} onClose={() => setInfo(false)} />}
      </div>

      {info && item && desktop && <InfoPanel item={item} onClose={() => setInfo(false)} />}

      {confirm === 'trash' && item && (
        <ConfirmDialog
          title={`Delete this ${item.kind === 'video' ? 'video' : 'photo'}?`}
          body="It moves to Recently deleted, where you can restore it until the trash is emptied."
          confirmLabel="Delete"
          busy={busy}
          onConfirm={() => void runRemoval('trash')}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'forever' && item && (
        <ConfirmDialog
          title="Delete forever?"
          body="The original file is removed from the library. This can't be undone."
          confirmLabel="Delete forever"
          busy={busy}
          onConfirm={() => void runRemoval('forever')}
          onCancel={() => setConfirm(null)}
        />
      )}
    </motion.div>
  )
}
