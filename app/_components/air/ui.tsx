import Link from 'next/link'
import type { StatusColor } from '@/lib/types'
import { STATUS_COLORS } from '@/lib/statusColors'

/**
 * Building blocks shared by every Home (air) page, so they read as one app:
 * one page container and header, one card surface, one segmented control, one
 * status mark. Server-safe: no hooks in here.
 */

/** The card surface. Exported as a class string for elements that can't be a <Card>. */
export const cardCls = 'rounded-2xl border border-air-line bg-air-card'

/** Secondary button (neutral) and primary button (emerald). 40px tall; 44px on touch via min-h. */
export const btnCls = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-air-line bg-air-raised px-3.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-air-active hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50'
export const btnPrimaryCls = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-air-bg disabled:cursor-not-allowed disabled:opacity-50'

/** Text inputs and selects. */
export const inputCls = 'min-h-10 rounded-xl border border-white/10 bg-air-raised px-3 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-emerald-500 focus:outline-none disabled:opacity-50'

const WIDTHS = { default: 'max-w-[1120px]', narrow: 'max-w-[760px]' } as const

/** Page container: centred column with the app's gutters. The layout owns the background. */
export function Page({ children, width = 'default', className = '' }: {
  children: React.ReactNode
  width?: keyof typeof WIDTHS
  className?: string
}) {
  return (
    <main className={`mx-auto flex w-full flex-col gap-4 px-4 pb-8 pt-4 md:px-10 md:pb-10 md:pt-8 ${WIDTHS[width]} ${className}`}>
      {children}
    </main>
  )
}

/** Page title row. `back` adds a parent link above the title; children sit on the right. */
export function PageHeader({ title, subtitle, back, children }: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  back?: { href: string; label: string }
  children?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-2">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex min-h-8 items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 5l-5 5 5 5" /></svg>
            {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-zinc-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}

export function Card({ children, className = '', ...rest }: React.ComponentProps<'section'>) {
  return <section className={`${cardCls} ${className}`} {...rest}>{children}</section>
}

/** Section heading inside or above cards. */
export function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-base font-semibold text-zinc-100 ${className}`}>{children}</h2>
}

/**
 * Status mark: a dot for "good", a square for everything else, so the state is
 * not carried by colour alone even before the word next to it is read.
 */
export function StatusDot({ status, muted = false, className = '' }: { status: StatusColor; muted?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 ${status === 'good' ? 'rounded-full' : 'rounded-[2px]'} ${className}`}
      style={{ backgroundColor: muted ? '#71717a' : STATUS_COLORS[status].hex }}
    />
  )
}

/** Segmented control (range pickers, unit switches). */
export function Segmented<T extends string>({ options, value, onChange, label, disabled = false, scroll = false }: {
  options: readonly { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
  /** Accessible name for the group. */
  label: string
  disabled?: boolean
  /** Many options: never wider than its row, scrolls sideways instead (phones). */
  scroll?: boolean
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex gap-1 rounded-xl bg-air-raised p-1 ${scroll ? 'scrollbar-hide max-w-full overflow-x-auto' : ''}`}
    >
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          disabled={disabled}
          className={`min-h-8 shrink-0 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 ${
            value === o.key ? 'bg-air-active font-semibold text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ className = 'h-6 w-6', label = 'Loading' }: { className?: string; label?: string }) {
  return <div role="status" aria-label={label} className={`animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-500 ${className}`} />
}

/** Centred block for a page that has nothing to show yet (loading, error, not set up). */
export function PageState({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">{children}</div>
}

/** Empty card: one line of what's missing, one line of why or what to do. */
export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className={`${cardCls} flex flex-col items-center gap-1 px-6 py-10 text-center`}>
      <p className="text-sm text-zinc-300">{title}</p>
      {hint && <p className="text-sm text-zinc-400">{hint}</p>}
      {children}
    </div>
  )
}
