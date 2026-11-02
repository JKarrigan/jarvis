'use client'

import { Fragment } from 'react'
import { Menu, menuItemClass } from '../photos/Menu'
import { CloseIcon } from '../photos/icons'
import { SearchIcon } from '../icons'
import { DROP_ATTR } from './dnd'
import { SORT_OPTIONS, type Sort, type SortField } from './selection'
import type { Crumb } from './useDocumentsBrowser'
import type { ViewMode } from './hooks'
import { ArrowDownIcon, ArrowUpIcon, ChevronSmallRight, CheckIcon, GridViewIcon, ListViewIcon, SortIcon } from './icons'

/** Documents › Taxes › 2025 — every crumb opens its folder and takes drops (items to move, files to upload). */
export function Breadcrumbs({ crumbs, over, onOpen }: { crumbs: Crumb[]; over: string | null; onOpen: (path: string) => void }) {
  // Phones keep the last two crumbs; "…" steps up to the hidden parent.
  const collapse = crumbs.length > 3
  const hiddenParent = collapse ? crumbs[crumbs.length - 3] : null
  return (
    <nav aria-label="Folder path" className="flex min-w-0 items-center gap-0.5">
      {crumbs.map((c, i) => {
        const current = i === crumbs.length - 1
        const hideOnPhone = collapse && i < crumbs.length - 2
        return (
          <Fragment key={c.path || '/'}>
            {i > 0 && <ChevronSmallRight className={`h-3.5 w-3.5 shrink-0 text-white/30 ${hideOnPhone ? 'hidden md:block' : ''}`} />}
            {collapse && i === crumbs.length - 2 && hiddenParent && (
              <>
                <button
                  type="button"
                  onClick={() => onOpen(hiddenParent.path)}
                  aria-label={`Up to ${hiddenParent.name}`}
                  {...{ [DROP_ATTR]: hiddenParent.path }}
                  className="rounded-[8px] px-1.5 py-1 text-[14px] text-white/55 hover:text-white md:hidden"
                >
                  …
                </button>
                <ChevronSmallRight className="h-3.5 w-3.5 shrink-0 text-white/30 md:hidden" />
              </>
            )}
            <button
              type="button"
              onClick={() => onOpen(c.path)}
              aria-current={current ? 'page' : undefined}
              {...{ [DROP_ATTR]: c.path }}
              className={`min-w-0 max-w-[200px] truncate rounded-[8px] px-2 py-1 text-[14px] outline-none transition focus-visible:ring-2 focus-visible:ring-white/40 ${
                over === c.path ? 'bg-[var(--accent)]/20 text-ink ring-2 ring-[var(--accent)]' : current ? 'font-bold text-ink' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
              } ${hideOnPhone ? 'hidden md:block' : ''}`}
            >
              {c.name}
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}

export function SearchField({ value, onChange, loading }: { value: string; onChange: (v: string) => void; loading: boolean }) {
  return (
    <div className="relative min-w-0 flex-1 md:w-[260px] md:flex-none">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape' && value) { e.preventDefault(); e.stopPropagation(); onChange('') } }}
        placeholder="Search"
        aria-label="Search all documents"
        autoComplete="off"
        spellCheck={false}
        className="h-10 w-full rounded-[12px] border border-white/10 bg-white/[0.06] pl-9 pr-9 text-[14px] text-ink outline-none transition placeholder:text-white/40 focus:border-[var(--accent)] [&::-webkit-search-cancel-button]:hidden"
      />
      {loading ? (
        <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-white/70" aria-label="Searching" />
      ) : value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-white/55 hover:bg-white/10 hover:text-white">
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

const ctl = 'grid h-10 w-10 place-items-center rounded-[12px] border border-white/10 bg-white/[0.06] text-ink transition hover:bg-white/[0.12]'

export function SortMenu({ sort, onField, onDir }: { sort: Sort; onField: (f: SortField) => void; onDir: (d: 'asc' | 'desc') => void }) {
  const label = SORT_OPTIONS.find(o => o.value === sort.field)?.label ?? 'Name'
  return (
    <Menu
      label={`Sort: ${label}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`}
      trigger={<SortIcon className="h-[18px] w-[18px]" />}
      triggerClassName={ctl}
    >
      {close => (
        <>
          <p className="px-3 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40">Sort by</p>
          {SORT_OPTIONS.map(o => (
            <button key={o.value} type="button" role="menuitem" className={menuItemClass} onClick={() => { onField(o.value); close() }}>
              <span className="flex-1">{o.label}</span>
              {sort.field === o.value && <><CheckIcon className="h-4 w-4 text-accent" /><span className="sr-only">(current)</span></>}
            </button>
          ))}
          <div className="mx-2 my-1 h-px bg-white/[0.08]" />
          {(['asc', 'desc'] as const).map(d => (
            <button key={d} type="button" role="menuitem" className={menuItemClass} onClick={() => { onDir(d); close() }}>
              {d === 'asc' ? <ArrowUpIcon className="h-4 w-4 text-white/55" /> : <ArrowDownIcon className="h-4 w-4 text-white/55" />}
              <span className="flex-1">{dirLabel(sort.field, d)}</span>
              {sort.dir === d && <><CheckIcon className="h-4 w-4 text-accent" /><span className="sr-only">(current)</span></>}
            </button>
          ))}
        </>
      )}
    </Menu>
  )
}

function dirLabel(field: SortField, dir: 'asc' | 'desc'): string {
  if (field === 'modified') return dir === 'asc' ? 'Oldest first' : 'Newest first'
  if (field === 'size') return dir === 'asc' ? 'Smallest first' : 'Largest first'
  return dir === 'asc' ? 'A to Z' : 'Z to A'
}

export function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const btn = (v: ViewMode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      aria-pressed={view === v}
      aria-label={label}
      title={label}
      onClick={() => onChange(v)}
      className={`grid h-8 w-9 place-items-center rounded-[9px] transition ${view === v ? 'bg-white/[0.14] text-ink' : 'text-white/55 hover:text-white'}`}
    >
      {icon}
    </button>
  )
  return (
    <div role="group" aria-label="View" className="flex h-10 items-center gap-0.5 rounded-[12px] border border-white/10 bg-white/[0.06] px-1">
      {btn('grid', 'Grid view', <GridViewIcon className="h-[18px] w-[18px]" />)}
      {btn('list', 'List view', <ListViewIcon className="h-[18px] w-[18px]" />)}
    </div>
  )
}

/** Enters selection mode with nothing selected (pressed while selecting; pressing again is Done). */
export function SelectButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`inline-flex h-10 shrink-0 items-center rounded-[12px] border px-3.5 text-[13.5px] font-semibold transition ${
        active ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-ink' : 'border-white/10 bg-white/[0.06] text-ink hover:bg-white/[0.12]'
      }`}
    >
      {active ? 'Done' : 'Select'}
    </button>
  )
}
