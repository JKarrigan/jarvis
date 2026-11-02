// Fixed geometry shared by the Documents grid/list and their skeletons, so a folder
// swap (or the skeleton standing in for one) never changes a tile's or row's size.
// Plain strings in a directive-free module: the route's server skeleton imports them too.

/** Icon grid: three columns on phones, auto-fill from 132px up. */
export const GRID = 'grid grid-cols-3 gap-1 p-2 md:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] md:gap-1.5 md:p-3'

/** A tile: icon well, a two-line name block, one meta line (size, item count or folder path). */
export const TILE = 'relative flex min-w-0 flex-col items-center gap-1.5 rounded-[14px] px-1.5 pb-2 pt-2'
export const TILE_WELL = 'relative grid h-[92px] w-full place-items-center'
/** Exactly two lines of 12.5px / 1.3 text plus the name pill's 1px padding: one-line names don't make a row shorter. */
export const TILE_NAME = 'flex h-[34.5px] w-full min-w-0 items-start justify-center'
export const TILE_META = '-mt-1 flex h-5 max-w-full items-center justify-center text-[11px] leading-5'

// Name | Kind | Modified | Size | ⋯ ; phones: Name (+ a secondary line) | ⋯
export const ROW_GRID = 'grid grid-cols-[32px_minmax(0,1fr)_36px] md:grid-cols-[32px_minmax(0,1fr)_150px_170px_86px_36px] items-center gap-x-2 md:gap-x-3'
/** List rows are one fixed height (two text lines fit: a phone's secondary line, a search hit's folder, an upload's bar). */
export const ROW_HEIGHT = 'h-[52px] md:h-12'
