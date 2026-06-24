import type { SVGProps } from 'react'

/** Shared inline icon set for the media UI (stroke icons sized 1em, 20px viewBox). */

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
    ...props,
  }
}

export const HomeIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3v-5H7v5H4a1 1 0 0 1-1-1V9.5Z" /></svg>
)
export const FilmIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="4" width="14" height="12" rx="1.6" /><path d="M3 8h14M3 12h14M7 4v12M13 4v12" /></svg>
)
export const TvIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="6" width="14" height="9" rx="1.6" /><path d="M7 3l3 3 3-3" /></svg>
)
export const HeartIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 16s-6-3.6-6-7.6A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 6 2.4C16 12.4 10 16 10 16Z" /></svg>
)
export const CollectionsIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="4" width="6" height="12" rx="1.2" /><rect x="11" y="4" width="6" height="8" rx="1.2" /><path d="M11 15h6" /></svg>
)
export const DieIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3.5" y="3.5" width="13" height="13" rx="3" /><circle cx="7" cy="7" r="0.9" fill="currentColor" stroke="none" /><circle cx="13" cy="13" r="0.9" fill="currentColor" stroke="none" /><circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" /></svg>
)
export const ListIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M7 5h10M7 10h10M7 15h10M3.5 5h.01M3.5 10h.01M3.5 15h.01" /></svg>
)
export const GearIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="10" cy="10" r="2.4" /><path d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4" /></svg>
)
export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="9" cy="9" r="5" /><path d="m16 16-3-3" /></svg>
)
export const PlayIcon = (p: IconProps) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}><path d="M7 5.5v9a.6.6 0 0 0 .92.5l7-4.5a.6.6 0 0 0 0-1l-7-4.5A.6.6 0 0 0 7 5.5Z" /></svg>
)
export const StarIcon = (p: IconProps) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}><path d="m10 2.6 2.1 4.6 5 .5-3.7 3.4 1 4.9L10 14.9 5.6 16.4l1-4.9L2.9 7.7l5-.5L10 2.6Z" /></svg>
)
export const CheckIcon = (p: IconProps) => (
  <svg {...base({ strokeWidth: 2, ...p })}><path d="M4.5 10.5 8 14l7.5-8" /></svg>
)
export const PlusIcon = (p: IconProps) => (
  <svg {...base({ strokeWidth: 1.8, ...p })}><path d="M10 4v12M4 10h12" /></svg>
)
export const BookmarkIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 3.5h10v13l-5-3-5 3v-13Z" /></svg>
)
export const ChevronRightIcon = (p: IconProps) => (
  <svg {...base({ strokeWidth: 1.8, ...p })}><path d="m7.5 4 5 6-5 6" /></svg>
)
export const ChevronLeftIcon = (p: IconProps) => (
  <svg {...base({ strokeWidth: 1.8, ...p })}><path d="m12.5 4-5 6 5 6" /></svg>
)
export const ThumbUpIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M6 9v7H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h2Zm0 0 3-5.5a1.6 1.6 0 0 1 2.3 2l-.8 3h4a1.4 1.4 0 0 1 1.4 1.7l-1 4.4a1.6 1.6 0 0 1-1.6 1.4H6" /></svg>
)
export const ThumbDownIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M14 11V4h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2Zm0 0-3 5.5a1.6 1.6 0 0 1-2.3-2l.8-3h-4a1.4 1.4 0 0 1-1.4-1.7l1-4.4A1.6 1.6 0 0 1 4.7 4H14" /></svg>
)
export const CloseIcon = (p: IconProps) => (
  <svg {...base({ strokeWidth: 1.8, ...p })}><path d="M5 5l10 10M15 5 5 15" /></svg>
)
export const TrailerIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="10" cy="10" r="7" /><path d="M8.5 7.5v5l4-2.5-4-2.5Z" fill="currentColor" stroke="none" /></svg>
)
