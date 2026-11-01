/** Shimmer for the browser body (grid tiles or list rows). */
export function DocumentsGridSkeleton({ view = 'grid' }: { view?: 'grid' | 'list' }) {
  if (view === 'list') {
    return (
      <div className="px-3 py-2" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-white/[0.05] py-3 last:border-0">
            <div className="reel-shimmer h-7 w-7 rounded-[6px]" />
            <div className="reel-shimmer h-3.5 rounded-full" style={{ width: `${38 + ((i * 17) % 30)}%` }} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-3 gap-1 p-2 md:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] md:gap-1.5 md:p-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-2.5 px-2 py-3">
          <div className="reel-shimmer h-[72px] w-[60px] rounded-[10px]" />
          <div className="reel-shimmer h-3 w-3/4 rounded-full" />
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
        <div className="reel-shimmer h-3 w-44 rounded-full" />
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
