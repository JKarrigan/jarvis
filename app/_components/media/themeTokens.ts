import type { CSSProperties } from 'react'
import type { ThemeName } from './MediaProvider'

interface ThemeTokens {
  accent: string
  accentSoft: string
  surface: string
  surface2: string
  border: string
  glow: string
  bg: string
}

export const THEME_TOKENS: Record<ThemeName, ThemeTokens> = {
  ember: {
    accent: '#e0a872', accentSoft: '#f2cea0',
    surface: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,235,210,0.09)', glow: 'rgba(224,168,114,0.40)',
    bg: 'radial-gradient(135% 130% at 96% 100%, rgba(224,168,114,0.15), transparent 60%), radial-gradient(80% 75% at 6% 10%, rgba(196,116,78,0.06), transparent 58%), linear-gradient(150deg,#14110c,#100c07 55%,#0b0805)',
  },
  aurora: {
    accent: '#c08af0', accentSoft: '#d9b6f7',
    surface: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.08)', glow: 'rgba(192,138,240,0.38)',
    bg: 'radial-gradient(135% 130% at 96% 100%, rgba(168,108,224,0.17), transparent 60%), radial-gradient(80% 75% at 6% 10%, rgba(96,110,212,0.07), transparent 58%), linear-gradient(150deg,#0f0c18,#0a0810 55%,#08060d)',
  },
  sage: {
    accent: '#86cfa6', accentSoft: '#b3e3cb',
    surface: 'rgba(255,255,255,0.04)', surface2: 'rgba(255,255,255,0.06)',
    border: 'rgba(210,245,225,0.09)', glow: 'rgba(134,207,166,0.34)',
    bg: 'radial-gradient(135% 130% at 96% 100%, rgba(110,200,150,0.12), transparent 60%), radial-gradient(80% 75% at 6% 10%, rgba(80,150,140,0.06), transparent 58%), linear-gradient(150deg,#0c1511,#08110c 55%,#060e09)',
  },
  midnight: {
    accent: '#8ea6ff', accentSoft: '#b9c6ff',
    surface: 'rgba(255,255,255,0.045)', surface2: 'rgba(255,255,255,0.07)',
    border: 'rgba(150,170,255,0.12)', glow: 'rgba(120,140,255,0.40)',
    bg: 'radial-gradient(135% 130% at 96% 100%, rgba(90,110,230,0.20), transparent 60%), radial-gradient(85% 78% at 6% 10%, rgba(150,90,230,0.09), transparent 58%), linear-gradient(150deg,#0a0d1d,#070914 58%,#05060f)',
  },
  noir: {
    accent: '#b9b4d6', accentSoft: '#d6d2ea',
    surface: 'rgba(255,255,255,0.05)', surface2: 'rgba(255,255,255,0.08)',
    border: 'rgba(255,255,255,0.11)', glow: 'rgba(185,180,214,0.22)',
    bg: 'radial-gradient(130% 125% at 96% 100%, rgba(120,116,150,0.12), transparent 60%), linear-gradient(150deg,#111016,#0c0c10 58%,#090909)',
  },
}

/**
 * The full CSS-variable set applied inline to the media root, so every token
 * reliably cascades (no dependency on attribute-selector matching) and theme
 * switching is instant. Layout tokens flip at the 760px breakpoint via isMobile.
 */
export function buildThemeStyle(theme: ThemeName, isMobile: boolean): CSSProperties {
  const t = THEME_TOKENS[theme]
  return {
    '--accent': t.accent,
    '--accent-soft': t.accentSoft,
    '--surface': t.surface,
    '--surface-2': t.surface2,
    '--border': t.border,
    '--glow': t.glow,
    '--bg-gradient': t.bg,
    // theme-independent neutrals
    '--ink': '#f3eff8',
    '--ink-on-accent': '#15101f',
    '--star': '#f0c25a',
    '--positive': '#7fd8a8',
    '--fav': '#ff7aa0',
    '--pass': '#ff7a7a',
    // responsive layout tokens
    '--rail': isMobile ? '16px' : '96px',
    '--gx': isMobile ? '16px' : '56px',
    '--navpad': isMobile ? '86px' : '0px',
    '--grid-min': isMobile ? '150px' : '206px',
    background: 'var(--bg-gradient)',
    backgroundAttachment: 'fixed',
    color: 'var(--ink)',
    minHeight: '100vh',
    fontFamily: 'var(--font-manrope), system-ui, sans-serif',
  } as CSSProperties
}
