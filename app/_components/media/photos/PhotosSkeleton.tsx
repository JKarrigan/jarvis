import { GridSkeleton } from './PhotoGrid'

/** Shimmer placeholder for the Photos pages (route loading state + Suspense fallback). */
export function PhotosSkeleton({ title = true }: { title?: boolean }) {
  return (
    <div className="pb-24 pl-[var(--rail)] pr-[var(--gx)] pt-16 md:pt-8" aria-busy="true" aria-label="Loading photos">
      {title && (
        <div className="mb-6 space-y-3">
          <div className="reel-shimmer h-3 w-28 rounded-full" />
          <div className="reel-shimmer h-10 w-48 rounded-[12px]" />
          <div className="reel-shimmer h-3 w-56 rounded-full" />
        </div>
      )}
      <div className="mb-5 flex gap-2">
        {[64, 80, 76, 96].map((w, i) => <div key={i} className="reel-shimmer h-9 rounded-full" style={{ width: w }} />)}
      </div>
      <div className="reel-shimmer mb-3 h-5 w-40 rounded-full" />
      <GridSkeleton count={24} />
    </div>
  )
}
