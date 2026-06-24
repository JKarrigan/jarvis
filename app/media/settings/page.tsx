'use client'

import Link from 'next/link'
import { useMedia, THEMES } from '@/app/_components/media/MediaProvider'
import { CheckIcon, ChevronRightIcon } from '@/app/_components/media/icons'

export default function MediaSettingsPage() {
  const { theme, setTheme, activeProfile, switchProfile } = useMedia()
  const current = THEMES.find(t => t.key === theme)

  return (
    <div className="mx-auto max-w-[920px] px-[var(--rail)] py-10 md:px-[var(--gx)]">
      <h1 className="mb-7 text-[40px] font-[800] tracking-[-0.02em] text-ink">Settings</h1>

      {/* Profile */}
      <div className="mb-4 flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-lg font-semibold text-white/80">
          {activeProfile}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Profile {activeProfile}</p>
          <p className="text-sm text-white/50">Household member · theme preferences are saved to this profile</p>
        </div>
        <button
          type="button"
          onClick={switchProfile}
          className="rounded-xl border border-border bg-white/5 px-4 py-2 text-sm font-medium text-ink transition hover:bg-white/10"
        >
          Switch profile
        </button>
      </div>

      {/* Year in film */}
      <Link
        href="/media/stats"
        className="mb-9 flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 transition hover:bg-surface-2"
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl text-ink-on-accent" style={{ background: 'var(--accent)' }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 16V9M10 16V4M16 16v-6" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Your year in film</p>
          <p className="text-sm text-white/50">Hours watched, films finished, top genres</p>
        </div>
        <ChevronRightIcon className="h-5 w-5 text-white/40" />
      </Link>

      {/* Appearance */}
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-[22px] font-bold text-ink">Appearance</h2>
        <p className="text-sm text-white/45">Current · <span style={{ color: 'var(--accent)' }}>{current?.name}</span></p>
      </div>
      <p className="mb-5 max-w-[560px] text-sm text-white/55">
        Pick a theme for your profile. Each household member can choose their own — it changes the glow,
        accent, and background mood across the media app.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {THEMES.map(t => {
          const active = t.key === theme
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTheme(t.key)}
              className={`relative overflow-hidden rounded-2xl border p-0 text-left transition ${active ? 'ring-2' : 'border-border hover:border-white/20'}`}
              style={active ? { borderColor: t.accent, boxShadow: `0 0 0 2px ${t.accent}` } : undefined}
            >
              <div className="relative h-24" style={{ background: t.bg }}>
                <span className="absolute left-3 top-3 h-6 w-6 rounded-full" style={{ background: t.accent, boxShadow: `0 0 18px ${t.accent}` }} />
                {active && (
                  <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-ink-on-accent" style={{ background: t.accent }}>
                    <CheckIcon className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              <div className="bg-black/30 p-3">
                <p className="text-sm font-semibold text-ink">{t.name}</p>
                <p className="text-xs text-white/50">{t.blurb}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
