'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMedia } from './MediaProvider'
import {
  HomeIcon, FilmIcon, TvIcon, HeartIcon, CollectionsIcon, DieIcon,
  ListIcon, GearIcon, SearchIcon,
} from './icons'

interface RailItem {
  href: string
  label: string
  Icon: (p: { className?: string }) => React.ReactElement
  exact?: boolean
}

const PRIMARY: RailItem[] = [
  { href: '/media', label: 'Home', Icon: HomeIcon, exact: true },
  { href: '/media/movies', label: 'Movies', Icon: FilmIcon },
  { href: '/media/tv', label: 'TV Shows', Icon: TvIcon },
  { href: '/media/favorites', label: 'Favorites', Icon: HeartIcon },
  { href: '/media/collections', label: 'Collections', Icon: CollectionsIcon },
  { href: '/media/picker', label: 'Movie Picker', Icon: DieIcon },
]

function isActive(pathname: string, item: { href: string; exact?: boolean }) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')
}

export function MediaRail({ onSearch }: { onSearch?: () => void }) {
  const pathname = usePathname()
  const { pickList } = useMedia()
  const pickCount = pickList.length
  // Shortcut hint resolves after mount — the platform sniff would mismatch SSR markup.
  const [searchLabel, setSearchLabel] = useState('Search')
  useEffect(() => {
    setSearchLabel(`Search (${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'}K)`)
  }, [])

  const railLink = (item: RailItem) => {
    const active = isActive(pathname, item)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-label={item.label}
        title={item.label}
        className={`grid place-items-center h-11 w-11 rounded-xl transition-colors ${active
          ? 'bg-surface-2 text-accent'
          : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
      >
        <item.Icon className="h-5 w-5" />
      </Link>
    )
  }

  return (
    <>
      {/* ── Desktop icon rail ── */}
      <nav className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-[74px] flex-col items-center gap-1 pt-16 pb-4 bg-black/30 backdrop-blur-xl backdrop-saturate-150">
        {onSearch && (
          <button
            type="button"
            onClick={onSearch}
            aria-label={searchLabel}
            title={searchLabel}
            className="grid place-items-center h-11 w-11 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <SearchIcon className="h-5 w-5" />
          </button>
        )}
        <div className="my-1 h-px w-7 bg-white/10" />
        {PRIMARY.map(railLink)}

        {pickCount > 0 && (
          <Link
            href="/media/picklist"
            aria-label="Picker list"
            title="Picker list"
            className={`relative grid place-items-center h-11 w-11 rounded-xl transition-colors ${isActive(pathname, { href: '/media/picklist' })
              ? 'bg-surface-2 text-accent'
              : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
          >
            <ListIcon className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-ink-on-accent bg-accent">
              {pickCount}
            </span>
          </Link>
        )}

        <div className="flex-1" />
        {railLink({ href: '/media/settings', label: 'Settings', Icon: GearIcon })}
        <Link
          href="/media/settings"
          aria-label="Profile"
          title="Profile"
          className="grid place-items-center h-9 w-9 mt-1 rounded-full bg-surface-2 text-sm font-semibold text-white/80 hover:text-white transition-colors"
        >
          A
        </Link>
      </nav>

      {/* ── Mobile bottom tab bar ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 h-[68px] flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)] bg-black/55 backdrop-blur-xl backdrop-saturate-150 border-t border-white/10">
        {[
          { href: '/media', label: 'Home', Icon: HomeIcon, exact: true },
          { href: '/media/collections', label: 'Collections', Icon: CollectionsIcon },
          { href: '/media/picker', label: 'Picker', Icon: DieIcon },
          pickCount > 0
            ? { href: '/media/picklist', label: 'List', Icon: ListIcon }
            : { href: '/media/settings', label: 'Settings', Icon: GearIcon },
        ].map(item => {
          const active = isActive(pathname, item)
          const showBadge = item.href === '/media/picklist' && pickCount > 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 ${active ? 'text-accent' : 'text-white/55'}`}
            >
              <item.Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {showBadge && (
                <span className="absolute top-1 right-1/2 translate-x-4 grid place-items-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-ink-on-accent bg-accent">
                  {pickCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
