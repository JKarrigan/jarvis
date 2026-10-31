import Link from 'next/link'

export default function MediaNotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center pl-[var(--rail)] pr-[var(--gx)] py-16">
      <div className="max-w-[520px] text-center" style={{ animation: 'reelFade 0.4s ease' }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">404 · Not in the library</p>
        <h1 className="mt-3 text-[clamp(30px,7vw,48px)] font-[800] leading-[1.02] tracking-[-0.028em] text-ink">
          This one isn’t on the shelf.
        </h1>
        <p className="mt-4 text-[15px] leading-[1.6] text-white/60 [text-wrap:pretty]">
          The title, collection or page you followed doesn’t exist — it may have been removed from the server or the link is out of date.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/media"
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-ink-on-accent shadow-[0_10px_30px_var(--glow)] transition hover:brightness-105"
            style={{ background: 'var(--accent)' }}
          >
            Back to Home
          </Link>
          <Link href="/media/movies" className="rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2">
            Browse movies
          </Link>
        </div>
      </div>
    </div>
  )
}
