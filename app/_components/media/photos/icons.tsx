import type { SVGProps } from 'react'

/** Photos-only icons, matching the media icon set (stroke, 20px viewBox, 1em-ish). */

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

export const CameraIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 7.2A1.7 1.7 0 0 1 4.7 5.5h1.8l1.2-1.8h4.6l1.2 1.8h1.8A1.7 1.7 0 0 1 17 7.2v7.1A1.7 1.7 0 0 1 15.3 16H4.7A1.7 1.7 0 0 1 3 14.3V7.2Z" /><circle cx="10" cy="10.6" r="2.9" /></svg>
)
export const GridIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="3" width="6" height="6" rx="1.2" /><rect x="11" y="3" width="6" height="6" rx="1.2" /><rect x="3" y="11" width="6" height="6" rx="1.2" /><rect x="11" y="11" width="6" height="6" rx="1.2" /></svg>
)
export const AlbumIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="5" width="12" height="11" rx="1.6" /><path d="M6 3h9.4A1.6 1.6 0 0 1 17 4.6V13" /><path d="m3.5 14 3.6-3.6 2.6 2.6 1.8-1.8 3 3" /></svg>
)
export const UploadIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 13V3.5M6 7.2l4-3.7 4 3.7" /><path d="M3.5 12.5v2.3a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7v-2.3" /></svg>
)
export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 6h12M8 6V4.5h4V6M5.5 6l.7 9.6a1.2 1.2 0 0 0 1.2 1.1h5.2a1.2 1.2 0 0 0 1.2-1.1L14.5 6M8.5 9v4.5M11.5 9v4.5" /></svg>
)
export const RestoreIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 10a6 6 0 1 0 1.8-4.3" /><path d="M4 3.8v3.4h3.4" /><path d="M10 7v3.3l2.2 1.4" /></svg>
)
export const InfoIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="10" cy="10" r="7" /><path d="M10 9v4.5" /><path d="M10 6.4h.01" strokeWidth={2.2} /></svg>
)
export const DownloadIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 3.5V13M6 9.3l4 3.7 4-3.7" /><path d="M3.5 13.5v1.3a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7v-1.3" /></svg>
)
export const ZoomIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="9" cy="9" r="5" /><path d="m16 16-3-3M9 6.8v4.4M6.8 9h4.4" /></svg>
)
export const CheckboxIcon = ({ checked, ...p }: IconProps & { checked?: boolean }) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="13" height="13" rx="3.2" fill={checked ? 'currentColor' : 'none'} />
    {checked && <path d="m6.6 10.2 2.3 2.3 4.6-5" stroke="var(--ink-on-accent, #15101f)" strokeWidth={2} />}
  </svg>
)
/** Tri-state: `checked` true / false / 'mixed' (a dash, for "some of the selection"). */
export const TriCheckIcon = ({ state, ...p }: IconProps & { state: boolean | 'mixed' }) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="13" height="13" rx="3.2" fill={state ? 'currentColor' : 'none'} />
    {state === true && <path d="m6.6 10.2 2.3 2.3 4.6-5" stroke="var(--ink-on-accent, #15101f)" strokeWidth={2} />}
    {state === 'mixed' && <path d="M6.8 10h6.4" stroke="var(--ink-on-accent, #15101f)" strokeWidth={2} />}
  </svg>
)
export const TagIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 4.6v4.6c0 .42.17.83.47 1.13l6.2 6.2a1.6 1.6 0 0 0 2.26 0l4.6-4.6a1.6 1.6 0 0 0 0-2.26l-6.2-6.2A1.6 1.6 0 0 0 9.2 3H4.6A1.6 1.6 0 0 0 3 4.6Z" /><circle cx="6.8" cy="6.8" r="1.1" /></svg>
)
export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m5.5 8 4.5 4.5L14.5 8" /></svg>
)
export const MoreIcon = (p: IconProps) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}><circle cx="4.5" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="15.5" cy="10" r="1.5" /></svg>
)
export const HeartIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 16s-6-3.6-6-7.6A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 6 2.4C16 12.4 10 16 10 16Z" /></svg>
)
export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 5l10 10M15 5 5 15" /></svg>
)
export const ChevronLeftIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m12 4.5-5.5 5.5 5.5 5.5" /></svg>
)
export const ChevronRightIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m8 4.5 5.5 5.5L8 15.5" /></svg>
)
export const PlayGlyph = (p: IconProps) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}><path d="M7 5.5v9a.6.6 0 0 0 .92.5l7-4.5a.6.6 0 0 0 0-1l-7-4.5A.6.6 0 0 0 7 5.5Z" /></svg>
)
export const PlusIcon = (p: IconProps) => (
  <svg {...base({ strokeWidth: 1.8, ...p })}><path d="M10 4v12M4 10h12" /></svg>
)
export const PencilIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12.8 4.2a1.7 1.7 0 0 1 2.4 2.4L7 14.8 4 15.6l.8-3 8-8.4Z" /></svg>
)
export const RemoveIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="10" cy="10" r="7" /><path d="M6.8 10h6.4" /></svg>
)
export const ScanIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M16 10a6 6 0 0 1-10.4 4.1M4 10a6 6 0 0 1 10.4-4.1" /><path d="M14.6 3v3h-3M5.4 17v-3h3" /></svg>
)
export const CoverIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="4" width="14" height="12" rx="1.8" /><path d="m3.6 14 4-4 3 3 2-2 3.8 3.8" /><circle cx="13" cy="7.6" r="1.2" /></svg>
)
export const OfflineIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 3l14 14" /><path d="M5.6 7.4A4.5 4.5 0 0 0 5.5 16h8.7M9 5.6A5 5 0 0 1 15 9a3.5 3.5 0 0 1 1.9 5.5" /></svg>
)
export const MapPinIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 17s5-4.6 5-8.6a5 5 0 1 0-10 0C5 12.4 10 17 10 17Z" /><circle cx="10" cy="8.5" r="1.8" /></svg>
)
