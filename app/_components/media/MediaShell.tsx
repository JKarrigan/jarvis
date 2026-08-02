'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { MediaRail } from './MediaRail'
import { SearchModal } from './SearchModal'
import { PageTransition } from './PageTransition'
import type { ReelTitle, CollectionSummary } from './types'

/**
 * Media chrome: the left icon rail (desktop) / bottom tab bar (mobile), the
 * global Search modal, and the scrollable content area. The rail floats over
 * content (fixed); pages apply their own `--rail` / `--gx` gutters.
 */
export function MediaShell({
  catalog, collections, children,
}: { catalog: ReelTitle[]; collections: CollectionSummary[]; children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <MediaRail onSearch={() => setSearchOpen(true)} />
      <main className="min-h-screen pb-[var(--navpad)]">
        <PageTransition>{children}</PageTransition>
      </main>
      <AnimatePresence>
        {searchOpen && <SearchModal catalog={catalog} collections={collections} onClose={() => setSearchOpen(false)} />}
      </AnimatePresence>
    </>
  )
}
