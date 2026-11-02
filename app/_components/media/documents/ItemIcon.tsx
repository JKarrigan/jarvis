'use client'

import { useState } from 'react'
import Image from 'next/image'
import { thumbUrl, type DocItem } from './api'
import { fileKind, hasThumb } from './fileKinds'
import { FileGlyph, FolderGlyph } from './icons'

/** Largest a tile thumbnail is drawn (the well is 92px high). */
const TILE_BOX = { w: 112, h: 88 }

/** `w`×`h` scaled to fit `box` (never up), rounded to whole pixels. */
function fitInto(w: number, h: number, box: { w: number; h: number }) {
  const s = Math.min(1, box.w / w, box.h / h)
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }
}

/**
 * Server thumbnail over the typed icon. The icon keeps its place in the layout the whole
 * time; the image loads in a fixed, invisible box laid over it and, once decoded, a framed
 * copy (sized to the image) fades in over the icon as the icon fades out. A 404 (no
 * preview) just leaves the icon. Nothing around it ever moves.
 */
function Thumb({ item, size, glyph }: { item: DocItem; size: 'tile' | 'row'; glyph: React.ReactNode }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'loaded'; w: number; h: number }>({ status: 'loading' })
  const tile = size === 'tile'
  const src = thumbUrl(item, 't')
  const loaded = state.status === 'loaded'
  return (
    <span className={tile ? 'contents' : 'relative grid h-8 w-8 shrink-0 place-items-center'}>
      <span className={`grid place-items-center transition-opacity duration-200 ${loaded ? 'opacity-0' : 'opacity-100'}`}>{glyph}</span>
      {state.status !== 'error' && (
        <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
          {state.status === 'loading' ? (
            // The probe: a fixed box, invisible, so its size never matters before the image is known.
            <Image
              src={src}
              alt=""
              width={tile ? 224 : 64}
              height={tile ? 176 : 64}
              unoptimized
              loading="lazy"
              decoding="async"
              draggable={false}
              onLoad={e => {
                const img = e.currentTarget
                const fit = tile ? fitInto(img.naturalWidth || TILE_BOX.w, img.naturalHeight || TILE_BOX.h, TILE_BOX) : { w: 32, h: 32 }
                setState({ status: 'loaded', ...fit })
              }}
              onError={() => setState({ status: 'error' })}
              className={`${tile ? 'h-[88px] w-[112px]' : 'h-8 w-8'} opacity-0`}
            />
          ) : (
            // A new element (not the probe resized), so the swap isn't a layout shift.
            <span
              className={`docs-thumb-in block overflow-hidden border border-white/15 bg-white/[0.06] shadow-[0_6px_18px_rgba(0,0,0,0.35)] ${tile ? 'rounded-[8px]' : 'rounded-[6px]'}`}
              style={{ width: state.w, height: state.h }}
            >
              <Image
                src={src}
                alt=""
                width={tile ? 224 : 64}
                height={tile ? 176 : 64}
                unoptimized
                decoding="async"
                draggable={false}
                className={`h-full w-full ${tile ? 'object-contain' : 'object-cover'}`}
              />
            </span>
          )}
        </span>
      )}
    </span>
  )
}

/**
 * Folder, thumbnail or typed icon for an item.
 *   tile — the grid's well (folder 72px, kind icon 60px, framed thumbnail)
 *   row  — the list's 32px icon
 */
export function ItemIcon({ item, size = 'tile' }: { item: DocItem; size?: 'tile' | 'row' }) {
  const kind = fileKind(item)
  const tile = size === 'tile'
  const glyph = kind === 'folder'
    ? <FolderGlyph className={tile ? 'h-[60px] w-[74px]' : 'h-[22px] w-[28px] shrink-0'} />
    : <FileGlyph kind={kind} className={tile ? 'h-[66px] w-[54px]' : 'h-[28px] w-[23px] shrink-0'} />
  if (kind === 'folder' || !hasThumb(item)) return <span className={tile ? 'contents' : 'grid w-8 shrink-0 place-items-center'}>{glyph}</span>
  // Keyed by the thumb URL so an edited file (new mtime) starts over at "loading".
  return <Thumb key={thumbUrl(item)} item={item} size={size} glyph={glyph} />
}
