'use client'

import { useEffect, useRef } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderPage } from '../../books/pdf'

export interface OutlineNode {
  title: string
  /** Named or explicit destination inside the PDF. */
  dest: string | unknown[] | null
  /** External link (some outlines point at web pages). */
  url: string | null
  items: OutlineNode[]
}

export type SidebarTab = 'pages' | 'outline'

const THUMB_W = 132
const THUMB_H = 190

/**
 * Desktop sidebar: page thumbnails (drawn lazily as they scroll into view, the current
 * page highlighted and kept in view; a click jumps) and, when the PDF has bookmarks, an
 * Outline tab.
 */
export function PdfSidebar({ doc, pages, ratio, page, outline, tab, onTab, onPage, onOutline }: {
  doc: PDFDocumentProxy
  pages: number
  /** Height / width of page 1 (placeholders before a thumbnail is drawn). */
  ratio: number
  page: number
  outline: OutlineNode[]
  tab: SidebarTab
  onTab: (tab: SidebarTab) => void
  onPage: (page: number) => void
  onOutline: (node: OutlineNode) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  const hasOutline = outline.length > 0
  const shown: SidebarTab = hasOutline ? tab : 'pages'

  // Draw thumbnails as they near the visible part of the list.
  useEffect(() => {
    const root = list.current
    if (!root || shown !== 'pages') return
    let closed = false
    const drawn = new Set<number>()
    const tasks: { cancel: () => void }[] = []
    const draw = async (canvas: HTMLCanvasElement) => {
      const n = Number(canvas.dataset.thumb)
      if (drawn.has(n)) return
      drawn.add(n)
      try {
        const task = await renderPage(doc, n, canvas, THUMB_W, THUMB_H, Math.min(2, window.devicePixelRatio || 1))
        if (closed) { task.cancel(); return }
        tasks.push(task)
        await task.done
      } catch {
        drawn.delete(n)
      }
    }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) void draw(e.target as HTMLCanvasElement)
    }, { root, rootMargin: '400px 0px' })
    root.querySelectorAll<HTMLCanvasElement>('canvas[data-thumb]').forEach(c => io.observe(c))
    return () => {
      closed = true
      io.disconnect()
      tasks.forEach(t => t.cancel())
    }
  }, [doc, shown, pages])

  // Keep the current page's thumbnail in view.
  useEffect(() => {
    if (shown !== 'pages') return
    list.current?.querySelector(`[data-thumb-button="${page}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [page, shown])

  const tabBtn = (t: SidebarTab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={shown === t}
      onClick={() => onTab(t)}
      className={`h-8 flex-1 rounded-[9px] text-[12.5px] font-semibold transition ${shown === t ? 'bg-white/[0.14] text-ink' : 'text-white/55 hover:text-white'}`}
    >
      {label}
    </button>
  )

  return (
    <aside aria-label="Pages and outline" className="flex h-full w-[184px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0f0d13]">
      {hasOutline && (
        <div role="tablist" aria-label="Sidebar" className="m-2 mb-0 flex gap-0.5 rounded-[12px] border border-white/10 bg-white/[0.04] p-0.5">
          {tabBtn('pages', 'Pages')}
          {tabBtn('outline', 'Outline')}
        </div>
      )}
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
        {shown === 'pages' ? (
          <ol className="flex flex-col items-center gap-3" aria-label="Page thumbnails">
            {Array.from({ length: pages }, (_, i) => {
              const n = i + 1
              const current = n === page
              return (
                <li key={n}>
                  <button
                    type="button"
                    data-thumb-button={n}
                    onClick={() => onPage(n)}
                    aria-label={`Page ${n}`}
                    aria-current={current ? 'page' : undefined}
                    className="group flex flex-col items-center gap-1 rounded-[8px] p-1 outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    <span
                      className={`grid place-items-center overflow-hidden rounded-[3px] bg-white ring-offset-2 ring-offset-[#0f0d13] transition ${current ? 'ring-2 ring-[var(--accent)]' : 'opacity-80 group-hover:opacity-100'}`}
                      style={{ width: THUMB_W, height: Math.min(THUMB_H, Math.round(THUMB_W * ratio)) }}
                    >
                      <canvas data-thumb={n} className="block max-h-full max-w-full" />
                    </span>
                    <span className={`text-[11.5px] tabular-nums ${current ? 'font-bold text-ink' : 'text-white/50'}`}>{n}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        ) : (
          <OutlineList nodes={outline} depth={0} onOutline={onOutline} />
        )}
      </div>
    </aside>
  )
}

function OutlineList({ nodes, depth, onOutline }: { nodes: OutlineNode[]; depth: number; onOutline: (n: OutlineNode) => void }) {
  return (
    <ul className="flex flex-col" aria-label={depth === 0 ? 'Document outline' : undefined}>
      {nodes.map((n, i) => (
        <li key={`${i}-${n.title}`}>
          <button
            type="button"
            onClick={() => onOutline(n)}
            className="w-full rounded-[8px] py-1.5 pr-2 text-left text-[12.5px] leading-snug text-white/80 outline-none transition hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.1]"
            style={{ paddingLeft: 8 + Math.min(depth, 4) * 12 }}
          >
            {n.title || 'Untitled'}
          </button>
          {n.items.length > 0 && <OutlineList nodes={n.items} depth={depth + 1} onOutline={onOutline} />}
        </li>
      ))}
    </ul>
  )
}
