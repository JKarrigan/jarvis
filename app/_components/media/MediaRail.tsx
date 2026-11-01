'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMediaProfile, useTitleState } from './MediaProvider'
import {
  HomeIcon, FilmIcon, TvIcon, HeartIcon, CollectionsIcon, DieIcon,
  ListIcon, GearIcon, SearchIcon, HeadphonesIcon, PhotoIcon, FolderIcon,
} from './icons'

interface NavItem {
  href: string
  label: string
  /** Shorter label for the 10px mobile tab. */
  short?: string
  Icon: (p: { className?: string }) => React.ReactElement
  exact?: boolean
  /** Extra path prefixes that also light this item up. */
  also?: string[]
  /** Also a slot in the mobile bottom tab bar. */
  mobile?: boolean
}

/** The one navigation config. Desktop rail shows every entry in this order; the mobile
    tab bar shows the `mobile` ones, then Search and Settings / Picker list. */
const NAV: NavItem[] = [
  { href: '/media', label: 'Home', Icon: HomeIcon, exact: true, mobile: true },
  { href: '/media/movies', label: 'Movies', Icon: FilmIcon },
  { href: '/media/tv', label: 'TV Shows', Icon: TvIcon },
  { href: '/media/photos', label: 'Photos', Icon: PhotoIcon, mobile: true },
  { href: '/media/documents', label: 'Documents', Icon: FolderIcon, mobile: true },
  { href: '/media/audiobooks', label: 'Books', Icon: HeadphonesIcon, also: ['/media/books'], mobile: true },
  { href: '/media/favorites', label: 'Favorites', Icon: HeartIcon },
  { href: '/media/collections', label: 'Collections', Icon: CollectionsIcon },
  // Desktop rail and the Home page only: the phone tab bar has no room for a sixth tab.
  { href: '/media/picker', label: 'Movie Picker', short: 'Picker', Icon: DieIcon },
]

const SETTINGS: NavItem = { href: '/media/settings', label: 'Settings', Icon: GearIcon }
const PICK_LIST: NavItem = { href: '/media/picklist', label: 'Picker list', short: 'List', Icon: ListIcon }

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

export function MediaRail({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname()
  const { pickList } = useTitleState()
  const { activeProfile } = useMediaProfile()
  const pickCount = pickList.length
  // Shortcut hint resolves after mount — the platform sniff would mismatch SSR markup.
  const [searchLabel, setSearchLabel] = useState('Search')
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSearchLabel(`Search (${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'}K)`)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const railLink = (item: NavItem, badge?: number) => {
    const active = isActive(pathname, item)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-label={badge ? `${item.label} (${badge})` : item.label}
        aria-current={active ? 'page' : undefined}
        title={item.label}
        className={`relative grid place-items-center h-11 w-11 rounded-xl transition-colors ${active
          ? 'bg-surface-2 text-accent'
          : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
      >
        <item.Icon className="h-5 w-5" />
        {badge ? <CountBadge count={badge} className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px]" /> : null}
      </Link>
    )
  }

  const tabClass = (active: boolean) =>
    `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 ${active ? 'text-accent' : 'text-white/55'}`

  const tab = (item: NavItem, badge?: number) => {
    const active = isActive(pathname, item)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        aria-label={badge ? `${item.label} (${badge})` : item.label}
        className={tabClass(active)}
      >
        <item.Icon className="h-5 w-5" />
        <span className="max-w-full truncate text-[10px] font-medium">{item.short ?? item.label}</span>
        {badge ? <CountBadge count={badge} className="absolute top-0.5 left-1/2 ml-1.5 min-w-[16px] h-4 px-1 text-[9px]" /> : null}
      </Link>
    )
  }

  return (
    <>
      {/* ── Desktop icon rail ── */}
      <nav aria-label="Media" className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-[74px] flex-col items-center gap-1 pt-16 pb-4 bg-black/30 backdrop-blur-xl backdrop-saturate-150">
        <button
          type="button"
          onClick={onSearch}
          aria-label={searchLabel}
          title={searchLabel}
          className="grid place-items-center h-11 w-11 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-colors"
        >
          <SearchIcon className="h-5 w-5" />
        </button>
        <div className="my-1 h-px w-7 bg-white/10" />
        {NAV.map(item => railLink(item))}
        {pickCount > 0 && railLink(PICK_LIST, pickCount)}

        <div className="flex-1" />
        {railLink(SETTINGS)}
        <Link
          href="/media/settings"
          aria-label={`Profile ${activeProfile}`}
          title={`Profile ${activeProfile}`}
          className="grid place-items-center h-11 w-11 mt-1 rounded-full bg-surface-2 text-sm font-semibold text-white/80 hover:text-white transition-colors"
        >
          {activeProfile}
        </Link>
      </nav>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        aria-label="Media"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 flex min-h-[calc(64px+env(safe-area-inset-bottom))] items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)] bg-black/55 backdrop-blur-xl backdrop-saturate-150 border-t border-white/10"
      >
        {NAV.filter(item => item.mobile).map(item => tab(item))}
        <button type="button" onClick={onSearch} aria-label="Search" className={tabClass(false)}>
          <SearchIcon className="h-5 w-5" />
          <span className="text-[10px] font-medium">Search</span>
        </button>
        {pickCount > 0 ? tab(PICK_LIST, pickCount) : tab(SETTINGS)}
      </nav>
    </>
  )
}
