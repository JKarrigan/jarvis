'use client'

import { useBack } from './hooks'
import { ChevronLeftIcon } from './icons'

/**
 * The floating glass "Back" pill on detail / season / collection / person pages.
 * It sits at the page's left gutter on phones and just clear of the sidebar from md up
 * (`--rail` follows the sidebar's width). Goes back in history when there is in-app history, else to
 * `fallbackHref` (a deep link or fresh tab has nothing to go back to).
 */
export function BackPill({ fallbackHref, className = 'z-50' }: { fallbackHref: string; className?: string }) {
  const back = useBack(fallbackHref)
  return (
    <button
      type="button"
      onClick={back}
      className={`absolute left-4 top-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3.5 text-sm font-medium text-ink backdrop-blur-xl transition hover:bg-white/10 md:left-[calc(var(--rail)-10px)] ${className}`}
    >
      <ChevronLeftIcon className="h-4 w-4" /> Back
    </button>
  )
}
