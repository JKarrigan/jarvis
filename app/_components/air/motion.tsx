'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Spinner } from './ui'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'

/**
 * Motion shared by the Home (air) pages, next to the server-safe `ui.tsx`.
 * Everything here is opacity only: pages render `position: fixed` dialogs and
 * toasts inside themselves, and a transformed ancestor would re-anchor them.
 */

export const EASE = [0.2, 0.7, 0.2, 1] as const
const FADE = { duration: 0.25, ease: EASE }

/**
 * The page-transition key for a Home path. Pages of one detail template share a
 * key, so moving between them (CO₂ to PM2.5, one event to the next) leaves the
 * page in place and lets it animate its own content.
 */
export function pageKey(pathname: string): string {
  if (pathname.startsWith('/measurement/')) return '/measurement/*'
  if (pathname.startsWith('/events/')) return '/events/*'
  return pathname
}

/** Fades each Home page in on navigation. Mounted around `{children}` only, in `app/(air)/layout.tsx`. */
export function AirPageTransition({ children }: { children: React.ReactNode }) {
  const key = pageKey(usePathname())
  return (
    <motion.div key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28, ease: EASE }}>
      {children}
    </motion.div>
  )
}

/**
 * Fades its children in when it mounts. Give it a `key` per state (loading,
 * ready, error) and the swap from one to the next fades instead of snapping; the
 * old state goes at once, so nothing waits for an animation.
 */
export function FadeIn({ children, className, from = 0 }: {
  children: React.ReactNode
  className?: string
  /** Starting opacity: content replacing a dimmed version of itself starts from there. */
  from?: number
}) {
  return (
    <motion.div className={className} initial={{ opacity: from }} animate={{ opacity: 1 }} transition={FADE}>
      {children}
    </motion.div>
  )
}

/**
 * Cross-fades between children with different `id`s in one grid cell, so the box
 * never collapses between the two. Give both states the same size (for example a
 * placeholder shaped like the content) and nothing below it moves.
 */
export function Crossfade({ id, children, className = '' }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid ${className}`}>
      <AnimatePresence initial={false}>
        <motion.div
          key={id}
          className="col-start-1 row-start-1 min-w-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FADE}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/**
 * A number that counts from its previous value to a new one (about 400 ms),
 * formatted on every frame. It jumps when the user prefers reduced motion, and
 * when either end is missing. The text is written by a motion value, so counting
 * does not re-render the page.
 */
export function TweenNumber({ value, format, className }: {
  value: number
  format: (v: number) => string
  className?: string
}) {
  const reduce = useReducedMotion()
  const current = useMotionValue(value)
  const text = useTransform(current, format)
  useEffect(() => {
    const from = current.get()
    if (reduce || from === value || !Number.isFinite(from) || !Number.isFinite(value)) {
      current.jump(value)
      return
    }
    const controls = animate(current, value, { duration: 0.4, ease: EASE })
    return () => controls.stop()
  }, [current, value, reduce])
  return <motion.span className={className}>{text}</motion.span>
}

/**
 * The small spinner beside a control while it loads. Its 16px slot is always
 * there, so showing it never reflows the row.
 */
export function LoadingMark({ loading }: { loading: boolean }) {
  return (
    <span className="flex h-4 w-4 shrink-0">
      <AnimatePresence>
        {loading && (
          <motion.span key="spinner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <Spinner className="h-4 w-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
