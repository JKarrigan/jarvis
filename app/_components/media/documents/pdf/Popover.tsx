'use client'

import { useEffect, useId, useRef, useState } from 'react'

/**
 * A small menu (role=menu) for the PDF toolbar, rendered in place (the viewer sits above
 * the app's portalled menus). Opens downwards from the desktop toolbar and upwards from
 * the phone's bottom bar. Focus moves to the first item; ↑/↓ move; Escape (which wins
 * over the viewer's own Escape), an outside press or picking an item closes it and
 * focus returns to the trigger.
 */
export function Popover({ label, trigger, triggerClassName, title, placement = 'down', align = 'right', width = 200, children }: {
  label: string
  trigger: React.ReactNode
  triggerClassName: string
  title?: string
  placement?: 'down' | 'up'
  align?: 'left' | 'right'
  width?: number
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const el = root.current
    el?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')?.focus()
    const onDown = (e: PointerEvent) => { if (el && !el.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(el?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLElement)
        e.preventDefault()
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    const trigger = btn.current
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      // Back to the trigger, unless the chosen action moved focus elsewhere (e.g. the find field).
      const active = document.activeElement
      if ((!active || active === document.body || (el && el.contains(active))) && trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={root} className="relative">
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(o => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          style={{ width }}
          className={`absolute z-30 max-h-[min(70vh,440px)] overflow-y-auto rounded-[14px] border border-white/10 bg-[#17131d]/95 p-1.5 text-ink shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
            placement === 'down' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+8px)]'
          } ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

export const popItem = 'flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[13.5px] font-semibold text-white/85 outline-none transition hover:bg-white/[0.08] focus-visible:bg-white/[0.1] disabled:opacity-40'
