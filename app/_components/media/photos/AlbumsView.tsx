'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { collArt, collColor, hueFromId, POSTER_SHEEN } from '../artwork'
import { createAlbum, formatCount, type Album } from './api'
import { useAlbums } from './hooks'
import { Thumb } from './PhotoGrid'
import { NameDialog } from './Dialog'
import { AlbumIcon, ChevronLeftIcon, PlusIcon } from './icons'
import { toolbarBtn } from './Menu'

/** Square album tile: cover thumb (collection-art gradient when empty), name, count. */
export function TileCard({ album }: { album: Album }) {
  const hue = hueFromId(album.id)
  return (
    <Link href={`/media/photos/albums/${album.id}`} className="group flex flex-col gap-2 outline-none">
      <div className="relative aspect-square w-full overflow-hidden rounded-[13px] shadow-[0_16px_34px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent)]" style={{ background: collArt(hue) }}>
        {album.coverId ? <Thumb item={{ id: album.coverId, size: 0 }} /> : (
          <>
            <div className="absolute inset-0" style={{ background: POSTER_SHEEN }} />
            <AlbumIcon className="absolute inset-0 m-auto h-10 w-10 text-white/35" />
          </>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(8,6,13,0.7))' }} />
        <div className="pointer-events-none absolute inset-0 rounded-[13px] ring-1 ring-inset ring-white/10 transition group-hover:ring-white/20" />
        <p className="absolute bottom-2.5 left-3 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: collColor(hue) }}>Album</p>
      </div>
      <div className="min-w-0 px-0.5">
        <p className="truncate text-[14px] font-semibold text-ink">{album.name}</p>
        <p className="text-[11.5px] text-white/45">{formatCount(album.count, 'item')}</p>
      </div>
    </Link>
  )
}

export function BackPill({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex h-9 items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] pl-2.5 pr-3.5 text-[13px] font-semibold text-white/80 transition hover:bg-white/10">
      <ChevronLeftIcon className="h-4 w-4" /> {label}
    </Link>
  )
}

/** /media/photos/albums */
export function AlbumsView() {
  const { albums, error, loading } = useAlbums()
  const [creating, setCreating] = useState(false)
  const router = useRouter()

  return (
    <div className="pb-24 pl-[var(--rail)] pr-[var(--gx)] pt-16 md:pt-8">
      <BackPill href="/media/photos" label="Photos" />
      <header className="mb-6 flex flex-wrap items-end gap-4">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <h1 className="text-[34px] font-[800] leading-none tracking-[-0.02em] text-ink md:text-[42px]">Albums</h1>
          {albums && <p className="mt-2 text-[13px] text-white/50">{formatCount(albums.length, 'album')}</p>}
        </div>
        <button type="button" onClick={() => setCreating(true)} className={toolbarBtn}>
          <PlusIcon className="h-4 w-4" /> New album
        </button>
      </header>

      {error && <p role="alert" className="mb-4 text-[14px] text-[#ff8a8a]">{error}</p>}
      {loading && !albums ? (
        <div className="grid gap-x-5 gap-y-7" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min), 1fr))' }} aria-hidden>
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="reel-shimmer aspect-square rounded-[13px]" />)}
        </div>
      ) : albums && albums.length === 0 ? (
        <div className="flex flex-col items-center rounded-[22px] border border-border bg-surface px-6 py-14 text-center">
          <AlbumIcon className="mb-3 h-10 w-10 text-accent" />
          <h2 className="text-[20px] font-bold text-ink">No albums yet</h2>
          <p className="mt-1.5 max-w-[420px] text-[14px] text-white/55">Create one here, or select photos in the timeline and choose “Add to album”.</p>
        </div>
      ) : (
        <div className="grid gap-x-5 gap-y-7" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min), 1fr))' }}>
          {albums?.map(a => <TileCard key={a.id} album={a} />)}
        </div>
      )}

      {creating && (
        <NameDialog
          title="New album"
          label="Album name"
          submitLabel="Create"
          onCancel={() => setCreating(false)}
          onSubmit={async name => {
            const a = await createAlbum(name)
            router.push(`/media/photos/albums/${a.id}`)
          }}
        />
      )}
    </div>
  )
}
