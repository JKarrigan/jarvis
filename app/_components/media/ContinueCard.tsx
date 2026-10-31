'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import type { ContinueItem } from './types'
import { imageSrcSet } from './artwork'
import { HOVER_REVEAL, Poster } from './ReelCards'
import { PlayIcon, CloseIcon } from './icons'

const JellyfinPlayer = dynamic(() => import('./JellyfinPlayer'), { ssr: false })

/** 16:9 continue-watching card — clicking resumes playback; the × clears its progress. */
export function ContinueCard({ item, onCleared }: { item: ContinueItem; onCleared?: () => void }) {
  const router = useRouter()
  const [playing, setPlaying] = useState(false)
  const [clearing, setClearing] = useState(false)
  const playerTitle = [item.title, item.subtitle].filter(Boolean).join(' · ')

  const clearProgress = async () => {
    if (clearing) return
    setClearing(true)
    const res = await fetch(`/api/jellyfin/progress/${encodeURIComponent(item.id)}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) onCleared?.()
    else setClearing(false)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPlaying(true)}
        aria-label={`Resume ${playerTitle}`}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setPlaying(true) } }}
        className="group flex w-[300px] shrink-0 cursor-pointer flex-col gap-2 text-left"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-xl shadow-[0_16px_34px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:-translate-y-1">
          <Poster gradient={item.backdropColor} src={item.backdropUrl} srcSet={imageSrcSet(item.backdropUrl, [480, 720])} sizes="300px" alt={item.title} rounded="rounded-none" className="h-full w-full" />
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition group-hover:scale-110">
              <PlayIcon className="h-5 w-5" />
            </span>
          </div>
          {item.sub && (
            <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              {item.sub}
            </span>
          )}
          <button
            type="button"
            aria-label={`Clear progress for ${item.title}`}
            title="Clear progress"
            onClick={(e) => { e.stopPropagation(); clearProgress() }}
            disabled={clearing}
            className={`absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/75 disabled:opacity-50 ${HOVER_REVEAL}`}
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div className="h-full" style={{ width: `${Math.max(4, item.progress * 100)}%`, background: 'var(--accent)' }} />
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink">{item.title}</p>
          {item.subtitle && <p className="truncate text-[11.5px] text-white/45">{item.subtitle}</p>}
        </div>
      </div>

      <AnimatePresence>
        {playing && (
          <JellyfinPlayer
            itemId={item.id}
            title={playerTitle}
            splashUrl={item.backdropUrl}
            // Refresh so the card's progress / Continue Watching reflect the session.
            onClose={() => { setPlaying(false); router.refresh() }}
          />
        )}
      </AnimatePresence>
    </>
  )
}
