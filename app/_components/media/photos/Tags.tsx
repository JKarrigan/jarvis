'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { applyTagChange, hasTag, MAX_TAG_LENGTH, normalizeTag, tagKey } from '@/lib/photos/tags'
import { changeTags, errorText, formatCount, type PhotoTagCount } from './api'
import { useTagCounts } from './hooks'
import type { PhotoBrowser } from './PhotoBrowser'
import { Button, Dialog } from './Dialog'
import { Menu, menuItemClass } from './Menu'
import { CheckIcon } from '../icons'
import { ChevronDownIcon, CloseIcon, PlusIcon, TagIcon, TriCheckIcon } from './icons'

const chipClass = 'inline-flex max-w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] text-[12.5px] font-semibold text-white/85'
const inputClass = 'h-11 min-w-0 flex-1 rounded-[12px] border border-white/10 bg-white/[0.06] px-3.5 text-[15px] text-ink outline-none transition placeholder:text-white/35 focus:border-[var(--accent)]'
const INVALID = `Tags are 1–${MAX_TAG_LENGTH} characters`

/** The library's spelling of `tag` if it already exists (the server keeps that one too). */
function canonical(tag: string, known: readonly PhotoTagCount[] | null): string {
  const k = tagKey(tag)
  return known?.find(t => tagKey(t.tag) === k)?.tag ?? tag
}

// ── Timeline filter ──────────────────────────────────────────────────────────

/** "Tags" dropdown for the timeline's filter row; the list is fetched each time it opens. */
export function TagFilterMenu({ current, onPick }: { current: string | null; onPick: (tag: string | null) => void }) {
  return (
    <Menu
      label="Tags"
      align="auto"
      trigger={<><TagIcon className="h-3.5 w-3.5" /> Tags <ChevronDownIcon className="h-3.5 w-3.5 text-white/50" /></>}
      triggerClassName={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold transition hover:bg-white/[0.11] ${current ? 'bg-white/[0.1] text-ink' : 'bg-white/[0.06] text-white/75'}`}
    >
      {close => <TagMenuItems current={current} onPick={t => { close(); onPick(t) }} />}
    </Menu>
  )
}

function TagMenuItems({ current, onPick }: { current: string | null; onPick: (tag: string | null) => void }) {
  const { tags, error, loading } = useTagCounts(true)
  const currentKey = current ? tagKey(current) : null
  return (
    <div className="max-h-[min(380px,60vh)] overflow-y-auto">
      <button role="menuitem" type="button" className={menuItemClass} aria-current={currentKey == null ? 'true' : undefined} onClick={() => onPick(null)}>
        <span className="flex-1">All items</span>
        {currentKey == null && <CheckIcon aria-hidden className="h-4 w-4 text-accent" />}
      </button>
      {loading && !tags && <p className="px-3 py-2.5 text-[13px] text-white/45">Loading tags…</p>}
      {error && <p role="alert" className="px-3 py-2.5 text-[13px] text-[#ff8a8a]">{error}</p>}
      {tags && tags.length === 0 && !error && (
        <p className="px-3 py-2.5 text-[13px] leading-snug text-white/45">No tags yet. Add them in a photo&apos;s Info panel, or choose Select → Tag.</p>
      )}
      {tags && tags.length > 0 && <div className="my-1 border-t border-white/[0.07]" aria-hidden />}
      {tags?.map(t => {
        const on = tagKey(t.tag) === currentKey
        return (
          <button
            key={t.tag}
            role="menuitem"
            type="button"
            className={menuItemClass}
            aria-current={on ? 'true' : undefined}
            aria-label={`${t.tag}, ${formatCount(t.count, 'item')}`}
            onClick={() => onPick(t.tag)}
          >
            <TagIcon className={`h-4 w-4 shrink-0 ${on ? 'text-accent' : 'text-white/45'}`} />
            <span className={`min-w-0 flex-1 truncate ${on ? 'text-accent' : ''}`}>{t.tag}</span>
            <span className="text-[12px] text-white/45">{t.count.toLocaleString('en-GB')}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Clearable chip for the active tag filter (next to the period chip). */
export function TagFilterChip({ tag, onClear }: { tag: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`Clear tag filter: ${tag}`}
      className="inline-flex h-9 max-w-[16rem] items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-white/[0.04] pl-3 pr-2.5 text-[13.5px] font-semibold text-accent"
    >
      <TagIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{tag}</span>
      <CloseIcon className="h-3.5 w-3.5 shrink-0" />
    </button>
  )
}

// ── Viewer info panel ────────────────────────────────────────────────────────

/**
 * Tag chips (× removes) plus an input with suggestions from the library. `onChange` gets the
 * whole new list; the viewer applies it optimistically. Bumping `focusSignal` focuses the
 * input (the viewer's T key).
 */
export function TagEditor({ tags, onChange, focusSignal = 0 }: {
  tags: string[]
  onChange: (next: string[]) => void
  focusSignal?: number
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const hintId = useId()
  const { tags: library } = useTagCounts(true)

  useEffect(() => {
    if (focusSignal > 0) input.current?.focus()
  }, [focusSignal])

  const needle = tagKey(text.trim())
  const suggestions = useMemo(
    () => (library ?? []).filter(t => !hasTag(tags, t.tag) && (!needle || tagKey(t.tag).includes(needle))).slice(0, 8),
    [library, tags, needle],
  )

  const add = (raw: string) => {
    const t = normalizeTag(raw)
    if (!t) { setError(INVALID); return }
    setError(null)
    setText('')
    input.current?.focus()
    if (!hasTag(tags, t)) onChange(applyTagChange(tags, [canonical(t, library)]))
  }
  const remove = (t: string) => {
    onChange(applyTagChange(tags, [], [t]))
    input.current?.focus()
  }

  return (
    <div className="pt-1">
      {tags.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Tags on this item">
          {tags.map(t => (
            <li key={t} className={`${chipClass} py-0.5 pl-2.5 pr-0.5`}>
              <span className="truncate">{t}</span>
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`Remove tag ${t}`}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/55 transition hover:bg-white/15 hover:text-white"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={e => { e.preventDefault(); add(text) }} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">Add a tag</label>
        <input
          ref={input}
          id={inputId}
          value={text}
          onChange={e => { setText(e.target.value); setError(null) }}
          onKeyDown={e => {
            // Esc leaves the field (the viewer's own Esc handling ignores inputs).
            if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur() }
          }}
          placeholder="Add a tag…"
          maxLength={MAX_TAG_LENGTH + 20}
          autoComplete="off"
          enterKeyHint="done"
          aria-keyshortcuts="T"
          aria-describedby={error ? hintId : undefined}
          aria-invalid={error ? true : undefined}
          className={`${inputClass} h-10 text-[14px]`}
          data-testid="tag-input"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Add tag"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-white/10 bg-white/[0.06] text-ink transition hover:bg-white/[0.12] disabled:opacity-40"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </form>
      {error && <p id={hintId} role="alert" className="pt-1.5 text-[12.5px] text-[#ff8a8a]">{error}</p>}
      {suggestions.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested tags">
          {suggestions.map(s => (
            <li key={s.tag}>
              <button
                type="button"
                onClick={() => add(s.tag)}
                aria-label={`Add tag ${s.tag}`}
                className={`${chipClass} border-dashed bg-transparent px-2.5 py-1 text-white/65 transition hover:bg-white/[0.08] hover:text-white`}
              >
                <PlusIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{s.tag}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Read-only chips (trash viewer). */
export function TagChips({ tags }: { tags: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Tags">
      {tags.map(t => <li key={t} className={`${chipClass} px-2.5 py-1`}>{t}</li>)}
    </ul>
  )
}

// ── Selection sheet ──────────────────────────────────────────────────────────

type Row = { tag: string; on: number; libraryCount: number }

/**
 * "Tag" action for a selection: type a new tag (Enter adds it to every selected item), or
 * toggle existing ones. Each row is a tri-state checkbox — checked when every selected item
 * has the tag, mixed when some do; toggling adds to / removes from the whole selection
 * through `POST /api/photos/tags`, optimistically. With `filterTag`, items that lose the
 * filtered tag leave the list.
 */
export function TagSheet({ b, onClose, onDone, filterTag = null }: {
  b: PhotoBrowser
  onClose: () => void
  onDone: (text: string, tone?: 'ok' | 'error') => void
  filterTag?: string | null
}) {
  const { tags: library, reload: reloadLibrary } = useTagCounts(true)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [changed, setChanged] = useState(false)
  const inputId = useId()

  const { selected } = b.sel
  const ids = useMemo(() => [...selected], [selected])
  const items = useMemo(() => b.items.filter(i => selected.has(i.id)), [b.items, selected])
  const total = items.length

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, Row>()
    for (const it of items) {
      for (const t of it.tags) {
        const k = tagKey(t)
        const r = byKey.get(k)
        if (r) r.on++
        else byKey.set(k, { tag: t, on: 1, libraryCount: 0 })
      }
    }
    for (const t of library ?? []) {
      const r = byKey.get(tagKey(t.tag))
      if (r) r.libraryCount = t.count
      else byKey.set(tagKey(t.tag), { tag: t.tag, on: 0, libraryCount: t.count })
    }
    const needle = tagKey(text.trim())
    return [...byKey.values()]
      .filter(r => !needle || tagKey(r.tag).includes(needle))
      .sort((x, y) => (y.on > 0 ? 1 : 0) - (x.on > 0 ? 1 : 0) || y.on - x.on || y.libraryCount - x.libraryCount || tagKey(x.tag).localeCompare(tagKey(y.tag)))
  }, [items, library, text])

  const apply = async (add: string[], remove: string[], done: string) => {
    if (busy || ids.length === 0) return
    setBusy(true)
    const before = new Map(items.map(i => [i.id, i.tags]))
    b.updateItems(ids, i => ({ ...i, tags: applyTagChange(i.tags, add, remove) }))
    try {
      await changeTags(ids, add, remove)
      setChanged(true)
      setStatus(done)
      reloadLibrary()
      if (filterTag && hasTag(remove, filterTag)) {
        // They no longer match the timeline's tag filter.
        b.removeItems(ids)
        b.sel.clear()
        onDone(done)
        onClose()
      }
    } catch (e) {
      b.updateItems(ids, i => ({ ...i, tags: before.get(i.id) ?? i.tags }))
      setStatus('')
      onDone(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const n = formatCount(total, 'item')
  const addTyped = (e: React.FormEvent) => {
    e.preventDefault()
    const t = normalizeTag(text)
    if (!t) { setError(INVALID); return }
    const tag = canonical(rows.find(r => tagKey(r.tag) === tagKey(t))?.tag ?? t, library)
    setError(null)
    setText('')
    void apply([tag], [], `Added “${tag}” to ${n}`)
  }
  const toggle = (r: Row) => {
    if (r.on === total) void apply([], [r.tag], `Removed “${r.tag}” from ${n}`)
    else void apply([r.tag], [], `Added “${r.tag}” to ${n}`)
  }
  const finish = () => {
    if (changed) { b.sel.clear(); onDone(status || `Tags updated on ${n}`) }
    onClose()
  }

  return (
    <Dialog
      title={`Tag ${n}`}
      onClose={finish}
      wide
      initialFocus="input"
      footer={<Button variant="accent" onClick={finish} disabled={busy}>Done</Button>}
    >
      <form onSubmit={addTyped} className="mb-1 flex gap-2">
        <label className="sr-only" htmlFor={inputId}>New tag, or filter the list</label>
        <input
          id={inputId}
          value={text}
          onChange={e => { setText(e.target.value); setError(null) }}
          placeholder="Add a tag…"
          maxLength={MAX_TAG_LENGTH + 20}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          className={inputClass}
          data-testid="tag-sheet-input"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-4 text-[14px] font-semibold text-ink-on-accent transition disabled:opacity-45"
          style={{ background: 'var(--accent)' }}
        >
          <PlusIcon className="h-4 w-4" /> Add
        </button>
      </form>
      {error && <p role="alert" className="pb-1 text-[12.5px] text-[#ff8a8a]">{error}</p>}
      <p className="min-h-[1.5em] pb-1 text-[12.5px] text-white/50" role="status" aria-live="polite">{status}</p>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-white/45">
          {text.trim() ? 'Press Enter to add this new tag.' : 'No tags yet — type one above.'}
        </p>
      ) : (
        <ul className="space-y-0.5" aria-label="Tags">
          {rows.map(r => {
            const state: boolean | 'mixed' = r.on === 0 ? false : r.on === total ? true : 'mixed'
            const hint = state === 'mixed' ? `on ${r.on} of ${total}` : r.libraryCount > 0 ? formatCount(r.libraryCount, 'item') : ''
            return (
              <li key={tagKey(r.tag)}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={state}
                  disabled={busy}
                  onClick={() => toggle(r)}
                  className="flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition hover:bg-white/[0.07] disabled:opacity-60"
                >
                  <TriCheckIcon state={state} className={`h-5 w-5 shrink-0 ${state ? 'text-accent' : 'text-white/40'}`} />
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">{r.tag}</span>
                  {hint && <span className="shrink-0 text-[12px] text-white/45">{hint}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
