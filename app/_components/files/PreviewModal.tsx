'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { fileTypeInfo, type ApiFileEntry } from '@/lib/fileTypes'
import { VideoPlayer } from '@/app/_components/VideoPlayer'
import { ChevronLeft, ChevronRight, XIcon } from './icons'
import { apiFetch, isAbort } from './api'

// Text previews show at most this much of a file (a multi-GB log would
// otherwise be pulled into the tab in full).
const TEXT_PREVIEW_BYTES = 256 * 1024

async function readTextPrefix(src: string, size: number, signal: AbortSignal): Promise<string> {
  const big = size > TEXT_PREVIEW_BYTES
  const res = await apiFetch(src, {
    signal,
    headers: big ? { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` } : undefined,
  })
  // Read at most the cap even if the server ignored the Range header.
  const bytes = new Uint8Array(TEXT_PREVIEW_BYTES)
  let len = 0
  let truncated = big
  if (res.body) {
    const reader = res.body.getReader()
    while (len < TEXT_PREVIEW_BYTES) {
      const { value, done } = await reader.read()
      if (done) break
      const n = Math.min(value.byteLength, TEXT_PREVIEW_BYTES - len)
      bytes.set(value.subarray(0, n), len)
      len += n
      if (n < value.byteLength) { truncated = true; break }
    }
    reader.cancel().catch(() => {})
  }
  const text = new TextDecoder().decode(bytes.subarray(0, len))
  return truncated ? `${text}\n\n… (truncated — download the file to see all of it)` : text
}

/** Text preview. FileContent is rendered with `key={filePath}`, so state starts fresh per file. */
function TextContent({ src, size }: { src: string; size: number }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    readTextPrefix(src, size, ctrl.signal)
      .then(setText)
      .catch(e => { if (!isAbort(e)) setText('Failed to load file.') })
    return () => ctrl.abort()
  }, [src, size])

  return (
    <pre className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs p-4 rounded-lg overflow-y-auto max-h-full w-full whitespace-pre-wrap break-words">
      {text ?? 'Loading…'}
    </pre>
  )
}

function FileContent({ entry, filePath }: { entry: ApiFileEntry; filePath: string }) {
  const src = `/api/files/content?path=${encodeURIComponent(filePath)}`
  const { iconKind } = fileTypeInfo(entry.ext)

  if (iconKind === 'image') return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={entry.name} className="max-h-full max-w-full rounded-lg object-contain" />
  )
  if (iconKind === 'video') {
    const videoSrc = `/api/files/video?path=${encodeURIComponent(filePath)}`
    return <VideoPlayer src={videoSrc} />
  }
  if (iconKind === 'text') return <TextContent src={src} size={entry.size} />
  return null
}

export function PreviewModal({
  initialEntry,
  initialFilePath,
  siblings,
  onClose,
}: {
  initialEntry: ApiFileEntry
  initialFilePath: string
  siblings: ApiFileEntry[]
  onClose: () => void
}) {
  const startIdx = Math.max(0, siblings.findIndex(s => s.name === initialEntry.name))
  const [currentIdx, setCurrentIdx] = useState(startIdx)
  const [slideDir, setSlideDir] = useState<1 | -1>(1)
  const contentRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const isSwiping = useRef(false)

  const hasSiblings = siblings.length > 1
  const entry = hasSiblings ? (siblings[currentIdx] ?? initialEntry) : initialEntry
  const folderPath = initialFilePath.split('/').slice(0, -1).join('/')
  const filePath = hasSiblings
    ? (folderPath ? `${folderPath}/${entry.name}` : entry.name)
    : initialFilePath

  const canPrev = hasSiblings && currentIdx > 0
  const canNext = hasSiblings && currentIdx < siblings.length - 1

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (!hasSiblings) return
      // The video player owns Arrow keys for seeking (it may not hold focus), so
      // don't navigate siblings out from under a playing video.
      if (fileTypeInfo(entry.ext).iconKind === 'video') return
      if (e.key === 'ArrowLeft') { setSlideDir(-1); setCurrentIdx(i => Math.max(0, i - 1)) }
      else if (e.key === 'ArrowRight') { setSlideDir(1); setCurrentIdx(i => Math.min(siblings.length - 1, i + 1)) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, hasSiblings, siblings.length, entry.ext])

  // Non-passive touchmove so we can preventDefault and prevent browser scroll hijacking
  useEffect(() => {
    const el = contentRef.current
    if (!el || !hasSiblings) return
    const onStart = (e: TouchEvent) => {
      // Don't treat scrubbing the player's seek/volume slider as a file swipe.
      if ((e.target as HTMLElement | null)?.closest('[role="slider"]')) {
        touchStartX.current = NaN
        isSwiping.current = false
        return
      }
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
      isSwiping.current = false
    }
    const onMove = (e: TouchEvent) => {
      if (Number.isNaN(touchStartX.current)) return
      const dx = e.touches[0].clientX - touchStartX.current
      const dy = Math.abs(e.touches[0].clientY - touchStartY.current)
      if (!isSwiping.current) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > dy) isSwiping.current = true
        else if (dy > 8) return
      }
      if (isSwiping.current) e.preventDefault()
    }
    const onEnd = (e: TouchEvent) => {
      if (Number.isNaN(touchStartX.current) || !isSwiping.current) return
      const dx = e.changedTouches[0].clientX - touchStartX.current
      if (dx < -40 && canNext) { setSlideDir(1); setCurrentIdx(i => Math.min(siblings.length - 1, i + 1)) }
      else if (dx > 40 && canPrev) { setSlideDir(-1); setCurrentIdx(i => Math.max(0, i - 1)) }
      isSwiping.current = false
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [hasSiblings, siblings.length, canPrev, canNext])

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex flex-col">
      <motion.div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={onClose}
      />

      <motion.div
        className="relative z-10 flex flex-col h-full"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18, ease: [0.32, 0, 0.67, 0] } }}
        transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
          {hasSiblings && (
            <button
              onClick={() => { setSlideDir(-1); setCurrentIdx(i => Math.max(0, i - 1)) }}
              disabled={!canPrev}
              aria-label="Previous file"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-20 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <ChevronLeft />
            </button>
          )}
          <p className="flex-1 text-sm text-zinc-300 truncate min-w-0">{entry.name}</p>
          {hasSiblings && (
            <span className="text-xs text-zinc-600 shrink-0 tabular-nums">
              {currentIdx + 1} / {siblings.length}
            </span>
          )}
          {hasSiblings && (
            <button
              onClick={() => { setSlideDir(1); setCurrentIdx(i => Math.min(siblings.length - 1, i + 1)) }}
              disabled={!canNext}
              aria-label="Next file"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-20 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <ChevronRight size={20} />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <XIcon />
          </button>
        </div>

        {/* Content area — fills remaining height, no overflow escape */}
        <div
          ref={contentRef}
          className="flex-1 relative overflow-hidden"
          onClick={onClose}
        >
          <AnimatePresence mode="wait" custom={slideDir} initial={false}>
            <motion.div
              key={entry.name}
              custom={slideDir}
              variants={{
                enter: (d: number) => ({ x: d * 80, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: -d * 80, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.32, 0, 0.67, 0] }}
              className="absolute inset-0 flex items-center justify-center p-4 pb-8"
              onClick={e => e.stopPropagation()}
            >
              <FileContent key={filePath} entry={entry} filePath={filePath} />
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
