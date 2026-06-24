'use client'

import { useSyncExternalStore } from 'react'
import { useMedia } from './MediaProvider'
import { buildThemeStyle } from './themeTokens'

const MOBILE_QUERY = '(max-width: 760px)'

/** SSR-safe breakpoint hook (no setState-in-effect). Server snapshot = desktop. */
function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(MOBILE_QUERY)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}

/**
 * Applies the active theme's CSS variables INLINE to the media subtree, so every
 * token reliably cascades to descendants (attribute-selector CSS proved unreliable
 * here) and switching themes is instant. `data-reel-theme` is kept for the display-
 * font rule + any theme-conditional styling. Scoped to media → air app untouched.
 */
export function MediaThemeRoot({ children }: { children: React.ReactNode }) {
  const { theme } = useMedia()
  const isMobile = useIsMobile()
  return (
    <div className="reel-root" data-reel-theme={theme} style={buildThemeStyle(theme, isMobile)}>
      {children}
    </div>
  )
}
