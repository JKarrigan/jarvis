'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckIcon } from './icons'

export interface DropdownOption<T extends string> {
  value: T
  label: string
  /** Muted text after the label, e.g. a count. */
  hint?: string
}

export function FilterDropdown<T extends string>({
  label, value, options, onChange, searchable,
}: {
  label: string
  value: T
  options: DropdownOption<T>[]
  onChange: (v: T) => void
  /** Long lists (people) get a type-to-filter box at the top of the menu. */
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const active = options.find(o => o.value === value)
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? options.filter(o => o.label.toLowerCase().includes(needle)) : options
  }, [options, q])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setQ(''); setOpen(o => !o) }}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-white/5 px-3 py-1.5 text-[13px] text-ink backdrop-blur-md transition hover:bg-white/10"
      >
        <span className="text-white/45">{label}:</span>
        <span className="font-medium">{active?.label ?? value}</span>
        <svg className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5l5 5 5-5" /></svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12, ease: 'easeIn' } }}
            transition={{ type: 'spring', bounce: 0.2, duration: 0.28 }}
            className={`absolute left-0 top-full z-50 mt-2 flex max-h-[60vh] w-max flex-col ${searchable ? 'min-w-[240px]' : 'min-w-[180px]'} max-w-[calc(100vw-32px)] rounded-2xl border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl`}
            style={{ background: 'rgba(12,10,14,0.97)' }}
          >
            {searchable && (
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={`Find ${label.toLowerCase()}…`}
                className="mb-1 w-full shrink-0 rounded-lg bg-white/5 px-2.5 py-1.5 text-[13px] text-ink placeholder:text-white/35 focus:outline-none"
              />
            )}
            <div className="min-h-0 overflow-y-auto">
            {shown.length === 0 && <p className="px-2.5 py-2 text-[13px] text-white/45">No matches.</p>}
            {shown.map(o => {
              const sel = o.value === value
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ${sel ? 'text-ink' : 'text-white/70 hover:bg-white/5'}`}
                >
                  <span className="grid h-4 w-4 place-items-center">
                    {sel && <CheckIcon className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />}
                  </span>
                  <span className="whitespace-nowrap">{o.label}</span>
                  {o.hint && <span className="ml-auto pl-3 text-[12px] text-white/35">{o.hint}</span>}
                </button>
              )
            })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
