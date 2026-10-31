'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Media-wide error page (inside the media shell, so the rail stays). The usual cause
 * is the Jellyfin server being unreachable — fetchers throw instead of pretending the
 * library is empty — so that is what the copy leads with.
 */
export default function MediaError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="grid min-h-[70vh] place-items-center pl-[var(--rail)] pr-[var(--gx)] py-16">
      <div role="alert" className="max-w-[540px] text-center" style={{ animation: 'reelFade 0.4s ease' }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">Library unavailable</p>
        <h1 className="mt-3 text-[clamp(28px,6.5vw,44px)] font-[800] leading-[1.04] tracking-[-0.028em] text-ink">
          Can’t reach your media server.
        </h1>
        <p className="mt-4 text-[15px] leading-[1.6] text-white/60 [text-wrap:pretty]">
          Jellyfin didn’t answer — the NAS may be asleep, restarting or offline. Your library is fine; this page just couldn’t load it.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-white/35">Ref {error.digest}</p>}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-ink-on-accent shadow-[0_10px_30px_var(--glow)] transition hover:brightness-105"
            style={{ background: 'var(--accent)' }}
          >
            Try again
          </button>
          <Link href="/media" className="rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2">
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}
