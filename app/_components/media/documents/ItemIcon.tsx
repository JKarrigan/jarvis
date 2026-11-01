'use client'

import { useState } from 'react'
import Image from 'next/image'
import { thumbUrl, type DocItem } from './api'
import { fileKind, hasThumb } from './fileKinds'
import { FileGlyph, FolderGlyph } from './icons'

/** Server thumbnail over a shimmer; a 404 (no preview) falls back to the typed icon. */
function Thumb({ item, size, fallback }: { item: DocItem; size: 'tile' | 'row'; fallback: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  if (state === 'error') return <>{fallback}</>
  const tile = size === 'tile'
  return (
    <span
      className={`relative inline-flex overflow-hidden border border-white/15 bg-white/[0.06] shadow-[0_6px_18px_rgba(0,0,0,0.35)] ${
        tile ? 'max-h-[88px] max-w-[112px] min-h-[40px] min-w-[40px] rounded-[8px]' : 'h-8 w-8 shrink-0 rounded-[6px]'
      } ${state === 'loading' ? 'reel-shimmer' : ''}`}
    >
      <Image
        src={thumbUrl(item, 't')}
        alt=""
        width={tile ? 224 : 64}
        height={tile ? 176 : 64}
        unoptimized
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
        className={`${tile ? 'h-auto max-h-[88px] w-auto max-w-[112px] object-contain' : 'h-full w-full object-cover'} transition-opacity duration-300 ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
      />
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
  return <Thumb key={thumbUrl(item)} item={item} size={size} fallback={tile ? glyph : <span className="grid w-8 shrink-0 place-items-center">{glyph}</span>} />
}
