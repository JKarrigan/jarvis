'use client'

import { useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { NarrationLine, NarrationSync } from '../types'
import { useAudiobookPlayer, useAudiobookTime } from '../audiobooks/AudiobookPlayer'
import type { PageChar } from './pdf'

/**
 * Read-along surfaces for a book whose narration has timings (scripts/sync-narration.py):
 * a highlighter drawn over the printed words, a caption strip, a large-type side panel,
 * and the page follower. Each is its own component because they re-render with the audio
 * clock (several times a second) and the reader around them shouldn't.
 */

/** How long before a line starts the reader moves to its page — the turn lands in the narrator's pause. */
const TURN_LEAD = 0.6

/** Index of the last line that has started by `time` (−1 before the first). */
function lineAt(lines: NarrationLine[], time: number): number {
  let lo = 0, hi = lines.length - 1, found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].start <= time) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  return found
}

function useNarration(sync: NarrationSync, audioId: string) {
  const { book, playing, seek } = useAudiobookPlayer()
  const time = useAudiobookTime()
  const narrating = book?.id === audioId
  return { narrating, playing, seek, time, index: narrating ? lineAt(sync.lines, time) : -1 }
}

const wordClass = (time: number, w: { s: number; e: number }) =>
  time >= w.e ? 'text-ink' : time >= w.s ? 'text-accent' : 'text-white/35'

/** Turns the reader to the page the narration has reached. Renders nothing. */
export function NarrationFollower({ sync, audioId, onPage }: { sync: NarrationSync; audioId: string; onPage: (page: number) => void }) {
  const { narrating, playing, time } = useNarration(sync, audioId)
  const turnIndex = narrating ? lineAt(sync.lines, time + TURN_LEAD) : -1
  // page 0 = the line couldn't be placed on a page: captions still show, pages stay manual.
  const turnPage = turnIndex >= 0 && sync.lines[turnIndex].page > 0 ? sync.lines[turnIndex].page : undefined
  // Only while playing, and only when the narration crosses onto a new line — so paging
  // around by hand mid-line is left alone.
  useEffect(() => {
    if (playing && turnPage != null) onPage(turnPage)
  }, [playing, turnIndex, turnPage, onPage])
  return null
}

/** The line being spoken, under the page, each word lighting up as it's said. */
export function CaptionStrip({ sync, audioId, className = '' }: { sync: NarrationSync; audioId: string; className?: string }) {
  const { narrating, time, index } = useNarration(sync, audioId)
  if (!narrating) return null
  const line = index >= 0 ? sync.lines[index] : undefined
  return (
    <div className={`flex min-h-[68px] shrink-0 items-center justify-center px-4 pt-2 md:min-h-[76px] ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        {line && (
          <motion.p
            key={index}
            lang="ja"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className="max-w-[920px] rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-2.5 text-center text-[19px] font-semibold leading-[1.5] tracking-[0.02em] md:text-[23px]"
          >
            {line.words.map((w, i) => <span key={i} className={`transition-colors duration-150 ${wordClass(time, w)}`}>{w.w}</span>)}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Large-type transcript beside the page: the lines printed on the page being *viewed* — so it
 * always matches the page on the left, wherever the narration happens to be — or, when lines
 * couldn't be placed on pages, a window around the one being spoken. Tap a line to jump the
 * narration there.
 */
export function BigTextPanel({ sync, audioId, page, className = '' }: { sync: NarrationSync; audioId: string; page: number; className?: string }) {
  const { narrating, time, index, seek } = useNarration(sync, audioId)
  const panelRef = useRef<HTMLElement>(null)

  const anchor = Math.max(0, index)
  const placed = useMemo(() => sync.lines.some(l => l.page > 0), [sync])
  // One group per printed page; books whose lines have no page use a rolling window instead.
  const group = placed ? `page-${page}` : 'rolling'

  // Keep the spoken line centred. The panel is scrolled directly rather than through a ref
  // on the line: a page of a longer book is several screens of large type, and the lines are
  // re-created whenever the page changes. A new page starts from its top without animation.
  const lastGroup = useRef(group)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const jumped = lastGroup.current !== group
    lastGroup.current = group
    const current = panel.querySelector<HTMLElement>('[aria-current="true"]')
    const top = current ? current.offsetTop - (panel.clientHeight - current.offsetHeight) / 2 : 0
    panel.scrollTo({ top: Math.max(0, top), behavior: jumped ? 'auto' : 'smooth' })
  }, [index, group, narrating])

  if (!narrating) return null
  const shown = sync.lines
    .map((line, i) => ({ line, i }))
    .filter(({ line, i }) => (placed ? line.page === page : i >= anchor - 2 && i <= anchor + 4))

  return (
    <aside ref={panelRef} lang="ja" className={`scrollbar-hide relative min-h-0 shrink-0 flex-col overflow-y-auto pl-2 pr-[clamp(20px,3vw,56px)] ${className}`}>
      {/* my-auto centres the lines when they fit and falls back to the top when they don't —
          justify-center would push the overflow above the top edge, where it can't be scrolled to. */}
      <motion.div
        key={group}
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
        className="my-auto flex flex-col gap-[clamp(14px,2.4vh,30px)] py-[18vh]"
      >
        {shown.length === 0 && <p className="px-4 text-[17px] font-semibold text-white/35" lang="en">No narration on this page.</p>}
        {shown.map(({ line, i }) => {
          const isCurrent = i === index
          return (
            <button
              key={i}
              type="button"
              onClick={() => seek(line.start)}
              aria-current={isCurrent ? 'true' : undefined}
              className={`rounded-2xl px-4 py-2 text-left text-[clamp(26px,2.7vw,46px)] font-bold leading-[1.55] tracking-[0.02em] transition-colors duration-300 hover:bg-white/5 ${isCurrent ? '' : i < index ? 'text-white/50' : 'text-white/25'}`}
            >
              {isCurrent
                ? line.words.map((w, k) => <span key={k} className={`transition-colors duration-150 ${wordClass(time, w)}`}>{w.w}</span>)
                : line.text}
            </button>
          )
        })}
      </motion.div>
    </aside>
  )
}

// ── Highlighting the printed words ──

const isSpace = (ch: string) => ch === ' ' || ch === '　'

/** Longest common subsequence of two character arrays, as index pairs. */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const pairs: [number, number][] = []
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return pairs
}

/**
 * For each line printed on this page, the printed characters each of its words covers.
 * Lines are located in reading order with an LCS against the page's text; characters the
 * transcript spells differently from the book (面白い vs おもしろい) are placed by
 * interpolating between their matched neighbours. A line that mostly fails to match is
 * left out rather than highlighted in the wrong place.
 */
function alignPage(lines: { line: NarrationLine; i: number }[], chars: PageChar[]): Map<number, number[][]> {
  const printed = chars.map(c => c.ch)
  const result = new Map<number, number[][]>()
  let cursor = 0
  for (const { line, i } of lines) {
    const spoken: { ch: string; word: number }[] = []
    line.words.forEach((w, k) => { for (const ch of w.w) if (!isSpace(ch)) spoken.push({ ch, word: k }) })
    if (spoken.length === 0) continue
    const windowEnd = Math.min(printed.length, cursor + spoken.length * 2 + 12)
    const pairs = lcsPairs(spoken.map(s => s.ch), printed.slice(cursor, windowEnd))
    if (pairs.length < spoken.length * 0.4) continue
    const at: (number | null)[] = new Array(spoken.length).fill(null)
    for (const [si, pj] of pairs) at[si] = cursor + pj
    const first = pairs[0], last = pairs[pairs.length - 1]
    for (let si = 0; si < spoken.length; si++) {
      if (at[si] != null) continue
      let guess: number
      if (si < first[0]) guess = cursor + first[1] - (first[0] - si)
      else if (si > last[0]) guess = cursor + last[1] + (si - last[0])
      else {
        let a = si; while (at[a] == null) a--
        let b = si; while (at[b] == null) b++
        guess = (at[a] as number) + (si - a)
        if (guess >= (at[b] as number)) continue
      }
      if (guess >= cursor && guess < windowEnd) at[si] = guess
    }
    const perWord: number[][] = line.words.map(() => [])
    at.forEach((p, si) => { if (p != null) perWord[spoken[si].word].push(p) })
    result.set(i, perWord)
    cursor += last[1] + 1
  }
  return result
}

/** Merge a word's characters into one box per printed row. */
function boxes(indices: number[], chars: PageChar[]): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = []
  for (const c of [...new Set(indices)].sort((a, b) => a - b).map(p => chars[p])) {
    const row = out[out.length - 1]
    if (row && Math.abs(row.y - c.y) < c.h / 2 && c.x <= row.x + row.w + c.w) row.w = Math.max(row.w, c.x + c.w - row.x)
    else out.push({ x: c.x, y: c.y, w: c.w, h: c.h })
  }
  return out
}

/**
 * Highlighter over the page itself: words already spoken in the current line get a light
 * wash, the word being spoken a stronger one. `multiply` keeps the printed ink on top, the
 * way a real highlighter does. Needs a text layer — renders nothing when the page has none.
 */
export function PageHighlights({ sync, audioId, page, chars }: { sync: NarrationSync; audioId: string; page: number; chars: PageChar[] }) {
  const { narrating, time, index } = useNarration(sync, audioId)
  const aligned = useMemo(
    () => alignPage(sync.lines.map((line, i) => ({ line, i })).filter(x => x.line.page === page), chars),
    [sync, page, chars],
  )
  const words = narrating && index >= 0 ? aligned.get(index) : undefined
  if (!words) return null
  const line = sync.lines[index]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ mixBlendMode: 'multiply' }}>
      {line.words.flatMap((w, k) => {
        if (time < w.s) return []
        const strength = time < w.e ? 0.85 : 0.4
        return boxes(words[k], chars).map((b, n) => (
          <span
            key={`${k}-${n}`}
            className="absolute rounded-[4px] bg-accent transition-opacity duration-200"
            style={{ left: b.x - 1, top: b.y - b.h * 0.08, width: b.w + 2, height: b.h * 1.2, opacity: strength }}
          />
        ))
      })}
    </div>
  )
}
