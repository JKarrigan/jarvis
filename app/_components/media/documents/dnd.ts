'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { canMoveInto } from './selection'

/** dataTransfer type of an in-app drag (paths travel in the hook's ref, not the payload). */
export const DRAG_MIME = 'application/x-reel-documents'
/** Every drop target (folder tile/row, breadcrumb) carries its folder path in this attribute. */
export const DROP_ATTR = 'data-drop-folder'

const hasType = (e: React.DragEvent | DragEvent, type: string) => Array.from(e.dataTransfer?.types ?? []).includes(type)
const folderAt = (target: EventTarget | null): string | null =>
  target instanceof Element ? target.closest(`[${DROP_ATTR}]`)?.getAttribute(DROP_ATTR) ?? null : null

const FINE_POINTER = '(pointer: fine)'
/** Mouse/trackpad devices drag; touch screens use Move to… (native DnD on touch fights long-press). */
export function useCanDrag(): boolean {
  return useSyncExternalStore(
    cb => {
      const mq = window.matchMedia(FINE_POINTER)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(FINE_POINTER).matches,
    () => false,
  )
}

/** The drag image: a glass pill with the first item's name and a count badge, built off-screen. */
function ghost(host: HTMLElement, label: string, count: number): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = [
    'position:fixed', 'top:-200px', 'left:-400px', 'display:inline-flex', 'align-items:center', 'gap:8px',
    'height:34px', 'max-width:280px', 'padding:0 8px 0 12px', 'border-radius:12px',
    'background:rgba(24,20,30,0.96)', 'border:1px solid rgba(255,255,255,0.14)', 'color:#f3eff8',
    'font:600 13px var(--font-manrope),system-ui,sans-serif', 'white-space:nowrap', 'box-shadow:0 18px 44px rgba(0,0,0,0.55)',
  ].join(';')
  const name = document.createElement('span')
  name.textContent = label
  name.style.cssText = 'overflow:hidden;text-overflow:ellipsis'
  el.appendChild(name)
  if (count > 1) {
    const badge = document.createElement('span')
    badge.textContent = String(count)
    badge.style.cssText = 'min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--accent);color:var(--ink-on-accent,#15101f);font-size:11.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center'
    el.appendChild(badge)
  }
  host.appendChild(el)
  return el
}

export interface DragPayload { paths: string[]; dirs: Set<string>; label: string }

/**
 * Native HTML5 drag and drop for the browser (no library):
 *  - items drag onto folder tiles/rows and breadcrumbs (anything with `data-drop-folder`)
 *    to move; a selected item drags the whole selection (count badge on the drag image);
 *  - files from the desktop drop anywhere on the browser (the current folder) or onto a
 *    folder (that folder). A depth counter keeps the highlight from flickering over children.
 * The returned `zoneProps` go on the browser's root element.
 */
export function useDocumentsDnd({ enabled, currentFolder, onMove, onUpload }: {
  enabled: boolean
  currentFolder: string
  onMove: (paths: string[], target: string) => void
  onUpload: (files: File[], target: string) => void
}) {
  const drag = useRef<DragPayload | null>(null)
  const [dragging, setDragging] = useState<ReadonlySet<string> | null>(null)
  /** Folder path under the pointer that would accept the drop ('' = root crumb). */
  const [over, setOver] = useState<string | null>(null)
  /** Desktop files are being dragged over the browser. */
  const [fileDrag, setFileDrag] = useState(false)
  const depth = useRef(0)
  const hostRef = useRef<HTMLElement | null>(null)

  const reset = useCallback(() => {
    depth.current = 0
    setFileDrag(false)
    setOver(null)
  }, [])

  // A drop or cancel outside the browser never reaches its dragleave.
  useEffect(() => {
    if (!fileDrag) return
    window.addEventListener('drop', reset)
    window.addEventListener('dragend', reset)
    return () => {
      window.removeEventListener('drop', reset)
      window.removeEventListener('dragend', reset)
    }
  }, [fileDrag, reset])

  /** Called from an item's onDragStart with what it drags (the selection or just itself). */
  const startDrag = useCallback((e: React.DragEvent, payload: DragPayload) => {
    if (!enabled) { e.preventDefault(); return }
    drag.current = payload
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(DRAG_MIME, '1')
    // Plain-text fallback so dropping on another app gives the names, not nothing.
    e.dataTransfer.setData('text/plain', payload.paths.join('\n'))
    const host = hostRef.current ?? document.body
    const el = ghost(host, payload.label, payload.paths.length)
    e.dataTransfer.setDragImage(el, -12, -8)
    setTimeout(() => el.remove(), 0)
    setDragging(new Set(payload.paths))
  }, [enabled])

  const endDrag = useCallback(() => {
    drag.current = null
    setDragging(null)
    setOver(null)
  }, [])

  const zoneProps = {
    ref: (el: HTMLElement | null) => { hostRef.current = el },
    onDragEnter: (e: React.DragEvent) => {
      if (!hasType(e, 'Files')) return
      e.preventDefault()
      depth.current += 1
      if (enabled) setFileDrag(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (hasType(e, DRAG_MIME) && drag.current) {
        const target = folderAt(e.target)
        const ok = enabled && target != null && canMoveInto(drag.current.paths, drag.current.dirs, target)
        if (ok) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }
        setOver(ok ? target : null)
        return
      }
      if (!hasType(e, 'Files')) return
      e.preventDefault()
      // "copy" is what makes the OS draw its plus on the cursor.
      e.dataTransfer.dropEffect = enabled ? 'copy' : 'none'
      if (enabled) setOver(folderAt(e.target))
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!hasType(e, 'Files')) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) reset()
    },
    onDrop: (e: React.DragEvent) => {
      if (hasType(e, DRAG_MIME) && drag.current) {
        e.preventDefault()
        const target = folderAt(e.target)
        const payload = drag.current
        endDrag()
        if (enabled && target != null && canMoveInto(payload.paths, payload.dirs, target)) {
          const moving = payload.paths.filter(p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') !== target)
          onMove(moving, target)
        }
        return
      }
      if (!hasType(e, 'Files')) return
      e.preventDefault()
      const target = folderAt(e.target)
      reset()
      if (!enabled) return
      const files = Array.from(e.dataTransfer.files ?? [])
      if (files.length) onUpload(files, target ?? currentFolder)
    },
  }

  return { zoneProps, startDrag, endDrag, dragging, over, fileDrag: enabled && fileDrag }
}
