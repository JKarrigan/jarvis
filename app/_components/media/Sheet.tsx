'use client'

import { useRef } from 'react'
import { motion } from 'framer-motion'
import { useDialog, useIsMobile } from './hooks'

/**
 * The media app's modal sheet: a bottom drawer on phones, a centred card from `md`
 * up. A real dialog — role="dialog", aria-modal, focus moved inside and trapped,
 * Escape closes (top-most layer only), focus restored on close. The parent owns the
 * surrounding <AnimatePresence>.
 */
export function Sheet({
  onClose, wide, label, children,
}: {
  onClose: () => void
  wide?: boolean
  /** Accessible name for the dialog (usually its heading text). */
  label?: string
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  const ref = useRef<HTMLDivElement>(null)
  useDialog(ref, onClose)

  const backdrop = (
    <motion.div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={onClose}
    />
  )

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col justify-end">
        {backdrop}
        <motion.div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="relative z-[90] max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border-t border-zinc-700 bg-zinc-900 pb-[env(safe-area-inset-bottom)] shadow-2xl"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%', transition: { duration: 0.28, ease: [0.32, 0, 0.67, 0] } }}
          transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
        >
          <div className="flex justify-center pb-1 pt-3" aria-hidden="true">
            <div className="h-1 w-10 rounded-full bg-zinc-700" />
          </div>
          {children}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      {backdrop}
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`relative z-[90] w-full ${wide ? 'max-w-md' : 'max-w-sm'} max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18, ease: [0.32, 0, 0.67, 0] } }}
        transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
      >
        {children}
      </motion.div>
    </div>
  )
}
