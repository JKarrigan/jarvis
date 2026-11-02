import type { SVGProps } from 'react'

/** PDF reader toolbar icons, matching the media icon set (stroke, 20px viewBox). */

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

export const ZoomInIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="8.8" cy="8.8" r="5.3" /><path d="m12.8 12.8 3.7 3.7M6.6 8.8h4.4M8.8 6.6v4.4" /></svg>
)
export const ZoomOutIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="8.8" cy="8.8" r="5.3" /><path d="m12.8 12.8 3.7 3.7M6.6 8.8h4.4" /></svg>
)
export const FindIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="8.8" cy="8.8" r="5.3" /><path d="m12.8 12.8 3.7 3.7" /></svg>
)
export const RotateIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M15.5 9.5a5.7 5.7 0 1 1-1.9-4.3" /><path d="M15.6 3.6v3.3h-3.3" /></svg>
)
export const PrintIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M5.8 7.5V3.6h8.4v3.9" /><rect x="3.2" y="7.5" width="13.6" height="6.4" rx="1.6" /><path d="M5.8 11.8h8.4v4.6H5.8z" /></svg>
)
export const SidebarIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12" /></svg>
)
export const ChevronUpSmall = (p: IconProps) => (
  <svg {...base(p)}><path d="m5.5 12 4.5-4.5 4.5 4.5" /></svg>
)
export const ChevronDownSmall = (p: IconProps) => (
  <svg {...base(p)}><path d="m5.5 8 4.5 4.5L14.5 8" /></svg>
)
export const MoreDotsIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 10h.01M10 10h.01M15 10h.01" strokeWidth={2.6} /></svg>
)
export const FitWidthIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="4" y="3.5" width="12" height="13" rx="1.6" /><path d="M2 10h3M15 10h3M3.5 8.5 2 10l1.5 1.5M16.5 8.5 18 10l-1.5 1.5" /></svg>
)
export const FitPageIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="5" y="3" width="10" height="14" rx="1.6" /><path d="M8 7h4M8 10h4M8 13h2.5" /></svg>
)
