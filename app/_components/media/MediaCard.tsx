import Link from 'next/link'

export interface MediaItem {
  id: string
  title: string
  subtitle?: string
  year?: number
  badge?: string
  posterColor: string
  href?: string
}

export function MediaCard({ item, width = 'w-36' }: { item: MediaItem; width?: string }) {
  const inner = (
    <div className="group flex flex-col gap-2 cursor-pointer">
      <div
        className={`${width} shrink-0 aspect-[2/3] rounded-lg overflow-hidden flex items-end p-2.5 relative`}
        style={{ background: item.posterColor }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {item.badge && (
          <span className="relative z-10 text-[9px] font-bold uppercase tracking-widest text-white/80 bg-white/15 backdrop-blur-sm px-1.5 py-0.5 rounded">
            {item.badge}
          </span>
        )}
        <div className="absolute inset-0 ring-1 ring-inset ring-white/8 rounded-lg group-hover:ring-white/20 transition-all duration-200" />
        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 rounded-lg transition-all duration-200" />
      </div>
      <div className={`${width} shrink-0 min-w-0`}>
        <p className="text-xs text-zinc-200 truncate leading-tight font-medium">{item.title}</p>
        {(item.subtitle || item.year) && (
          <p className="text-[11px] text-zinc-500 truncate mt-0.5">
            {[item.subtitle, item.year].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )

  return item.href ? <Link href={item.href}>{inner}</Link> : inner
}

export function MediaRow({ items }: { items: MediaItem[] }) {
  return (
    <div className="flex gap-6 overflow-x-auto pb-2 scrollbar-hide px-4 md:px-6">
      {items.map(item => <MediaCard key={item.id} item={item} width="w-28 sm:w-44" />)}
    </div>
  )
}

export function MediaGrid({ items }: { items: MediaItem[] }) {
  return (
    <div className="grid gap-x-6 gap-y-5 px-4 md:px-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))' }}>
      {items.map(item => (
        <MediaCard key={item.id} item={item} width="w-full" />
      ))}
    </div>
  )
}
