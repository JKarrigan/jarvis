'use client'

import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { DocItem } from './api'
import { CheckboxIcon, DownloadIcon, PencilIcon, TrashIcon, UploadIcon } from '../photos/icons'
import { FolderPlusIcon, MoveIcon, OpenIcon } from './icons'

export interface Action {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  danger?: boolean
  separatorBefore?: boolean
  disabled?: boolean
}

export interface ActionHandlers {
  /** Enters selection mode with this item selected. */
  select: (item: DocItem) => void
  open: (item: DocItem) => void
  download: (item: DocItem) => void
  rename: (item: DocItem) => void
  move: (items: DocItem[]) => void
  remove: (items: DocItem[]) => void
  newFolder: () => void
  upload: () => void
}

const ic = 'h-[18px] w-[18px] text-white/55'

/**
 * The one action list behind the right-click menu and the ⋯ button (GuardianPad's
 * buildItemActions): Select, Open, Download, Rename, Move to…, Delete. Several items
 * (right-click on a selected item in selection mode) = Move / Delete for all of them.
 * No items = the blank area (New Folder / Upload).
 */
export function buildActions(items: DocItem[], readOnly: boolean, h: ActionHandlers): Action[] {
  const write = !readOnly
  if (items.length === 0) {
    if (!write) return []
    return [
      { label: 'New Folder', icon: <FolderPlusIcon className={ic} />, onSelect: h.newFolder },
      { label: 'Upload files…', icon: <UploadIcon className={ic} />, onSelect: h.upload },
    ]
  }
  if (items.length > 1) {
    if (!write) return []
    const n = items.length
    return [
      { label: `Move ${n} items to…`, icon: <MoveIcon className={ic} />, onSelect: () => h.move(items) },
      { label: `Delete ${n} items…`, icon: <TrashIcon className="h-[18px] w-[18px]" />, danger: true, separatorBefore: true, onSelect: () => h.remove(items) },
    ]
  }
  const [item] = items
  return [
    { label: 'Select', icon: <CheckboxIcon className={ic} />, onSelect: () => h.select(item) },
    { label: 'Open', icon: <OpenIcon className={ic} />, onSelect: () => h.open(item) },
    ...(!item.isDir ? [{ label: 'Download', icon: <DownloadIcon className={ic} />, onSelect: () => h.download(item) }] : []),
    ...(write ? [
      { label: 'Rename', icon: <PencilIcon className={ic} />, onSelect: () => h.rename(item) },
      { label: 'Move to…', icon: <MoveIcon className={ic} />, onSelect: () => h.move([item]) },
      { label: 'Delete…', icon: <TrashIcon className="h-[18px] w-[18px]" />, danger: true, separatorBefore: true, onSelect: () => h.remove([item]) },
    ] : []),
  ]
}

const EDGE = 8

/**
 * A glass popup menu (role=menu) at a point or under an anchor element, kept inside the
 * viewport. Focus moves to the first item; ↑/↓/Home/End move; Esc, Tab, an outside
 * press, scroll or resize close it and focus returns to where it was (unless an action
 * moved it, e.g. into a rename input).
 */
export function ActionMenu({ actions, at, label, onClose }: {
  actions: Action[]
  at: { x: number; y: number } | HTMLElement
  label: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  // Position before paint: measure, then clamp to the viewport (DOM write, no state).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    let x: number
    let y: number
    if (at instanceof HTMLElement) {
      const a = at.getBoundingClientRect()
      x = a.right - r.width
      y = a.bottom + 6
      if (y + r.height > vh - EDGE) y = a.top - r.height - 6
    } else {
      x = at.x
      y = at.y
      if (y + r.height > vh - EDGE) y = at.y - r.height
    }
    el.style.left = `${Math.max(EDGE, Math.min(x, vw - r.width - EDGE))}px`
    el.style.top = `${Math.max(EDGE, Math.min(y, vh - r.height - EDGE))}px`
    el.style.visibility = 'visible'
  }, [at])

  useEffect(() => {
    const el = ref.current
    const previous = document.activeElement as HTMLElement | null
    el?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true })
    const close = () => closeRef.current()
    const onDown = (e: PointerEvent) => { if (el && !el.contains(e.target as Node)) close() }
    const onScroll = (e: Event) => { if (el && !el.contains(e.target as Node)) close() }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      // Restore focus only if it is still in the (now gone) menu or on the body.
      const active = document.activeElement
      if ((!active || active === document.body || (el && el.contains(active))) && previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus() }
    switch (e.key) {
      case 'Escape': e.preventDefault(); onClose(); break
      case 'Tab': e.preventDefault(); onClose(); break
      case 'ArrowDown': go(i + 1); break
      case 'ArrowUp': go(i - 1); break
      case 'Home': go(0); break
      case 'End': go(items.length - 1); break
    }
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={e => e.preventDefault()}
      style={{ left: 0, top: 0, visibility: 'hidden', fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}
      className="fixed z-[70] w-[230px] rounded-[14px] border border-white/10 bg-[#17131d]/95 p-1.5 text-ink shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl"
    >
      {actions.map(a => (
        <Fragment key={a.label}>
          {a.separatorBefore && <div role="separator" className="mx-2 my-1 h-px bg-white/[0.08]" />}
          <button
            type="button"
            role="menuitem"
            disabled={a.disabled}
            onClick={() => { onClose(); a.onSelect() }}
            className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[13.5px] font-semibold outline-none transition disabled:opacity-40 ${
              a.danger ? 'text-[#ff8a8a] hover:bg-[#ff6b6b]/12 focus-visible:bg-[#ff6b6b]/15' : 'text-white/85 hover:bg-white/[0.08] focus-visible:bg-white/[0.1]'
            }`}
          >
            {a.icon}
            {a.label}
          </button>
        </Fragment>
      ))}
    </div>,
    // Inside the media root so the theme's CSS variables still apply.
    document.querySelector('.reel-root') ?? document.body,
  )
}
