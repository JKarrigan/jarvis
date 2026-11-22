'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { AppSwitch } from '../AppSwitch'
import { SidebarToggle } from '../SidebarToggle'
import { useMediaProfile, useTitleState } from './MediaProvider'
import { Sheet } from './Sheet'
import {
  HomeIcon, FilmIcon, TvIcon, HeartIcon, CollectionsIcon, DieIcon,
  ListIcon, GearIcon, SearchIcon, HeadphonesIcon, PhotoIcon, FolderIcon,
} from './icons'

interface NavItem {
  href: string
  label: string
  /** Shorter label for the 11px phone tab. */
  short?: string
  Icon: (p: { className?: string }) => React.ReactElement
  exact?: boolean
  /** Extra path prefixes that also light this item up. */
  also?: string[]
}

/** The sections: the sidebar's first group and, in this order, the phone tab bar. */
const SECTIONS: NavItem[] = [
  { href: '/media', label: 'Home', Icon: HomeIcon, exact: true },
  { href: '/media/movies', label: 'Movies', Icon: FilmIcon },
  { href: '/media/tv', label: 'TV shows', short: 'TV', Icon: TvIcon },
  { href: '/media/audiobooks', label: 'Books', Icon: HeadphonesIcon, also: ['/media/books'] },
  { href: '/media/photos', label: 'Photos', Icon: PhotoIcon },
  { href: '/media/documents', label: 'Documents', short: 'Files', Icon: FolderIcon },
]

/** "Your library": the sidebar's second group; on phones it lives behind the top bar's More button. */
const LIBRARY: NavItem[] = [
  { href: '/media/favorites', label: 'Favorites', Icon: HeartIcon },
  { href: '/media/collections', label: 'Collections', Icon: CollectionsIcon },
  { href: '/media/picker', label: 'Movie picker', Icon: DieIcon },
]

const PICK_LIST: NavItem = { href: '/media/picklist', label: 'Picker list', Icon: ListIcon }
const SETTINGS: NavItem = { href: '/media/settings', label: 'Settings', Icon: GearIcon }

function isActive(pathname: string, item: { href: string; exact?: boolean; also?: string[] }) {
  if (item.exact) return pathname === item.href
  return [item.href, ...(item.also ?? [])].some(h => pathname === h || pathname.startsWith(h + '/'))
}

function CountBadge({ count, className }: { count: number; className: string }) {
  return (
    <span aria-hidden="true" className={`grid place-items-center rounded-full font-bold text-ink-on-accent bg-accent ${className}`}>
      {count}
    </span>
  )
}

/**
 * A nav link to the section you're already in (e.g. Documents while inside a
 * subfolder, or Photos with the viewer open) resets that section to its top level. Done
 * with the History API so it works even when Next's router considers the route current.
 */
function onSamePageClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  if (window.location.pathname !== href) return
  e.preventDefault()
  if (window.location.search || window.location.hash) window.history.pushState({}, '', href)
  window.scrollTo({ top: 0 })
}

const glassBtn = 'grid h-[54px] w-[54px] shrink-0 place-items-center rounded-[14px] border border-white/[0.08] bg-white/[0.04] text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

/**
 * Media chrome, the same shape as the Home app's: from md a sidebar (74px icon rail
 * until xl, the 232px labelled sidebar from there; pages follow through `--rail`), and
 * on phones a top bar that scrolls with the page (app switch, Search, More) plus a fixed
 * bottom tab bar with every section.
 */
export function MediaRail({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname()
  const { pickList } = useTitleState()
  const { activeProfile } = useMediaProfile()
  const pickCount = pickList.length
  const [moreOpen, setMoreOpen] = useState(false)
  // Shortcut hint resolves after mount — the platform sniff would mismatch SSR markup.
  const [shortcut, setShortcut] = useState('')
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K')
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */
  const searchLabel = shortcut ? `Search (${shortcut})` : 'Search'

  const sideLink = (item: NavItem, badge?: number) => {
    const active = isActive(pathname, item)
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={e => onSamePageClick(e, item.href)}
        aria-label={badge ? `${item.label} (${badge})` : undefined}
        aria-current={active ? 'page' : undefined}
        title={item.label}
        className={`relative flex h-11 items-center gap-3 overflow-hidden rounded-[10px] pl-[15px] pr-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          active ? 'bg-surface-2 font-bold text-accent-soft' : 'font-semibold text-white/65 hover:bg-white/5 hover:text-white'
        }`}
      >
        <item.Icon className="h-5 w-5 shrink-0" />
        <span className="flex-1 whitespace-nowrap opacity-0 transition-opacity duration-200 wide:opacity-100">{item.label}</span>
        {badge ? <CountBadge count={badge} className="absolute right-1 top-1 h-[18px] min-w-[18px] px-1 text-[10px] wide:static" /> : null}
      </Link>
    )
  }

  const tabCls = (active: boolean) =>
    `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] ${active ? 'font-bold text-accent' : 'font-semibold text-white/60'}`

  const moreActive = [...LIBRARY, PICK_LIST, SETTINGS].some(item => isActive(pathname, item))

  return (
    <>
      {/* ── Phone top bar (in flow: it scrolls away with the page) ── */}
      <div className="flex items-center gap-2 px-4 pt-3 md:hidden">
        <AppSwitch current="media" className="flex-1" />
        <button type="button" onClick={onSearch} aria-label="Search" className={glassBtn}>
          <SearchIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label={pickCount > 0 ? `Library and settings (${pickCount} in picker list)` : 'Library and settings'}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`relative ${glassBtn} ${moreActive ? 'text-accent' : ''}`}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h.01M12 12h.01M19 12h.01" /></svg>
          {pickCount > 0 && <CountBadge count={pickCount} className="absolute right-1.5 top-1.5 h-4 min-w-4 px-1 text-[9px]" />}
        </button>
      </div>

      {/* ── Sidebar ── */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[74px] flex-col gap-4 overflow-y-auto overflow-x-hidden border-r border-border bg-black/35 px-3 py-4 backdrop-blur-xl backdrop-saturate-150 transition-[width] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] md:flex wide:w-[232px]">
        <AppSwitch current="media" layout="rail" />

        <button
          type="button"
          onClick={onSearch}
          aria-label={searchLabel}
          title={searchLabel}
          className="flex h-11 shrink-0 items-center gap-3 overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.04] pl-[14px] pr-3 text-sm font-semibold text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <SearchIcon className="h-5 w-5 shrink-0" />
          <span className="flex-1 whitespace-nowrap opacity-0 transition-opacity duration-200 wide:opacity-100 text-left">Search</span>
          {shortcut && <kbd className="hidden rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-xs text-white/70 wide:inline">{shortcut}</kbd>}
        </button>

        <nav aria-label="Media" className="flex flex-col gap-0.5">
          {SECTIONS.map(item => sideLink(item))}
        </nav>

        <nav aria-label="Your library" className="flex flex-col gap-0.5">
          {/* Same height either way, so the links below never move: a rule on the rail, the label when open. */}
          <div className="relative h-[22px]">
            <div aria-hidden="true" className="absolute inset-x-3 top-2 h-px bg-white/10 transition-opacity duration-200 wide:opacity-0" />
            <p className="absolute left-[15px] top-0 whitespace-nowrap text-xs text-white/60 opacity-0 transition-opacity duration-200 wide:opacity-100">Your library</p>
          </div>
          {LIBRARY.map(item => sideLink(item))}
          {pickCount > 0 && sideLink(PICK_LIST, pickCount)}
        </nav>

        <div className="mt-auto flex flex-col">
          <SidebarToggle tone="media" />
        </div>

        <Link
          href="/media/settings"
          aria-label={`Profile ${activeProfile} and settings`}
          aria-current={isActive(pathname, SETTINGS) ? 'page' : undefined}
          title="Profile and settings"
          className={`flex h-[52px] shrink-0 items-center gap-3 overflow-hidden rounded-xl border border-white/[0.08] pl-2 pr-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            isActive(pathname, SETTINGS) ? 'bg-surface-2 text-accent-soft' : 'bg-white/[0.04] text-white/75 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold text-accent-soft">{activeProfile}</span>
          <span className="flex-1 whitespace-nowrap opacity-0 transition-opacity duration-200 wide:opacity-100">Settings</span>
          <GearIcon className="hidden h-[18px] w-[18px] text-white/50 wide:block" />
        </Link>
      </aside>

      {/* ── Phone bottom tab bar ── */}
      <nav
        aria-label="Media"
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-[calc(64px+env(safe-area-inset-bottom))] items-stretch justify-around border-t border-white/10 bg-black/55 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
      >
        {SECTIONS.map(item => {
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={e => onSamePageClick(e, item.href)}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              className={tabCls(active)}
            >
              <item.Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.short ?? item.label}</span>
            </Link>
          )
        })}
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <Sheet onClose={() => setMoreOpen(false)} label="Library and settings">
            <nav aria-label="Library and settings" className="flex flex-col gap-0.5 px-3 pb-4 pt-2">
              {[...LIBRARY, PICK_LIST, SETTINGS].map(item => {
                const active = isActive(pathname, item)
                const badge = item === PICK_LIST ? pickCount : 0
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${active ? 'bg-white/10 font-bold text-white' : 'font-semibold text-zinc-200 hover:bg-white/[0.06]'}`}
                  >
                    <item.Icon className={`h-5 w-5 ${active ? 'text-accent' : 'text-zinc-400'}`} />
                    <span className="flex-1">{item.label}</span>
                    {badge > 0 && <CountBadge count={badge} className="h-5 min-w-5 px-1.5 text-[11px]" />}
                  </Link>
                )
              })}
            </nav>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  )
}
