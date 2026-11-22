'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { STALE_AFTER_MS, useIsOlderThan } from '@/lib/useNow'
import { AppSwitch } from './AppSwitch'
import { SidebarToggle } from './SidebarToggle'
import { Drawer } from './lights/dialog'
import { usePolling } from './PollingProvider'

interface NavItem {
  href: string
  label: string
  /** Shorter label for the phone tab bar. */
  short?: string
  /** 24×24 stroke path. */
  d: string
  exact?: boolean
  /** Extra path prefixes that also light this item up. */
  also?: string[]
}

const PRIMARY: NavItem[] = [
  { href: '/', label: 'Overview', exact: true, d: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  // The eight metric pages hang off Air quality (its tiles link to them), not off the nav.
  { href: '/air-quality', label: 'Air quality', short: 'Air', also: ['/measurement'], d: 'M4 8h10a3 3 0 1 0-3-3M4 12h15a3 3 0 1 1-3 3M4 16h7a2.5 2.5 0 1 1-2.5 2.5' },
  { href: '/events', label: 'Events', d: 'M3 12h4l3-8 4 16 3-8h4' },
  { href: '/lights', label: 'Lights', d: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z' },
]

const SYSTEM: NavItem[] = [
  { href: '/logs', label: 'Logs', d: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' },
  { href: '/system', label: 'System', d: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4' },
  { href: '/settings', label: 'Settings', d: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4' },
]

const MORE_D = 'M5 12h.01M12 12h.01M19 12h.01'

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href
  return [item.href, ...(item.also ?? [])].some(h => pathname === h || pathname.startsWith(h + '/'))
}

function Icon({ d, className = '' }: { d: string; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d={d} />
    </svg>
  )
}

// ─── Connection status (sidebar footer, More sheet) ──────────────────────────

type Health = 'ok' | 'warn' | 'down' | 'off'

const HEALTH_DOT: Record<Health, string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  down: 'bg-red-500',
  off: 'bg-zinc-600',
}

function useSensorHealth(): { state: Health; text: string } {
  const { ready, deviceIp, lastUpdated, error } = usePolling()
  const old = useIsOlderThan(lastUpdated?.getTime() ?? null, STALE_AFTER_MS)
  if (!ready) return { state: 'off', text: 'Checking' }
  if (!deviceIp) return { state: 'off', text: 'Not set up' }
  if (error) return { state: 'down', text: 'Offline' }
  if (!lastUpdated) return { state: 'off', text: 'Connecting' }
  if (old) return { state: 'warn', text: 'Stale' }
  return { state: 'ok', text: 'Live' }
}

/** Bridge reachability, checked once a minute while the tab is visible. */
function useHueHealth(): { state: Health; text: string } {
  const [status, setStatus] = useState<{ configured: boolean; reachable: boolean } | null>(null)
  useEffect(() => {
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      clearTimeout(timer)
      if (!document.hidden) {
        try {
          const r = await fetch('/api/hue/status', { signal: ac.signal })
          if (r.ok) {
            const s = await r.json() as { configured?: boolean; reachable?: boolean }
            setStatus({ configured: !!s.configured, reachable: !!s.reachable })
          }
        } catch { /* keep the last answer */ }
      }
      if (!ac.signal.aborted) timer = setTimeout(tick, 60_000)
    }
    const onVisible = () => { if (!document.hidden) void tick() }
    document.addEventListener('visibilitychange', onVisible)
    void tick()
    return () => {
      ac.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  if (!status) return { state: 'off', text: 'Checking' }
  if (!status.configured) return { state: 'off', text: 'Not set up' }
  return status.reachable ? { state: 'ok', text: 'Connected' } : { state: 'down', text: 'Unreachable' }
}

function HealthRow({ label, health }: { label: string; health: { state: Health; text: string } }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[health.state]}`} />
      <span className="flex-1 text-zinc-400">{label}</span>
      <span className="text-zinc-100">{health.text}</span>
    </div>
  )
}

// ─── Shell ───────────────────────────────────────────────────────────────────

/**
 * Home chrome. From md up: a sidebar that is a 72px icon rail until xl and the 232px
 * labelled sidebar from there. On phones: the app switch in a top bar that scrolls with
 * the page, and a fixed bottom tab bar whose last tab opens the rest in a drawer.
 */
export function AirSidebar() {
  const pathname = usePathname()
  const { alerts } = usePolling()
  const sensor = useSensorHealth()
  const hue = useHueHealth()
  const [moreOpen, setMoreOpen] = useState(false)

  // Open warnings and criticals nobody has dismissed (notable events never badge).
  const openEvents = alerts.length
  const moreActive = SYSTEM.some(item => isActive(pathname, item))

  const sideLink = (item: NavItem, badge?: number) => {
    const active = isActive(pathname, item)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        title={item.label}
        className={`relative flex h-11 items-center gap-3 overflow-hidden rounded-[10px] pl-[15px] pr-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
          active ? 'bg-air-hover font-semibold text-white' : 'font-medium text-zinc-400 hover:bg-white/[0.04] hover:text-white'
        }`}
      >
        <Icon d={item.d} className={`h-[18px] w-[18px] ${active ? 'text-emerald-400' : ''}`} />
        <span className="flex-1 whitespace-nowrap opacity-0 transition-opacity duration-200 wide:opacity-100">{item.label}</span>
        {badge ? (
          <span className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-zinc-950 wide:static">
            {badge}<span className="sr-only"> {badge === 1 ? 'alert' : 'alerts'}</span>
          </span>
        ) : null}
      </Link>
    )
  }

  const tabCls = (active: boolean) =>
    `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${
      active ? 'font-semibold text-emerald-400' : 'font-medium text-zinc-400'
    }`

  return (
    <>
      {/* ── Phone top bar (in flow: it scrolls away with the page) ── */}
      <div className="px-4 pt-3 md:hidden">
        <AppSwitch current="air" />
      </div>

      {/* ── Sidebar ── */}
      <aside className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col gap-5 overflow-y-auto overflow-x-hidden border-r border-air-line bg-air-panel px-3 py-4 transition-[width] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] md:flex wide:w-[232px]">
        <AppSwitch current="air" layout="rail" />

        <nav aria-label="Home" className="flex flex-col gap-0.5">
          {PRIMARY.map(item => sideLink(item, item.href === '/events' ? openEvents : undefined))}
        </nav>

        <nav aria-label="System" className="flex flex-col gap-0.5">
          {/* Same height either way, so the links below never move: a rule on the rail, the label when open. */}
          <div className="relative h-[22px]">
            <div aria-hidden="true" className="absolute inset-x-3 top-2 h-px bg-air-line transition-opacity duration-200 wide:opacity-0" />
            <p className="absolute left-[15px] top-0 whitespace-nowrap text-xs text-zinc-400 opacity-0 transition-opacity duration-200 wide:opacity-100">System</p>
          </div>
          {SYSTEM.map(item => sideLink(item))}
        </nav>

        {/* Connection status: full rows when labelled, two dots on the rail. The toggle sits
            below it, pinned to the bottom, so it stays under the pointer when the status changes height. */}
        <div className="mt-auto hidden flex-col gap-2.5 whitespace-nowrap rounded-xl border border-air-line bg-air-card px-3 py-3.5 text-[13px] wide:flex">
          <HealthRow label="Air sensor" health={sensor} />
          <HealthRow label="Hue bridge" health={hue} />
        </div>
        <div className="mt-auto flex flex-col items-center gap-2.5 pb-1 wide:hidden">
          <span role="img" aria-label={`Air sensor: ${sensor.text}`} title={`Air sensor: ${sensor.text}`} className={`h-2 w-2 rounded-full ${HEALTH_DOT[sensor.state]}`} />
          <span role="img" aria-label={`Hue bridge: ${hue.text}`} title={`Hue bridge: ${hue.text}`} className={`h-2 w-2 rounded-full ${HEALTH_DOT[hue.state]}`} />
        </div>
        <div className="-mt-2 flex flex-col">
          <SidebarToggle tone="air" />
        </div>
      </aside>

      {/* ── Phone bottom tab bar ── */}
      <nav
        aria-label="Home"
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-[calc(64px+env(safe-area-inset-bottom))] items-stretch justify-around border-t border-air-line bg-air-panel/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        {PRIMARY.map(item => {
          const active = isActive(pathname, item)
          const badge = item.href === '/events' ? openEvents : 0
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={tabCls(active)}>
              <Icon d={item.d} className="h-[22px] w-[22px]" />
              <span className="max-w-full truncate">{item.short ?? item.label}</span>
              {badge > 0 && (
                <span className="absolute left-1/2 top-1 ml-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-zinc-950">
                  {badge}<span className="sr-only"> {badge === 1 ? 'alert' : 'alerts'}</span>
                </span>
              )}
            </Link>
          )
        })}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={tabCls(moreActive)}>
          <Icon d={MORE_D} className="h-[22px] w-[22px]" />
          <span>More</span>
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <Drawer onClose={() => setMoreOpen(false)} label="More">
            <div className="flex flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2">
              <nav aria-label="System" className="flex flex-col gap-0.5">
                {SYSTEM.map(item => {
                  const active = isActive(pathname, item)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${active ? 'bg-air-active font-semibold text-white' : 'font-medium text-zinc-200 hover:bg-white/[0.05]'}`}
                    >
                      <Icon d={item.d} className={`h-5 w-5 ${active ? 'text-emerald-400' : 'text-zinc-400'}`} />
                      {item.label}
                    </Link>
                  )
                })}
              </nav>
              <div className="flex flex-col gap-2.5 rounded-xl border border-air-line bg-air-card px-3 py-3.5 text-sm">
                <HealthRow label="Air sensor" health={sensor} />
                <HealthRow label="Hue bridge" health={hue} />
              </div>
            </div>
          </Drawer>
        )}
      </AnimatePresence>
    </>
  )
}
