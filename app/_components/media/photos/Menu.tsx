'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * Glass popover menu (role=menu). Opens from a trigger; Esc / outside click close and
 * return focus to the trigger; ↑/↓ move between items.
 */
export function Menu({ label, trigger, children, align = 'right', triggerClassName = '' }: {
  label: string
  trigger: React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const el = root.current
    el?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onDown = (e: PointerEvent) => { if (el && !el.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(el?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLElement)
        const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]
        e.preventDefault()
        n?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(o => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            role="menu"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={`absolute top-[calc(100%+8px)] z-50 w-[280px] overflow-hidden rounded-[16px] border border-white/10 bg-[#141119]/95 p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const menuItemClass = 'flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14px] font-semibold text-white/85 outline-none transition hover:bg-white/[0.08] focus-visible:bg-white/[0.1] disabled:opacity-45'

export const toolbarBtn = 'inline-flex h-10 items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.06] px-3.5 text-[13.5px] font-semibold text-ink transition hover:bg-white/[0.12]'
