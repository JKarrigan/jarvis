'use client'

import { useState } from 'react'
import { deleteForever, emptyTrash, errorText, formatBytes, formatCount, restorePhoto, runPool } from './api'
import { useSummary, useToast } from './hooks'
import { ActionButton, BrowserBody, OfflineBanner, SelectionBar, Toast, usePhotoBrowser, ViewerHost } from './PhotoBrowser'
import { ConfirmDialog } from './Dialog'
import { BackPill } from './AlbumsView'
import { toolbarBtn } from './Menu'
import { CheckboxIcon, RestoreIcon, TrashIcon } from './icons'

/** /media/photos/trash — Recently deleted. */
export function TrashView() {
  const b = usePhotoBrowser('/api/photos/trash', '')
  const { summary, reload: reloadSummary } = useSummary()
  const { toast, show } = useToast()
  const [confirm, setConfirm] = useState<null | 'forever' | 'empty'>(null)
  const [busy, setBusy] = useState(false)
  const ids = [...b.sel.selected]
  const byId = new Map(b.items.map(i => [i.id, i]))
  const restorable = ids.filter(id => !byId.get(id)?.missing)

  const bulk = async (kind: 'restore' | 'forever') => {
    const list = kind === 'restore' ? restorable : ids
    setBusy(true)
    const ok = await runPool(list, 4, id => (kind === 'restore' ? restorePhoto(id) : deleteForever(id)))
    const done = list.filter((_, i) => ok[i])
    b.removeItems(done)
    b.sel.clear()
    setBusy(false)
    setConfirm(null)
    reloadSummary()
    const failed = list.length - done.length
    if (failed) show(`${failed} couldn't be ${kind === 'restore' ? 'restored' : 'deleted'}`, 'error')
    else show(kind === 'restore' ? `Restored ${formatCount(done.length, 'item')}` : `Deleted ${formatCount(done.length, 'item')} forever`)
  }

  const empty = async () => {
    setBusy(true)
    try {
      const r = await emptyTrash()
      b.sel.clear()
      b.reload()
      reloadSummary()
      show(`Deleted ${formatCount(r.deleted, 'item')} forever`)
    } catch (e) {
      show(errorText(e), 'error')
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const count = summary?.trashCount ?? b.items.length

  return (
    <div className="pb-24 pl-[var(--rail)] pr-[var(--gx)] pt-16 md:pt-8">
      <BackPill href="/media/photos" label="Photos" />
      <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <h1 className="text-[34px] font-[800] leading-none tracking-[-0.02em] text-ink md:text-[42px]">Recently deleted</h1>
          <p className="mt-2 text-[13px] text-white/50">
            {summary ? `${formatCount(summary.trashCount, 'item')} · ${formatBytes(summary.diskUsage.trashBytes)}` : ' '}
            <span className="hidden sm:inline"> · Items stay here until you empty the trash.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => (b.sel.active ? b.sel.clear() : b.sel.start())} aria-pressed={b.sel.active} className={toolbarBtn} disabled={b.items.length === 0}>
            <CheckboxIcon className="h-4 w-4" checked={b.sel.active} /> Select
          </button>
          <button
            type="button"
            onClick={() => setConfirm('empty')}
            disabled={count === 0 || busy}
            className={`${toolbarBtn} text-[#ff9a9a] disabled:opacity-40`}
          >
            <TrashIcon className="h-4 w-4" /> Empty trash
          </button>
        </div>
      </header>

      {summary?.libraryOnline === false && <OfflineBanner />}

      <BrowserBody
        b={b}
        sections={false}
        badge={item => (item.missing ? (
          <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/80" title="The file disappeared from the share">Missing</span>
        ) : null)}
        empty={
          <div className="flex flex-col items-center rounded-[22px] border border-border bg-surface px-6 py-14 text-center">
            <TrashIcon className="mb-3 h-10 w-10 text-white/40" />
            <h2 className="text-[20px] font-bold text-ink">Nothing in the trash</h2>
            <p className="mt-1.5 max-w-[420px] text-[14px] text-white/55">Deleted photos and videos wait here until you restore them or empty the trash.</p>
          </div>
        }
      />

      <SelectionBar b={b} viewerOpen={Boolean(b.viewer.viewerId)}>
        <ActionButton label="Restore" icon={<RestoreIcon className="h-5 w-5" />} disabled={restorable.length === 0 || busy} onClick={() => void bulk('restore')} />
        <ActionButton label="Delete forever" danger icon={<TrashIcon className="h-5 w-5" />} disabled={ids.length === 0 || busy} onClick={() => setConfirm('forever')} />
      </SelectionBar>

      {confirm === 'forever' && (
        <ConfirmDialog
          title={`Delete ${formatCount(ids.length, 'item')} forever?`}
          body="The original files are removed from the library. This can't be undone."
          confirmLabel="Delete forever"
          busy={busy}
          onConfirm={() => void bulk('forever')}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'empty' && (
        <ConfirmDialog
          title="Empty the trash?"
          body={`${formatCount(count, 'item')} will be deleted forever. This can't be undone.`}
          confirmLabel="Empty trash"
          busy={busy}
          onConfirm={() => void empty()}
          onCancel={() => setConfirm(null)}
        />
      )}

      <ViewerHost b={b} mode="trash" onChanged={reloadSummary} />
      <Toast toast={toast} />
    </div>
  )
}
