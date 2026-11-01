import type { SVGProps } from 'react'
import { kindMeta, type FileKind } from './fileKinds'

/** Documents-only icons, matching the media icon set (stroke, 20px viewBox). */

type IconProps = SVGProps<SVGSVGElement>

function base(props: IconProps) {
  return {
    width: 20,
    height: 20,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  }
}

export const FolderPlusIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M2.8 6.2A1.6 1.6 0 0 1 4.4 4.6h3.3l1.7 1.8h6.2a1.6 1.6 0 0 1 1.6 1.6v6.8a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V6.2Z" /><path d="M10 9v4.6M7.7 11.3h4.6" /></svg>
)
export const GridViewIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3.5" y="3.5" width="5" height="5" rx="1.2" /><rect x="11.5" y="3.5" width="5" height="5" rx="1.2" /><rect x="3.5" y="11.5" width="5" height="5" rx="1.2" /><rect x="11.5" y="11.5" width="5" height="5" rx="1.2" /></svg>
)
export const ListViewIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9" /><path d="M3.8 5.5h.01M3.8 10h.01M3.8 14.5h.01" strokeWidth={2.4} /></svg>
)
export const MoveIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M2.8 6.2A1.6 1.6 0 0 1 4.4 4.6h3.3l1.7 1.8h6.2a1.6 1.6 0 0 1 1.6 1.6v6.8a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6V6.2Z" /><path d="M7 11.4h6M11 9.2l2.2 2.2L11 13.6" /></svg>
)
export const OpenIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M11.5 3.5h5v5M16.5 3.5 9.5 10.5" /><path d="M14.5 11.5v3.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8V7.3a1.8 1.8 0 0 1 1.8-1.8h3.2" /></svg>
)
export const SortIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M6.5 4v12M3.8 6.7 6.5 4l2.7 2.7M13.5 16V4M10.8 13.3l2.7 2.7 2.7-2.7" /></svg>
)
export const ArrowUpIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9" /></svg>
)
export const ArrowDownIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 4.5v11M5.5 11l4.5 4.5 4.5-4.5" /></svg>
)
export const CopyIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="7" y="7" width="9.5" height="9.5" rx="1.8" /><path d="M13 7V5.3a1.8 1.8 0 0 0-1.8-1.8H5.3a1.8 1.8 0 0 0-1.8 1.8v5.9A1.8 1.8 0 0 0 5.3 13H7" /></svg>
)
export const RetryIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M16 10a6 6 0 1 1-1.8-4.3" /><path d="M16 3.8v3.4h-3.4" /></svg>
)
export const CheckIcon = (p: IconProps) => (
  <svg {...base({ strokeWidth: 2, ...p })}><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
)
export const AlertIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 3.2 17.4 16H2.6L10 3.2Z" /><path d="M10 8v3.6" /><path d="M10 13.9h.01" strokeWidth={2.2} /></svg>
)
export const ChevronSmallRight = (p: IconProps) => (
  <svg {...base(p)}><path d="m7.5 5 5 5-5 5" /></svg>
)

/** Big folder for tiles and the Move to… tree: back panel + front pocket in the theme accent. */
export function FolderGlyph({ className = '', open = false }: { className?: string; open?: boolean }) {
  return (
    <svg viewBox="0 0 64 52" className={className} aria-hidden="true">
      <path d="M3 8a5 5 0 0 1 5-5h14.5a4 4 0 0 1 3 1.4L29 8.5h27a5 5 0 0 1 5 5V44a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8Z" fill="var(--accent)" opacity="0.55" />
      <path
        d={open
          ? 'M7.5 19a4 4 0 0 1 4-3.6H60a3 3 0 0 1 3 3.4l-3.3 26.6a4 4 0 0 1-4 3.6H8a4 4 0 0 1-4-4.4L7.5 19Z'
          : 'M3 18.5a4 4 0 0 1 4-4h50a4 4 0 0 1 4 4V44a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V18.5Z'}
        fill="var(--accent)"
      />
      <path d="M3 18.5a4 4 0 0 1 4-4h50a4 4 0 0 1 4 4" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
    </svg>
  )
}

function KindGlyph({ kind, color }: { kind: FileKind; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'image':
      return (
        <g {...s}>
          <rect x="11" y="24" width="26" height="20" rx="3" />
          <circle cx="18.5" cy="30.5" r="2.4" />
          <path d="m12 41 8-7 5 4.5 4-3 7 5.5" />
        </g>
      )
    case 'video':
      return (
        <g>
          <rect x="11" y="24" width="26" height="20" rx="3.5" {...s} />
          <path d="M21 29.5v9a.8.8 0 0 0 1.2.7l7.2-4.5a.8.8 0 0 0 0-1.4l-7.2-4.5a.8.8 0 0 0-1.2.7Z" fill={color} />
        </g>
      )
    case 'audio':
      return (
        <g {...s}>
          <path d="M20 41V26.5l12-3V38" />
          <circle cx="17" cy="41" r="3" fill={color} />
          <circle cx="29" cy="38" r="3" fill={color} />
        </g>
      )
    default:
      return (
        <g {...s} stroke="rgba(255,255,255,0.32)" strokeWidth={2}>
          <path d="M14 27h20M14 33h20M14 39h13" />
        </g>
      )
  }
}

/**
 * Typed document icon: a page with a folded corner, colour-coded by kind — a coloured band
 * with the type ("PDF", "DOC", "XLS"…) for documents, a glyph for images, audio and video.
 */
export function FileGlyph({ kind, className = '' }: { kind: FileKind; className?: string }) {
  const { badge, tone } = kindMeta(kind)
  return (
    <svg viewBox="0 0 48 60" className={className} aria-hidden="true">
      <path d="M8 2h22l14 14v38a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" />
      <path d="M30 2v10a4 4 0 0 0 4 4h10" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" strokeLinejoin="round" />
      {badge ? (
        <>
          <g opacity="0.9"><path d="M11 25h18M11 30h22" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeLinecap="round" /></g>
          <rect x="4" y="38" width="40" height="13" rx="2.5" fill={tone} />
          <text x="24" y="47.6" textAnchor="middle" fontSize="9.5" fontWeight="800" letterSpacing="0.6" fill="#15101f" style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}>
            {badge}
          </text>
        </>
      ) : (
        <KindGlyph kind={kind} color={tone} />
      )}
    </svg>
  )
}
