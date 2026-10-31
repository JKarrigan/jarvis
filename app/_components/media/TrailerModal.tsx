'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { CloseIcon } from './icons'
import { useDialog } from './hooks'

/** Full-screen YouTube trailer overlay. Parent owns the AnimatePresence (same
    contract as JellyfinPlayer). Local trailers don't come here — they play
    through JellyfinPlayer; this is only for RemoteTrailers embeds. */
export default function TrailerModal({ youtubeId, remoteUrl, title, onClose }: {
  youtubeId: string
  remoteUrl?: string
  title?: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useDialog(dialogRef, onClose)

  // Keystrokes inside the cross-origin iframe never reach this page, so Escape would
  // stop working the moment someone clicks the video. When the iframe takes focus,
  // hand it straight back to the close button: clicks inside the player still work,
  // and Escape keeps closing the trailer.
  useEffect(() => {
    const onBlur = () => {
      setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement && dialogRef.current?.contains(document.activeElement)) {
          closeRef.current?.focus({ preventScroll: true })
        }
      }, 0)
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
  const label = title ?? 'Trailer'

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm md:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={onClose}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="w-full max-w-[1100px]"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: [0.32, 0, 0.67, 0] } }}
        transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0 truncate text-sm font-semibold text-ink">{label}</div>
          <div className="flex shrink-0 items-center gap-2">
            {remoteUrl && (
              <a
                href={remoteUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur-md transition hover:bg-white/10 hover:text-ink"
              >
                Open on YouTube
              </a>
            )}
            <button
              ref={closeRef}
              data-autofocus
              type="button"
              onClick={onClose}
              aria-label="Close trailer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 backdrop-blur-md transition hover:bg-white/10 hover:text-ink"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
          <iframe
            src={src}
            title={label}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </motion.div>
    </motion.div>
  )
}
