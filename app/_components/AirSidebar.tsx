'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { METRICS } from '@/lib/metrics'

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  const link = (href: string, label: string, matchPrefix = false) => {
    const active = matchPrefix ? pathname.startsWith(href) : pathname === href
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        className={`px-3 py-2 rounded-lg text-sm transition-colors ${active
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
          }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <>
      {link('/', 'Dashboard')}
      {link('/air-quality', 'Air Quality')}
      {link('/events', 'AQ Events', true)}
      {link('/lights', 'Lights')}
      {link('/files', 'Files')}
      {link('/logs', 'Logs')}
      {link('/settings', 'Settings')}
      {link('/system', 'System')}
      <div className="mt-5 mb-1 px-3 text-xs text-zinc-700 uppercase tracking-widest">Metrics</div>
      {METRICS.map(m => link(`/measurement/${m.slug}`, m.label))}
    </>
  )
}

export function AirSidebar() {
  const [isOpen, setIsOpen] = useState(false)

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <>
      {/* ── Mobile top bar (switcher floats over the left; hamburger on the right) ── */}
      <header className="md:hidden sticky top-0 z-30 h-14 shrink-0 flex items-center justify-end px-4 border-b border-zinc-800 bg-zinc-950">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open menu"
          className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <line x1="3" y1="5" x2="17" y2="5" />
            <line x1="3" y1="10" x2="17" y2="10" />
            <line x1="3" y1="15" x2="17" y2="15" />
          </svg>
        </button>
      </header>

      {/* ── Desktop sidebar (nav padded down to clear the floating AppSwitcher) ── */}
      <aside className="hidden md:flex sticky top-0 h-screen w-44 shrink-0 border-r border-zinc-800 bg-zinc-950 flex-col">
        <nav className="flex flex-col gap-0.5 px-2 pt-16 flex-1 pb-4">
          <NavLinks />
        </nav>
      </aside>

      {/* ── Mobile drawer overlay ── */}
      <AnimatePresence>
        {isOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              className="relative w-64 h-full bg-zinc-950 border-r border-zinc-800 flex flex-col shadow-2xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%', transition: { duration: 0.28, ease: [0.32, 0, 0.67, 0] } }}
              transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
            >
              <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-800 shrink-0">
                <span className="text-base font-semibold text-zinc-100 tracking-tight">Air Gradient</span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close menu"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                    <line x1="4" y1="4" x2="14" y2="14" />
                    <line x1="14" y1="4" x2="4" y2="14" />
                  </svg>
                </button>
              </div>
              <nav className="flex flex-col gap-0.5 px-2 pt-2 flex-1 pb-4 overflow-y-auto">
                <NavLinks onNavigate={() => setIsOpen(false)} />
              </nav>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
