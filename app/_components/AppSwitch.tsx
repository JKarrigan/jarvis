import Link from 'next/link'

type AppKey = 'air' | 'media'

function HomeGlyph() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}

function PlayGlyph() {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 5.5v9a.6.6 0 0 0 .92.5l7-4.5a.6.6 0 0 0 0-1l-7-4.5A.6.6 0 0 0 7 5.5Z" />
    </svg>
  )
}

const APPS: { key: AppKey; label: string; href: string; chip: string; Glyph: () => React.ReactElement }[] = [
  { key: 'air', label: 'Home', href: '/', chip: 'bg-emerald-400', Glyph: HomeGlyph },
  { key: 'media', label: 'Media', href: '/media', chip: 'bg-amber-300', Glyph: PlayGlyph },
]

/**
 * The Home / Media switch: the only bridge between the two apps, and part of each
 * app's own chrome (top of the sidebar, top bar on phones) rather than a floating chip.
 *
 * `layout="row"` is always the labelled two-segment control. `layout="rail"` stacks two
 * icon buttons while the sidebar is the narrow icon rail (md to xl) and becomes the
 * labelled control once the sidebar has room for it (xl). Colours are white-alpha so it
 * sits on both the neutral Home chrome and every Reel theme.
 */
export function AppSwitch({ current, layout = 'row', className = '' }: {
  current: AppKey
  layout?: 'row' | 'rail'
  className?: string
}) {
  const rail = layout === 'rail'
  return (
    <nav
      aria-label="Apps"
      className={`flex gap-1 rounded-[14px] border border-white/[0.08] bg-white/[0.04] p-1 ${rail ? 'flex-col xl:flex-row' : ''} ${className}`}
    >
      {APPS.map(app => {
        const active = app.key === current
        return (
          <Link
            key={app.key}
            href={app.href}
            aria-current={active ? 'true' : undefined}
            title={app.label}
            className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              active ? 'bg-white/[0.12] text-white' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-zinc-900 ${app.chip} ${active ? '' : 'opacity-80'}`}>
              <app.Glyph />
            </span>
            <span className={rail ? 'sr-only xl:not-sr-only' : ''}>{app.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
