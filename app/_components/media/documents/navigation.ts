// Folder-to-folder navigation helpers for the Documents browser: which way the content
// slides, and the per-tab scroll memory that going up / Back restores. React-free so
// tests can drive them.

import { isWithin } from './api'

/**
 * `down` — into a folder (or anywhere beneath the one shown): slides in from the right.
 * `up` — to an ancestor (a crumb, ⌘↑, Back): slides in from the left.
 * `none` — a sibling, an unrelated folder or the same one: opacity only.
 */
export type NavDirection = 'down' | 'up' | 'none'

/** Direction of a move from the folder shown (`from`, '' = root) to `to`. */
export function navDirection(from: string, to: string): NavDirection {
  if (from === to) return 'none'
  if (from === '' || isWithin(to, from)) return 'down'
  if (to === '' || isWithin(from, to)) return 'up'
  return 'none'
}

/** Horizontal offset (px) the entering content starts from. */
export const SLIDE_PX = 10

export function slideFrom(dir: NavDirection): number {
  return dir === 'down' ? SLIDE_PX : dir === 'up' ? -SLIDE_PX : 0
}

/** Remembered window scroll per folder (this tab only), newest last; capped. */
export class ScrollMemory {
  private readonly byFolder = new Map<string, number>()
  constructor(private readonly max = 200) {}

  remember(folder: string, y: number) {
    this.byFolder.delete(folder)
    this.byFolder.set(folder, Math.max(0, Math.round(y)))
    while (this.byFolder.size > this.max) {
      const oldest = this.byFolder.keys().next().value
      if (oldest === undefined) break
      this.byFolder.delete(oldest)
    }
  }

  recall(folder: string): number | undefined {
    return this.byFolder.get(folder)
  }

  /** Forget a folder and everything under it (moved, renamed or deleted). */
  forget(folder: string) {
    for (const key of [...this.byFolder.keys()]) if (isWithin(key, folder)) this.byFolder.delete(key)
  }
}

/** The tab's scroll memory (module state: survives leaving and re-entering the page). */
export const folderScroll = new ScrollMemory()
