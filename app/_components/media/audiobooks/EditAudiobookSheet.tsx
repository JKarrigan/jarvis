'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet } from '@/app/_components/HueControls'
import type { AudiobookDetail, AudiobookEdit } from '../types'
import { useAudiobookPlayer } from './AudiobookPlayer'

const FIELD = 'w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-300/40'
const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400'

/**
 * Edit what Jellyfin can't fill in for audiobooks: description, narrator, year — and the
 * chapter names, pasted one per line (files usually ship with "Track 001"-style markers).
 */
export function EditAudiobookSheet({ book, onClose }: { book: AudiobookDetail; onClose: () => void }) {
  const router = useRouter()
  const { book: loaded, refreshBook } = useAudiobookPlayer()
  const [narrator, setNarrator] = useState(book.narrator ?? '')
  const [year, setYear] = useState(book.year ? String(book.year) : '')
  const [synopsis, setSynopsis] = useState(book.synopsis ?? '')
  const [names, setNames] = useState(book.chapters.map(c => c.title).join('\n'))
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const multi = book.chapters.length > 1
  const lines = names.split('\n')
  const entered = lines.filter(l => l.trim()).length
  const tooMany = lines.length > book.chapters.length && lines.slice(book.chapters.length).some(l => l.trim())

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFailed(false)
    const edit: AudiobookEdit = {
      narrator,
      synopsis,
      year: year.trim() ? Number(year) : null,
      ...(multi ? { chapterTitles: lines.slice(0, book.chapters.length) } : {}),
    }
    try {
      const res = await fetch(`/api/jellyfin/audiobooks/${book.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      })
      if (!res.ok) throw new Error()
      if (loaded?.id === book.id) await refreshBook()
      router.refresh()
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4 p-5">
        <h3 className="text-lg font-semibold text-zinc-100">Edit details</h3>
        <div className="flex gap-3">
          <label className="min-w-0 flex-1">
            <span className={LABEL}>Narrator</span>
            <input value={narrator} onChange={e => setNarrator(e.target.value)} placeholder="Read by…" className={FIELD} />
          </label>
          <label className="w-24 shrink-0">
            <span className={LABEL}>Year</span>
            <input value={year} onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className={FIELD} />
          </label>
        </div>
        <label className="block">
          <span className={LABEL}>Description</span>
          <textarea value={synopsis} onChange={e => setSynopsis(e.target.value)} rows={4} className={`${FIELD} resize-y leading-relaxed`} />
        </label>
        {multi && (
          <label className="block">
            <span className={`${LABEL} flex justify-between`}>
              <span>Chapter names · one per line</span>
              <span className={tooMany ? 'text-red-300' : 'text-zinc-500'}>{entered} / {book.chapters.length}</span>
            </span>
            <textarea
              value={names}
              onChange={e => setNames(e.target.value)}
              rows={8}
              spellCheck={false}
              className={`${FIELD} resize-y whitespace-pre font-mono text-[12.5px] leading-relaxed`}
            />
            <span className="mt-1.5 block text-xs text-zinc-500">
              {tooMany
                ? `This book has ${book.chapters.length} chapters — extra lines are ignored.`
                : 'Line 1 names the first chapter, and so on. A blank line keeps the name from the file.'}
            </span>
          </label>
        )}
        {failed && <p className="text-sm text-red-300">Couldn’t save — check that Jellyfin is reachable, then try again.</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/5">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-xl bg-amber-300 px-5 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-40">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
