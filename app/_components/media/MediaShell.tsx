'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { MediaRail } from './MediaRail'
import { SearchModal } from './SearchModal'
import { PageTransition } from './PageTransition'
import { AudiobookPlayerProvider, useAudiobookPlayer } from './audiobooks/AudiobookPlayer'
import { AudiobookPlayerChrome } from './audiobooks/PlayerChrome'
import type { ReelTitle, CollectionSummary, Audiobook, Ebook } from './types'

/**
 * Media chrome: the left icon rail (desktop) / bottom tab bar (mobile), the
 * global Search modal, and the scrollable content area. The rail floats over
 * content (fixed); pages apply their own `--rail` / `--gx` gutters. The audiobook
 * player is mounted here, outside PageTransition, so a book keeps playing across
 * navigation.
 */
export function MediaShell({
  catalog, collections, audiobooks, ebooks, children,
}: { catalog: ReelTitle[]; collections: CollectionSummary[]; audiobooks: Audiobook[]; ebooks: Ebook[]; children: React.ReactNode }) {
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
    <AudiobookPlayerProvider>
      <MediaRail onSearch={() => setSearchOpen(true)} />
      <ShellMain>{children}</ShellMain>
      <AudiobookPlayerChrome />
      <AnimatePresence>
        {searchOpen && <SearchModal catalog={catalog} collections={collections} audiobooks={audiobooks} ebooks={ebooks} onClose={() => setSearchOpen(false)} />}
      </AnimatePresence>
    </AudiobookPlayerProvider>
  )
}

/** Content area; grows its bottom padding while the docked mini player is showing. */
function ShellMain({ children }: { children: React.ReactNode }) {
  const { book } = useAudiobookPlayer()
  return (
    <main className={`min-h-screen transition-[padding] duration-300 ${book ? 'pb-[calc(var(--navpad)+84px)] md:pb-[112px]' : 'pb-[var(--navpad)]'}`}>
      <PageTransition>{children}</PageTransition>
    </main>
  )
}
