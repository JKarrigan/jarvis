'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { SIDEBAR_CHANGE_EVENT } from '@/lib/sidebar'

type AppKey = 'air' | 'media'

function HomeGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}

function PlayGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 5.5v9a.6.6 0 0 0 .92.5l7-4.5a.6.6 0 0 0 0-1l-7-4.5A.6.6 0 0 0 7 5.5Z" />
    </svg>
  )
}

const APPS: { key: AppKey; label: string; desc: string; href: string; chip: string; Glyph: (p: { size?: number }) => React.ReactElement }[] = [
  { key: 'air', label: 'Home', desc: 'Air quality, lights and system', href: '/', chip: 'bg-emerald-400', Glyph: HomeGlyph },
  { key: 'media', label: 'Media', desc: 'Movies, TV, books, photos and documents', href: '/media', chip: 'bg-amber-300', Glyph: PlayGlyph },
]

/** The labelled two-segment control (open sidebar, phone top bars). */
function Segments({ current, className = '' }: { current: AppKey; className?: string }) {
  return (
    <nav aria-label="Apps" className={`gap-1 rounded-[14px] border border-white/[0.08] bg-white/[0.04] p-1 ${className}`}>
      {APPS.map(app => {
        const active = app.key === current
        return (
          <Link
            key={app.key}
            href={app.href}
            aria-current={active ? 'true' : undefined}
            className={`flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              active ? 'bg-white/[0.12] text-white' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-zinc-900 ${app.chip} ${active ? '' : 'opacity-80'}`}>
              <app.Glyph />
            </span>
            {app.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * The switch on the narrow rail: one button showing the current app, opening a menu of
 * both. The menu is portalled to <body> and positioned from the button, because the
 * sidebar clips its overflow (and the Media sidebar's backdrop filter would trap a
 * fixed-position child). Neutral colours, since it renders outside the Reel theme root.
 */
function AppMenu({ current, className = '' }: { current: AppKey; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const active = APPS.find(a => a.key === current) ?? APPS[0]

  const close = useCallback(() => setOpen(false), [])

  // Place the menu under the button each time it opens.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const r = buttonRef.current.getBoundingClientRect()
    setPos({ left: r.left, top: r.bottom + 8 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) close()
    }
    // A dialog on top handles Escape first and calls preventDefault.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      close()
      buttonRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    // The button moves or disappears when the sidebar expands or the window resizes.
    window.addEventListener('resize', close)
    window.addEventListener(SIDEBAR_CHANGE_EVENT, close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener(SIDEBAR_CHANGE_EVENT, close)
    }
  }, [open, close])

  return (
    // The 54px slot matches the open sidebar's two-segment control, so nothing below
    // moves on toggle; the button inside is the same 44px row as the nav links.
    <div className={`h-[54px] items-center ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Switch app. Current: ${active.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch app"
        className={`flex h-11 w-full items-center justify-center gap-[3px] rounded-[10px] transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${open ? 'bg-white/[0.1]' : ''}`}
      >
        {/* No box of its own: the app's chip and the chevron are centred as a pair, so
            the highlight has the same space to the left of the chip as to the right of the chevron. */}
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-zinc-900 ${active.chip}`}>
          <active.Glyph size={13} />
        </span>
        <svg aria-hidden="true" className={`shrink-0 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} width="9" height="9" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 7.5l5 5 5-5" />
        </svg>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && pos && (
            // z-[45]: above the sidebars (z-40), below the fullscreen player (z-50).
            <motion.div
              ref={menuRef}
              role="menu"
              aria-label="Apps"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.14, ease: 'easeIn' } }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.32 }}
              style={{ left: pos.left, top: pos.top }}
              className="fixed z-[45] w-64 origin-top-left rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-xl"
            >
              {APPS.map(app => {
                const here = app.key === current
                return (
                  <Link
                    key={app.key}
                    href={app.href}
                    role="menuitem"
                    onClick={close}
                    aria-current={here ? 'true' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${here ? 'bg-white/10' : 'hover:bg-white/5'}`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-900 ${app.chip}`}>
                      <app.Glyph size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-zinc-100">{app.label}</span>
                      <span className="block truncate text-xs text-zinc-400">{app.desc}</span>
                    </span>
                    {here && (
                      <svg aria-hidden="true" className="shrink-0 text-zinc-300" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 10.5l3.5 3.5L15 6.5" />
                      </svg>
                    )}
                  </Link>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

/**
 * The Home / Media switch: the only bridge between the two apps, and part of each app's
 * own chrome (top of the sidebar, top bar on phones) rather than a floating chip.
 *
 * `layout="row"` is always the labelled two-segment control. `layout="rail"` is that
 * control while the sidebar is open (`wide:`) and a one-button dropdown on the narrow
 * rail. Both are the same height, so nothing below moves when the sidebar toggles.
 * Colours are white-alpha so it sits on both the neutral Home chrome and every Reel theme.
 */
export function AppSwitch({ current, layout = 'row', className = '' }: {
  current: AppKey
  layout?: 'row' | 'rail'
  className?: string
}) {
  if (layout === 'row') return <Segments current={current} className={`flex ${className}`} />
  return (
    <>
      <Segments current={current} className={`hidden wide:flex ${className}`} />
      <AppMenu current={current} className={`flex wide:hidden ${className}`} />
    </>
  )
}
