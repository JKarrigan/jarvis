'use client'

import { useMedia } from './MediaProvider'
import { buildThemeStyle } from './themeTokens'

/**
 * Applies the active theme's CSS variables INLINE to the media subtree, so every
 * token reliably cascades to descendants and switching themes is instant.
 * `data-reel-theme` is kept for the display-font rule + any theme-conditional
 * styling. The responsive layout tokens come from the `.reel-root` rule in
 * globals.css (CSS media query → correct on the first server paint).
 */
export function MediaThemeRoot({ children }: { children: React.ReactNode }) {
  const { theme } = useMedia()
  return (
    <div className="reel-root" data-reel-theme={theme} style={buildThemeStyle(theme)}>
      {children}
    </div>
  )
}
