'use client'

import Link from 'next/link'

/** Listen | Read — the two halves of the Books section share one rail entry. */
export function BooksSwitch({ active }: { active: 'listen' | 'read' }) {
  const item = (key: 'listen' | 'read', href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? 'page' : undefined}
      className={`grid h-10 place-items-center rounded-[11px] px-5 text-[13.5px] font-bold transition-colors ${active === key ? 'bg-accent text-ink-on-accent' : 'text-white/65 hover:text-white'}`}
    >
      {label}
    </Link>
  )
  return (
    <div className="flex gap-0.5 rounded-[14px] border border-border bg-surface p-1">
      {item('listen', '/media/audiobooks', 'Listen')}
      {item('read', '/media/books', 'Read')}
    </div>
  )
}
