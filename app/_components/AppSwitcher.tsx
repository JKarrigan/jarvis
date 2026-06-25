'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const APPS = [
  { key: 'air', label: 'Air Gradient', desc: 'Air quality & home', href: '/' },
  { key: 'media', label: 'Media', desc: 'Movies & TV', href: '/media' },
] as const

function AirIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a4 4 0 0 1 4-4 4 4 0 0 1 7-2 3.5 3.5 0 0 1 1 6.9" />
      <path d="M3 14h6M3 17h10" />
    </svg>
  )
}

function MediaIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 5.5v9a.6.6 0 0 0 .92.5l7-4.5a.6.6 0 0 0 0-1l-7-4.5A.6.6 0 0 0 7 5.5Z" />
    </svg>
  )
}

export function AppSwitcher() {
  const pathname = usePathname()
  const isMedia = pathname.startsWith('/media')
  const currentKey = isMedia ? 'media' : 'air'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // z-[45]: above the media rail (z-40) but below the fullscreen player (z-50) so it
  // stays hidden while a video is playing.
  return (
    <div ref={ref} className="fixed top-3 left-3 z-[45]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Switch app"
        aria-expanded={open}
        className="flex items-center gap-0.5 h-9 pl-1.5 pr-1.5 rounded-xl border border-white/10 bg-black/45 backdrop-blur-xl text-zinc-100 shadow-lg hover:bg-white/10 transition-colors"
      >
        <span className={`grid place-items-center h-6 w-6 rounded-lg text-zinc-900 ${isMedia ? 'bg-amber-300' : 'bg-emerald-400'}`}>
          {isMedia ? <MediaIcon className="h-3.5 w-3.5" /> : <AirIcon className="h-3.5 w-3.5" />}
        </span>
        <svg className={`text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 7.5l5 5 5-5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.14, ease: 'easeIn' } }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.32 }}
            className="absolute left-0 top-full mt-2 w-60 rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl p-1.5 shadow-2xl origin-top-left"
          >
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Switch app</p>
            {APPS.map(app => {
              const active = app.key === currentKey
              return (
                <Link
                  key={app.key}
                  href={app.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-xl transition-colors ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
                >
                  <span className={`grid place-items-center h-8 w-8 rounded-lg text-zinc-900 ${app.key === 'media' ? 'bg-amber-300' : 'bg-emerald-400'}`}>
                    {app.key === 'media' ? <MediaIcon /> : <AirIcon />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-zinc-100">{app.label}</span>
                    <span className="block text-xs text-zinc-500 truncate">{app.desc}</span>
                  </span>
                  {active && (
                    <svg className="text-zinc-300" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 10.5l3.5 3.5L15 6.5" />
                    </svg>
                  )}
                </Link>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
