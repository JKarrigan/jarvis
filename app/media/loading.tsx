/** Skeleton while a media page's server data loads (Reel shimmer, per the spec). */
export default function MediaLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="pb-16">
      <div className="reel-shimmer h-[52vh] min-h-[320px] w-full" />
      <div className="mt-8 space-y-10 pl-[var(--rail)] pr-[var(--gx)]">
        {[0, 1].map(row => (
          <div key={row}>
            <div className="reel-shimmer mb-4 h-5 w-44 rounded-md" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="w-[150px] shrink-0 md:w-[178px]">
                  <div className="reel-shimmer aspect-[2/3] w-full rounded-xl" />
                  <div className="reel-shimmer mt-2.5 h-3.5 w-3/4 rounded" />
                  <div className="reel-shimmer mt-1.5 h-3 w-1/2 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
