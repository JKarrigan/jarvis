import { GRID, ROW_GRID, ROW_HEIGHT, TILE, TILE_META, TILE_NAME, TILE_WELL } from './geometry'

/**
 * Shimmer for the browser body, in the real tiles' and rows' exact geometry (shared
 * class strings), so swapping it for a folder moves nothing.
 */
export function DocumentsGridSkeleton({ view = 'grid' }: { view?: 'grid' | 'list' }) {
  if (view === 'list') {
    return (
      <div className="flex flex-col" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`${ROW_GRID} ${ROW_HEIGHT} border-b border-white/[0.05] px-2 last:border-b-0 md:px-3`}>
            <span aria-hidden />
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="reel-shimmer h-7 w-7 shrink-0 rounded-[6px]" />
              <div className="reel-shimmer h-3.5 rounded-full" style={{ width: `${38 + ((i * 17) % 30)}%` }} />
            </div>
            <div className="reel-shimmer hidden h-3 w-16 rounded-full md:block" />
            <div className="reel-shimmer hidden h-3 w-24 rounded-full md:block" />
            <div className="reel-shimmer hidden h-3 w-12 justify-self-end rounded-full md:block" />
            <span aria-hidden />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={GRID} aria-busy="true" aria-label="Loading">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className={TILE}>
          <div className={TILE_WELL}><div className="reel-shimmer h-[66px] w-[54px] rounded-[10px]" /></div>
          <div className={`${TILE_NAME} pt-1`}><div className="reel-shimmer h-3 w-3/4 rounded-full" /></div>
          <div className={TILE_META}><div className="reel-shimmer h-2.5 w-10 rounded-full" /></div>
        </div>
      ))}
    </div>
  )
}

/** Route loading state + Suspense fallback for /media/documents. */
export function DocumentsSkeleton() {
  return (
    <div className="pb-28 pl-[var(--rail)] pr-[var(--gx)] pt-16 md:pt-8" aria-busy="true" aria-label="Loading documents">
      <div className="mb-6 space-y-3">
        <div className="reel-shimmer h-3 w-24 rounded-full" />
        <div className="reel-shimmer h-10 w-56 rounded-[12px]" />
        <div className="flex h-5 items-center"><div className="reel-shimmer h-3 w-44 rounded-full" /></div>
      </div>
      <div className="rounded-[18px] border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
          <div className="reel-shimmer h-4 w-40 rounded-full" />
          <div className="reel-shimmer hidden h-10 w-[340px] rounded-[12px] md:block" />
        </div>
        <DocumentsGridSkeleton />
      </div>
    </div>
  )
}
