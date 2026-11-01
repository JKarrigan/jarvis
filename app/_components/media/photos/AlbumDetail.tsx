'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteAlbum, errorText, fetchJson, formatCount, isAbort, PhotosApiError, removeFromAlbum, updateAlbum, type Album } from './api'
import { useToast } from './hooks'
import { ActionButton, AlbumPickerSheet, BrowserBody, bulkFavorite, SelectionBar, Toast, usePhotoBrowser, ViewerHost } from './PhotoBrowser'
import { ConfirmDialog, NameDialog } from './Dialog'
import { TagSheet } from './Tags'
import { BackPill } from './AlbumsView'
import { toolbarBtn } from './Menu'
import { AlbumIcon, CheckboxIcon, CoverIcon, HeartIcon, PencilIcon, RemoveIcon, TagIcon, TrashIcon } from './icons'

/** /media/photos/albums/[id] — the timeline grid filtered to one album. */
export function AlbumDetail({ id }: { id: string }) {
  const router = useRouter()
  const b = usePhotoBrowser('/api/photos', `album=${id}`)
  const { toast, show } = useToast()
  const [album, setAlbum] = useState<{ id: string; data: Album | null; error: string | null; status?: number } | null>(null)
  const [seq, setSeq] = useState(0)
  const [dialog, setDialog] = useState<null | 'rename' | 'delete' | 'picker' | 'tags'>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    fetchJson<Album>(`/api/photos/albums/${id}`, { signal: ctrl.signal })
      .then(data => setAlbum({ id, data, error: null }))
      .catch(e => {
        if (isAbort(e)) return
        setAlbum({ id, data: null, error: errorText(e), status: e instanceof PhotosApiError ? e.status : undefined })
      })
    return () => ctrl.abort()
  }, [id, seq])
  const reloadAlbum = useCallback(() => setSeq(n => n + 1), [])

  const a = album?.id === id ? album : null
  const ids = [...b.sel.selected]

  if (a?.status === 404) {
    return (
      <div className="pb-24 pl-[var(--rail)] pr-[var(--gx)] pt-16 md:pt-8">
        <BackPill href="/media/photos/albums" label="Albums" />
        <div className="rounded-[22px] border border-border bg-surface px-6 py-14 text-center">
          <h1 className="text-[22px] font-bold text-ink">Album not found</h1>
          <p className="mt-1.5 text-[14px] text-white/55">It may have been deleted.</p>
        </div>
      </div>
    )
  }

  const removeSelected = async () => {
    setBusy(true)
    try {
      const r = await removeFromAlbum(id, ids)
      b.removeItems(ids)
      b.sel.clear()
      setAlbum({ id, data: r.album, error: null })
      show(`Removed ${formatCount(r.removed, 'item')} from the album`)
    } catch (e) {
      show(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  const setCover = async () => {
    if (ids.length !== 1) return
    try {
      const updated = await updateAlbum(id, { coverId: ids[0] })
      setAlbum({ id, data: updated, error: null })
      b.sel.clear()
      show('Album cover updated')
    } catch (e) {
      show(errorText(e), 'error')
    }
  }

  return (
    <div className="pb-24 pl-[var(--rail)] pr-[var(--gx)] pt-16 md:pt-8">
      <BackPill href="/media/photos/albums" label="Albums" />
      <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">
            <AlbumIcon className="h-3.5 w-3.5" /> Album
          </p>
          {a?.data ? (
            <h1 className="break-words text-[34px] font-[800] leading-[1.02] tracking-[-0.02em] text-ink md:text-[42px]">{a.data.name}</h1>
          ) : (
            <div className="reel-shimmer h-10 w-64 rounded-[10px]" aria-hidden />
          )}
          <p className="mt-2 text-[13px] text-white/50">
            {a?.data ? `${formatCount(a.data.count, 'item')} · created ${new Date(a.data.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : a?.error ?? ' '}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => (b.sel.active ? b.sel.clear() : b.sel.start())} aria-pressed={b.sel.active} className={toolbarBtn}>
            <CheckboxIcon className="h-4 w-4" checked={b.sel.active} /> Select
          </button>
          <button type="button" onClick={() => setDialog('rename')} disabled={!a?.data} className={toolbarBtn}>
            <PencilIcon className="h-4 w-4" /> Rename
          </button>
          <button type="button" onClick={() => setDialog('delete')} disabled={!a?.data} className={`${toolbarBtn} text-[#ff9a9a]`} aria-label="Delete album">
            <TrashIcon className="h-4 w-4" /> <span className="hidden sm:inline">Delete album</span>
          </button>
        </div>
      </header>

      <BrowserBody
        b={b}
        empty={
          <div className="flex flex-col items-center rounded-[22px] border border-border bg-surface px-6 py-14 text-center">
            <AlbumIcon className="mb-3 h-10 w-10 text-accent" />
            <h2 className="text-[20px] font-bold text-ink">This album is empty</h2>
            <p className="mt-1.5 max-w-[420px] text-[14px] text-white/55">In Photos, choose Select, pick some photos and tap “Add to album”.</p>
          </div>
        }
      />

      <SelectionBar b={b} viewerOpen={Boolean(b.viewer.viewerId)}>
        <ActionButton label="Favorite" icon={<HeartIcon className="h-5 w-5" />} disabled={ids.length === 0} onClick={() => void bulkFavorite(b, show)} />
        <ActionButton label="Add to album" icon={<AlbumIcon className="h-5 w-5" />} disabled={ids.length === 0} onClick={() => setDialog('picker')} />
        <ActionButton label="Tag" icon={<TagIcon className="h-5 w-5" />} disabled={ids.length === 0} onClick={() => setDialog('tags')} />
        <ActionButton label="Set cover" icon={<CoverIcon className="h-5 w-5" />} disabled={ids.length !== 1} onClick={() => void setCover()} />
        <ActionButton label="Remove" danger icon={<RemoveIcon className="h-5 w-5" />} disabled={ids.length === 0 || busy} onClick={() => void removeSelected()} />
      </SelectionBar>

      {dialog === 'picker' && (
        <AlbumPickerSheet
          ids={ids}
          excludeAlbum={id}
          onClose={() => setDialog(null)}
          onDone={(t, tone) => { show(t, tone); if (tone !== 'error') b.sel.clear() }}
        />
      )}
      {dialog === 'tags' && <TagSheet b={b} onClose={() => setDialog(null)} onDone={show} />}
      {dialog === 'rename' && a?.data && (
        <NameDialog
          title="Rename album"
          label="Album name"
          initial={a.data.name}
          submitLabel="Save"
          onCancel={() => setDialog(null)}
          onSubmit={async name => {
            const updated = await updateAlbum(id, { name })
            setAlbum({ id, data: updated, error: null })
            setDialog(null)
          }}
        />
      )}
      {dialog === 'delete' && a?.data && (
        <ConfirmDialog
          title={`Delete “${a.data.name}”?`}
          body="Only the album is removed — its photos and videos stay in your library."
          confirmLabel="Delete album"
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            setBusy(true)
            try {
              await deleteAlbum(id)
              router.push('/media/photos/albums')
            } catch (e) {
              show(errorText(e), 'error')
              setBusy(false)
              setDialog(null)
            }
          }}
        />
      )}

      <ViewerHost b={b} onChanged={reloadAlbum} />
      <Toast toast={toast} />
    </div>
  )
}
