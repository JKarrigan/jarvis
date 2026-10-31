'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatTime } from '../playerUi'
import { errorText, fetchJson, formatBytes, formatTaken, isAbort, type PhotoDetail, type PhotoItem } from './api'
import { CloseIcon, MapPinIcon } from './icons'

function Row({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="py-2.5">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/42">{label}</dt>
      <dd className={`mt-0.5 break-words text-[14px] text-white/85 ${mono ? 'font-mono text-[12.5px]' : ''}`}>{children}</dd>
    </div>
  )
}

/**
 * Metadata for the viewer's current item: date, camera, dimensions, size, duration, file
 * path, map link and albums. Right-hand panel on desktop, bottom sheet on phones.
 */
export function InfoPanel({ item, onClose }: { item: PhotoItem; onClose: () => void }) {
  const [detail, setDetail] = useState<{ id: string; data: PhotoDetail | null; error: string | null } | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetchJson<PhotoDetail>(`/api/photos/${item.id}`, { signal: ctrl.signal })
      .then(data => setDetail({ id: item.id, data, error: null }))
      .catch(e => { if (!isAbort(e)) setDetail({ id: item.id, data: null, error: errorText(e) }) })
    return () => ctrl.abort()
  }, [item.id])

  const d = detail?.id === item.id ? detail : null
  const full = d?.data
  const mp = item.width && item.height ? (item.width * item.height) / 1e6 : 0

  return (
    <aside
      aria-label="Info"
      className="absolute inset-x-0 bottom-0 z-30 max-h-[62vh] overflow-y-auto rounded-t-[22px] border-t border-white/10 bg-[#141119]/95 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl md:static md:inset-auto md:z-auto md:h-full md:max-h-none md:w-[340px] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:pt-16 md:shadow-none"
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20 md:hidden" aria-hidden />
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-ink">Info</h2>
        <button type="button" onClick={onClose} aria-label="Close info" className="grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <dl className="divide-y divide-white/[0.06]">
        <Row label="Taken">{formatTaken(item.takenAt)}</Row>
        {full?.camera && <Row label="Camera">{full.camera}</Row>}
        {item.width && item.height ? (
          <Row label="Dimensions">{item.width.toLocaleString('en-GB')} × {item.height.toLocaleString('en-GB')}{mp >= 0.1 ? ` · ${mp.toFixed(1)} MP` : ''}</Row>
        ) : null}
        <Row label="Size">{formatBytes(item.size)}{item.mime ? ` · ${item.mime.replace(/^(image|video)\//, '').toUpperCase()}` : ''}</Row>
        {item.kind === 'video' && item.duration != null && <Row label="Duration">{formatTime(item.duration)}</Row>}
        {full && full.lat != null && full.lon != null && (
          <Row label="Location">
            <a
              href={`https://maps.apple.com/?ll=${full.lat},${full.lon}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline"
            >
              <MapPinIcon className="h-4 w-4" />
              {full.lat.toFixed(4)}, {full.lon.toFixed(4)}
            </a>
          </Row>
        )}
        {full && full.albums.length > 0 && (
          <Row label="Albums">
            <span className="flex flex-wrap gap-1.5 pt-1">
              {full.albums.map(a => (
                <Link key={a.id} href={`/media/photos/albums/${a.id}`} className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[12.5px] font-semibold text-white/85 hover:bg-white/[0.12]">
                  {a.name}
                </Link>
              ))}
            </span>
          </Row>
        )}
        <Row label="File" mono>{item.relPath}</Row>
      </dl>
      {!d && <p className="pt-2 text-[12.5px] text-white/40">Loading details…</p>}
      {d?.error && <p className="pt-2 text-[12.5px] text-[#ff8a8a]">{d.error}</p>}
    </aside>
  )
}
