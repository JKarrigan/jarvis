'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Dialog } from '../photos/Dialog'
import { ROOT_NAME, baseName, errorText, isAbort, joinPath, listFolder, listFolders, makeFolder, pathLabel, type DocItem } from './api'
import { nameProblem, nextUntitledName } from './fileKinds'
import { canMoveInto } from './selection'
import { ChevronSmallRight, FolderGlyph, FolderPlusIcon } from './icons'

type Children = DocItem[] | 'loading' | { error: string }

interface Row { path: string; name: string; depth: number }

/**
 * Move to… — a folder tree (lazy: each folder's subfolders load from `list` when it
 * is expanded) with New folder inside it. Used from the menus, the selection bar and on
 * touch, where dragging isn't available. role=tree with arrow-key navigation.
 */
export function MoveToDialog({ items, startFolder, onMove, onClose }: {
  items: DocItem[]
  /** The folder the browser is showing; its ancestors start expanded. */
  startFolder: string
  onMove: (target: string) => Promise<boolean>
  onClose: () => void
}) {
  const paths = useMemo(() => items.map(i => i.path), [items])
  const dirs = useMemo(() => new Set(items.filter(i => i.isDir).map(i => i.path)), [items])
  const [children, setChildren] = useState<Map<string, Children>>(() => new Map())
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const parts = startFolder ? startFolder.split('/') : []
    return new Set(['', ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))])
  })
  const [target, setTarget] = useState<string | null>(null)
  const [focusPath, setFocusPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ parent: string; name: string; error: string | null; saving: boolean } | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  const load = useCallback((path: string, signal?: AbortSignal) => {
    setChildren(m => new Map(m).set(path, 'loading'))
    return listFolders(path, signal)
      .then(list => {
        list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
        setChildren(m => new Map(m).set(path, list))
      })
      .catch(e => { if (!isAbort(e)) setChildren(m => new Map(m).set(path, { error: errorText(e) })) })
  }, [])

  // The initially expanded chain (root → current folder) loads once on open.
  const initial = useRef(expanded)
  useEffect(() => {
    const ctrl = new AbortController()
    for (const p of initial.current) void load(p, ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [{ path: '', name: ROOT_NAME, depth: 0 }]
    const walk = (parent: string, depth: number) => {
      const kids = children.get(parent)
      if (!Array.isArray(kids) || !expanded.has(parent)) return
      for (const k of kids) {
        out.push({ path: k.path, name: k.name, depth })
        walk(k.path, depth + 1)
      }
    }
    walk('', 1)
    return out
  }, [children, expanded])

  const disabled = useCallback((path: string) => !canMoveInto(paths, dirs, path), [paths, dirs])
  /** A folder being moved can't be opened as a destination (nothing inside it can be one). */
  const blocked = useCallback((path: string) => [...dirs].some(d => path === d || path.startsWith(`${d}/`)), [dirs])

  const toggleOpen = (path: string, open?: boolean) => {
    if (blocked(path)) return
    const isOpen = expanded.has(path)
    const next = open ?? !isOpen
    if (next === isOpen) return
    setExpanded(s => {
      const n = new Set(s)
      if (next) n.add(path)
      else n.delete(path)
      return n
    })
    if (next && !Array.isArray(children.get(path)) && children.get(path) !== 'loading') void load(path)
  }

  const choose = (path: string) => {
    setFocusPath(path)
    if (!disabled(path)) setTarget(path)
  }

  const onTreeKey = (e: React.KeyboardEvent) => {
    const i = Math.max(0, rows.findIndex(r => r.path === focusPath))
    const row = rows[i]
    const focusRow = (j: number) => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, j))]
      setFocusPath(r.path)
      treeRef.current?.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(r.path)}"]`)?.focus()
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusRow(i + 1); break
      case 'ArrowUp': e.preventDefault(); focusRow(i - 1); break
      case 'Home': e.preventDefault(); focusRow(0); break
      case 'End': e.preventDefault(); focusRow(rows.length - 1); break
      case 'ArrowRight': e.preventDefault(); if (row && !expanded.has(row.path)) toggleOpen(row.path, true); else focusRow(i + 1); break
      case 'ArrowLeft': {
        e.preventDefault()
        if (row && row.path && expanded.has(row.path)) toggleOpen(row.path, false)
        else if (row?.path) focusRow(rows.findIndex(r => r.path === (row.path.includes('/') ? row.path.slice(0, row.path.lastIndexOf('/')) : '')))
        break
      }
      case 'Enter': case ' ': e.preventDefault(); if (row) choose(row.path); break
    }
  }

  // --- New folder (inside the selected folder, else the root) ------------------------

  const draftParent = target ?? ''
  const startDraft = async () => {
    setError(null)
    try {
      const { items: inside } = await listFolder(draftParent)
      setDraft({ parent: draftParent, name: nextUntitledName(inside.map(i => i.name)), error: null, saving: false })
    } catch (e) {
      setError(errorText(e))
    }
  }
  const saveDraft = async () => {
    if (!draft || draft.saving) return
    const name = draft.name.trim()
    const problem = nameProblem(name)
    if (problem) { setDraft({ ...draft, error: problem }); return }
    const kids = children.get(draft.parent)
    if (Array.isArray(kids) && kids.some(k => k.name.toLowerCase() === name.toLowerCase())) {
      setDraft({ ...draft, error: 'A folder with that name already exists' })
      return
    }
    setDraft({ ...draft, saving: true, error: null })
    try {
      const path = joinPath(draft.parent, name)
      await makeFolder(path)
      await load(draft.parent)
      setExpanded(s => new Set(s).add(draft.parent))
      setDraft(null)
      setTarget(path)
      setFocusPath(path)
    } catch (e) {
      setDraft({ ...draft, saving: false, error: errorText(e) })
    }
  }

  const submit = async () => {
    if (target == null || busy) return
    setBusy(true)
    setError(null)
    const ok = await onMove(target)
    setBusy(false)
    if (ok) onClose()
    else setError('Some items couldn’t be moved.')
  }

  const n = items.length
  const title = n === 1 ? `Move “${items[0].name}”` : `Move ${n} items`

  return (
    <Dialog
      title={title}
      onClose={busy ? () => {} : onClose}
      wide
      initialFocus="[data-tree-path]"
      footer={
        <>
          <Button variant="ghost" onClick={() => void startDraft()} disabled={busy || draft != null} className="mr-auto">
            <FolderPlusIcon className="h-[18px] w-[18px]" /> New folder
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="accent" onClick={() => void submit()} disabled={target == null || busy}>
            {busy ? 'Moving…' : target == null ? 'Move here' : `Move to ${target ? baseName(target) : ROOT_NAME}`}
          </Button>
        </>
      }
    >
      <p className="pb-2 text-[13px] text-white/50">Choose a folder.</p>
      <div
        ref={treeRef}
        role="tree"
        aria-label="Folders"
        onKeyDown={onTreeKey}
        className="-mx-2 max-h-[min(48vh,360px)] overflow-y-auto rounded-[12px] border border-white/[0.07] bg-black/20 p-1.5"
      >
        {rows.map(r => {
          const kids = children.get(r.path)
          const open = expanded.has(r.path)
          const isTarget = target === r.path
          const off = disabled(r.path)
          const noOpen = blocked(r.path) || (Array.isArray(kids) && kids.length === 0)
          return (
            <div key={r.path || '/'}>
              <div
                role="treeitem"
                aria-level={r.depth + 1}
                aria-selected={isTarget}
                aria-expanded={noOpen ? undefined : open}
                aria-disabled={off || undefined}
                data-tree-path={r.path}
                tabIndex={focusPath === r.path ? 0 : -1}
                onClick={() => choose(r.path)}
                onDoubleClick={() => toggleOpen(r.path)}
                onFocus={() => setFocusPath(r.path)}
                style={{ paddingLeft: 6 + r.depth * 18 }}
                className={`flex min-h-10 cursor-default items-center gap-1.5 rounded-[10px] pr-2 text-[14px] outline-none transition focus-visible:ring-2 focus-visible:ring-white/40 ${
                  isTarget ? 'bg-[var(--accent)]/20 font-semibold text-ink ring-1 ring-inset ring-[var(--accent)]' : off ? 'text-white/35' : 'text-white/85 hover:bg-white/[0.06]'
                }`}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={e => { e.stopPropagation(); toggleOpen(r.path) }}
                  className={`grid h-7 w-6 shrink-0 place-items-center rounded-md ${noOpen ? 'invisible' : ''}`}
                >
                  <ChevronSmallRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>
                <FolderGlyph open={open && !noOpen} className="h-[18px] w-[22px] shrink-0" />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {kids === 'loading' && open && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" aria-label="Loading" />}
              </div>
              {open && kids && !Array.isArray(kids) && kids !== 'loading' && (
                <p role="alert" className="py-1 text-[12px] text-[#ff8a8a]" style={{ paddingLeft: 36 + r.depth * 18 }}>{kids.error}</p>
              )}
            </div>
          )
        })}
      </div>
      {draft && (
        <form
          onSubmit={e => { e.preventDefault(); void saveDraft() }}
          className="mt-3 rounded-[12px] border border-white/10 bg-white/[0.04] p-3"
        >
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/45" htmlFor="docs-move-new-folder">
            New folder in {pathLabel(draft.parent).split(' › ').pop()}
          </label>
          <div className="flex gap-2">
            <input
              id="docs-move-new-folder"
              autoFocus
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value, error: null })}
              onFocus={e => e.currentTarget.select()}
              onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(null) } }}
              autoComplete="off"
              spellCheck={false}
              className="h-10 min-w-0 flex-1 rounded-[10px] border border-white/10 bg-white/[0.06] px-3 text-[14px] text-ink outline-none focus:border-[var(--accent)]"
            />
            <Button type="submit" variant="glass" disabled={draft.saving}>{draft.saving ? 'Creating…' : 'Create'}</Button>
          </div>
          {draft.error && <p role="alert" className="mt-1.5 text-[12px] text-[#ff8a8a]">{draft.error}</p>}
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-[#ff8a8a]">{error}</p>}
    </Dialog>
  )
}
