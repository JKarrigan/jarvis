'use client'

import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'

/**
 * Fades page content in on every navigation (page-to-page and season-to-season,
 * since both are route changes — the pathname key remounts this on each).
 * Opacity-only on purpose: a transform here would re-anchor `position: fixed`
 * descendants (player modal, Back pill, picker swipe) to this element.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}
