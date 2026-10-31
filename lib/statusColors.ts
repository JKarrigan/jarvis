import type { StatusColor } from './types'

/**
 * The single StatusColor → colour map. Every component that colours something
 * by status (cards, sparklines, charts, AQI chips, heat map) reads from here.
 *
 * All hex values have ≥ 3:1 contrast on the app background (zinc-950,
 * #09090b) so lines and swatches stay visible; hazardous is a bright crimson
 * (#e11d48, 4.2:1) rather than EPA maroon, which disappears on a dark UI.
 * Class names are written out in full so Tailwind can see them.
 */
export interface StatusStyle {
  /** SVG strokes/fills and inline styles */
  hex: string
  /** Short human label ("Very unhealthy") */
  label: string
  /** Large value text */
  textClass: string
  /** Card border */
  borderClass: string
  /** Pill / chip: background + text + border */
  badgeClass: string
  /** Solid swatch (dots, legends) */
  bgClass: string
}

export const STATUS_COLORS: Record<StatusColor, StatusStyle> = {
  good: {
    hex: '#34d399',
    label: 'Good',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-400/20',
    badgeClass: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    bgClass: 'bg-emerald-400',
  },
  moderate: {
    hex: '#facc15',
    label: 'Moderate',
    textClass: 'text-yellow-400',
    borderClass: 'border-yellow-400/20',
    badgeClass: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
    bgClass: 'bg-yellow-400',
  },
  sensitive: {
    hex: '#fb923c',
    label: 'Sensitive',
    textClass: 'text-orange-400',
    borderClass: 'border-orange-400/20',
    badgeClass: 'bg-orange-400/15 text-orange-300 border-orange-400/30',
    bgClass: 'bg-orange-400',
  },
  unhealthy: {
    hex: '#ef4444',
    label: 'Unhealthy',
    textClass: 'text-red-500',
    borderClass: 'border-red-500/20',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
    bgClass: 'bg-red-500',
  },
  'very-unhealthy': {
    hex: '#a855f7',
    label: 'Very unhealthy',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500/20',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    bgClass: 'bg-purple-500',
  },
  hazardous: {
    hex: '#e11d48',
    label: 'Hazardous',
    textClass: 'text-rose-500',
    borderClass: 'border-rose-500/40',
    badgeClass: 'bg-rose-600/20 text-rose-300 border-rose-500/50',
    bgClass: 'bg-rose-600',
  },
}

/** Colour for things that have no status (stale data, unknown). */
export const NEUTRAL_HEX = '#71717a'

export function statusHex(status: StatusColor): string {
  return STATUS_COLORS[status].hex
}
