'use client'

import { useEffect, useMemo, useState } from 'react'
import { ConfirmDialog } from '../photos/Dialog'
import { deleteItem, errorText, formatBytes, isAbort, plural, runPool, statFolder, type DocItem, type FolderStat } from './api'
import { topLevelOnly } from './selection'

type Inside = { key: string; stat: FolderStat | null }

/**
 * One confirmation per delete. For folders it says what is inside (from
 * `/api/files/stat`, falling back to the listing's child count), and it says where a
 * copy might survive: deletion is permanent here, but Synology's #recycle keeps one when
 * the share's recycle bin is enabled.
 */
export function DeleteDialog({ items: picked, onDone, onCancel }: {
  items: DocItem[]
  /** Called after the attempt with the paths that were deleted and the errors. */
  onDone: (deleted: string[], errors: string[]) => void
  onCancel: () => void
}) {
  const items = useMemo(() => topLevelOnly(picked), [picked])
  const folders = useMemo(() => items.filter(i => i.isDir), [items])
  const key = folders.map(f => f.path).join('\u0000')
  const [inside, setInside] = useState<Inside | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!key) return
    const ctrl = new AbortController()
    Promise.all(key.split('\u0000').map(p => statFolder(p, ctrl.signal)))
      .then(stats => setInside({
        key,
        stat: stats.reduce<FolderStat>((a, s) => ({
          files: a.files + s.files,
          folders: a.folders + s.folders,
          bytes: a.bytes + s.bytes,
          truncated: a.truncated || s.truncated,
        }), { files: 0, folders: 0, bytes: 0, truncated: false }),
      }))
      .catch(e => { if (!isAbort(e)) setInside({ key, stat: null }) })
    return () => ctrl.abort()
  }, [key])

  const stat = inside?.key === key ? inside : null
  const n = items.length
  const fileCount = n - folders.length
  const subject = n === 1
    ? `“${items[0].name}”`
    : [fileCount ? plural(fileCount, 'file') : '', folders.length ? plural(folders.length, 'folder') : ''].filter(Boolean).join(' and ')

  let contents: string | null = null
  if (folders.length) {
    if (!stat) contents = 'Counting what’s inside…'
    else if (stat.stat) {
      const s = stat.stat
      const more = s.truncated ? 'more than ' : ''
      contents = s.files + s.folders === 0
        ? (folders.length === 1 ? 'The folder is empty.' : 'The folders are empty.')
        : `${folders.length === 1 ? 'It contains' : 'They contain'} ${more}${plural(s.files, 'file')}${s.folders ? ` in ${plural(s.folders, 'folder')}` : ''} (${formatBytes(s.bytes)}).`
    } else {
      const children = folders.reduce((a, f) => a + f.childCount, 0)
      contents = children ? `${folders.length === 1 ? 'It contains' : 'They contain'} ${plural(children, 'item')} and everything inside them.` : null
    }
  }

  const confirm = async () => {
    setBusy(true)
    const results = await runPool(items, 2, i => deleteItem(i.path))
    const deleted = items.filter((_, i) => results[i] == null).map(i => i.path)
    const errors = results.flatMap((r, i) => (r == null ? [] : [`${items[i].name}: ${errorText(r)}`]))
    setBusy(false)
    onDone(deleted, errors)
  }

  return (
    <ConfirmDialog
      title={n === 1 ? `Delete ${items[0].isDir ? 'folder' : 'file'}?` : `Delete ${plural(n, 'item')}?`}
      confirmLabel="Delete"
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
      body={
        <div className="space-y-2.5">
          <p><span className="font-semibold text-ink">{subject}</span> will be deleted from the NAS{folders.length ? ', with everything inside' : ''}.</p>
          {contents && <p aria-live="polite">{contents}</p>}
          <p className="text-[13px] text-white/50">
            This can’t be undone here. If the recycle bin is turned on for the documents share in Synology, a copy is kept in its #recycle folder.
          </p>
        </div>
      }
    />
  )
}
