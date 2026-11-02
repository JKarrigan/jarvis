import { describe, expect, it } from 'vitest'
import type { DocItem } from '@/app/_components/media/documents/api'
import { cleanFolder, isWithin, pathLabel } from '@/app/_components/media/documents/api'
import {
  fileKind, graphemes, keepBothName, middleEllipsis, nameProblem, nextUntitledName, splitName,
} from '@/app/_components/media/documents/fileKinds'
import {
  EMPTY_SELECTION, canMoveInto, pruneSelection, selectionReducer, sortItems, toggleSort, topLevelOnly,
  type SelectionAction, type SelectionState,
} from '@/app/_components/media/documents/selection'
import {
  mergeListing, planUploads, storedItem, walkEntries, withPlaceholders,
  type EntryLike, type PlaceholderSource,
} from '@/app/_components/media/documents/uploadPlan'

const item = (path: string, isDir = false, extra: Partial<DocItem> = {}): DocItem => ({
  path, name: path.slice(path.lastIndexOf('/') + 1), isDir, size: 0, modified: 0, childCount: 0,
  parent: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', ...extra,
})

describe('documents selection mode', () => {
  const keys = ['a', 'b', 'c', 'd']
  const run = (...actions: SelectionAction[]) => actions.reduce<SelectionState>(selectionReducer, EMPTY_SELECTION)
  const sel = (s: SelectionState) => [...s.selected].sort()

  it('a plain click outside selection mode selects nothing (it opens)', () => {
    const s = run({ type: 'click', key: 'b', ordered: keys })
    expect(s).toBe(EMPTY_SELECTION)
  })
  it('⋯ → Select enters selection mode with that item; toolbar Select with nothing', () => {
    expect(run({ type: 'enter', key: 'c' })).toMatchObject({ mode: true, anchor: 'c' })
    expect(sel(run({ type: 'enter', key: 'c' }))).toEqual(['c'])
    const empty = run({ type: 'enter' })
    expect(empty.mode).toBe(true)
    expect(empty.selected.size).toBe(0)
  })
  it('inside selection mode plain clicks toggle and Shift-click adds a range', () => {
    let s = run({ type: 'enter', key: 'a' }, { type: 'click', key: 'c', ordered: keys })
    expect(sel(s)).toEqual(['a', 'c'])
    s = selectionReducer(s, { type: 'click', key: 'a', ordered: keys })
    expect(sel(s)).toEqual(['c'])
    // The anchor is the last clicked item (a): Shift-click d adds a…d.
    s = selectionReducer(s, { type: 'click', key: 'd', ordered: keys, mods: { shift: true } })
    expect(sel(s)).toEqual(['a', 'b', 'c', 'd'])
    // Emptying the selection keeps the mode until Done.
    s = run({ type: 'enter', key: 'a' }, { type: 'click', key: 'a', ordered: keys })
    expect(s.mode).toBe(true)
    expect(s.selected.size).toBe(0)
  })
  it('⌘-click, Shift-click and Space are power shortcuts that enter selection mode', () => {
    expect(run({ type: 'click', key: 'b', ordered: keys, mods: { meta: true } })).toMatchObject({ mode: true })
    expect(sel(run({ type: 'click', key: 'c', ordered: keys, mods: { shift: true } }))).toEqual(['c'])
    expect(sel(run({ type: 'toggle', key: 'd' }))).toEqual(['d'])
    expect(sel(run({ type: 'toggle', key: 'd' }, { type: 'toggle', key: 'd' }))).toEqual([])
  })
  it('Select all, Done/Escape and pruning', () => {
    const all = run({ type: 'enter' }, { type: 'all', ordered: keys })
    expect(sel(all)).toEqual(keys)
    expect(selectionReducer(all, { type: 'exit' })).toBe(EMPTY_SELECTION)
    expect(selectionReducer(EMPTY_SELECTION, { type: 'exit' })).toBe(EMPTY_SELECTION)
    const pruned = selectionReducer(all, { type: 'prune', ordered: ['a', 'x'] })
    expect(sel(pruned)).toEqual(['a'])
    expect(pruned.mode).toBe(true)
    expect(pruneSelection(pruned, ['a'])).toBe(pruned)
  })
  it('folders are selectable like files (keys are just paths)', () => {
    expect(sel(run({ type: 'enter', key: 'Taxes' }, { type: 'click', key: 'Taxes/a.pdf', ordered: ['Taxes', 'Taxes/a.pdf'] }))).toEqual(['Taxes', 'Taxes/a.pdf'])
  })
})

describe('upload placeholders', () => {
  const up = (id: string, dir: string, name: string, state: PlaceholderSource['state'] = 'queued', extra: Partial<PlaceholderSource> = {}): PlaceholderSource => ({
    id, dir, name, loaded: 0, total: 100, addedAt: 50, state, ...extra,
  })
  const sort = { field: 'name', dir: 'asc' } as const

  it('sit among the real items in the current sort, only in their folder', () => {
    const items = [item('Docs/b.txt', false, { size: 5 }), item('Docs/Sub', true), item('Docs/d.txt')]
    const uploads = [up('1', 'Docs', 'c.txt'), up('2', 'Docs', 'a.txt', 'uploading'), up('3', 'Other', 'z.txt'), up('4', 'Docs', 'e.txt', 'error')]
    const list = withPlaceholders(items, uploads, 'Docs', sort)
    expect(list.map(i => i.name)).toEqual(['Sub', 'a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt'])
    expect(list.filter(i => i.upload).map(i => i.upload?.id)).toEqual(['2', '1', '4'])
  })
  it('a stored upload takes the same spot as its placeholder', () => {
    const items = [item('x/a.txt'), item('x/c.txt')]
    const before = withPlaceholders(items, [up('1', 'x', 'b.txt', 'uploading')], 'x', sort)
    const after = withPlaceholders([...items, storedItem('x', 'b.txt', 100, 60)], [up('1', 'x', 'b.txt', 'done')], 'x', sort)
    expect(before.map(i => i.path)).toEqual(after.map(i => i.path))
    expect(before[1].upload).toBeDefined()
    expect(after[1].upload).toBeUndefined()
  })
  it('leaves out done / skipped / cancelled uploads, name clashes and duplicates', () => {
    const items = [item('a.txt')]
    const list = withPlaceholders(items, [
      up('1', '', 'a.txt'), up('2', '', 'b.txt', 'done'), up('3', '', 'c.txt', 'skipped'),
      up('4', '', 'd.txt'), up('5', '', 'd.txt'), up('6', '', 'e.txt', 'conflict'),
    ], '', sort)
    expect(list.map(i => i.name)).toEqual(['a.txt', 'd.txt'])
  })
  it('date sorts put new uploads with the newest', () => {
    const items = [item('old.txt', false, { modified: 10 }), item('new.txt', false, { modified: 40 })]
    const list = withPlaceholders(items, [up('1', '', 'up.txt')], '', { field: 'modified', dir: 'desc' })
    expect(list[0].name).toBe('up.txt')
  })
  it('a refetch that started before an upload was stored keeps it; a later one settles it', () => {
    const stored = { item: storedItem('', 'b.txt', 1, 100), at: 100 }
    const early = mergeListing([item('a.txt')], [stored], 90)
    expect(early.items.map(i => i.name)).toEqual(['a.txt', 'b.txt'])
    expect(early.pending).toHaveLength(1)
    const late = mergeListing([item('a.txt')], [stored], 110)
    expect(late.items.map(i => i.name)).toEqual(['a.txt'])
    expect(late.pending).toHaveLength(0)
    // Already in the answer: no duplicate.
    expect(mergeListing([item('a.txt'), item('b.txt')], [stored], 90).items).toHaveLength(2)
  })
})

describe('folder drops', () => {
  type F = { name: string; size: number }
  const file = (name: string): EntryLike & { file: (ok: (f: F) => void) => void } => ({
    name, isFile: true, isDirectory: false, file: ok => ok({ name, size: name.length }),
  })
  // readEntries pages its results (Chrome: 100 at a time) and then answers [].
  const dir = (name: string, children: EntryLike[]): EntryLike & { createReader: () => { readEntries: (ok: (e: EntryLike[]) => void) => void } } => ({
    name, isFile: false, isDirectory: true,
    createReader: () => {
      let page = 0
      return { readEntries: ok => { const out = children.slice(page * 2, page * 2 + 2); page++; ok(out) } }
    },
  })

  it('walks nested folders (paged readEntries), keeps empty ones, skips hidden entries', async () => {
    const tree = await walkEntries<F>([
      dir('Trip', [file('b.jpg'), file('a.jpg'), file('.DS_Store'), dir('Day 2', [file('x.jpg')]), dir('Empty', []), dir('@eaDir', [file('t.jpg')])]),
      file('loose.txt'),
    ])
    expect(tree.dirs).toEqual(['Trip', 'Trip/Day 2', 'Trip/Empty'])
    expect(tree.files.map(f => `${f.relDir}|${f.file.name}`)).toEqual(['Trip|b.jpg', 'Trip|a.jpg', 'Trip/Day 2|x.jpg', '|loose.txt'])
  })
  it('maps the tree under the drop target: folders parents-first, files by folder then name', async () => {
    const tree = await walkEntries<F>([dir('Trip', [file('b 10.jpg'), file('b 9.jpg'), dir('Day 2', [file('x.jpg')]), dir('Empty', [])]), file('loose.txt')])
    const plan = planUploads('Photos/2026', tree)
    expect(plan.dirs).toEqual(['Photos/2026/Trip', 'Photos/2026/Trip/Day 2', 'Photos/2026/Trip/Empty'])
    expect(plan.uploads.map(u => `${u.dir}/${u.name}`)).toEqual([
      'Photos/2026/loose.txt', 'Photos/2026/Trip/b 9.jpg', 'Photos/2026/Trip/b 10.jpg', 'Photos/2026/Trip/Day 2/x.jpg',
    ])
  })
  it('at the root and for plain file picks', () => {
    const plan = planUploads('', { files: [{ file: { name: 'b.txt' }, relDir: '' }, { file: { name: 'a.txt' }, relDir: '' }, { file: { name: 'c.txt' }, relDir: 'New/Deep' }], dirs: [] })
    expect(plan.dirs).toEqual(['New', 'New/Deep'])
    expect(plan.uploads.map(u => [u.dir, u.name])).toEqual([['', 'a.txt'], ['', 'b.txt'], ['New/Deep', 'c.txt']])
  })
})

describe('documents sorting', () => {
  const items = [
    item('b.pdf', false, { size: 10, modified: 3 }),
    item('Zed', true, { modified: 1 }),
    item('a 10.txt', false, { size: 30, modified: 1 }),
    item('a 9.txt', false, { size: 20, modified: 2 }),
    item('Alpha', true, { modified: 5 }),
  ]
  it('puts folders first and sorts names numerically', () => {
    expect(sortItems(items, { field: 'name', dir: 'asc' }).map(i => i.name)).toEqual(['Alpha', 'Zed', 'a 9.txt', 'a 10.txt', 'b.pdf'])
  })
  it('size sort keeps folders by name', () => {
    expect(sortItems(items, { field: 'size', dir: 'desc' }).map(i => i.name)).toEqual(['Alpha', 'Zed', 'a 10.txt', 'a 9.txt', 'b.pdf'])
  })
  it('header clicks reverse, a new field starts in its natural direction', () => {
    expect(toggleSort({ field: 'name', dir: 'asc' }, 'name')).toEqual({ field: 'name', dir: 'desc' })
    expect(toggleSort({ field: 'name', dir: 'asc' }, 'modified')).toEqual({ field: 'modified', dir: 'desc' })
  })
})

describe('documents moves and deletes', () => {
  it('refuses a folder into itself or below, and no-op moves', () => {
    const dirs = new Set(['Taxes'])
    expect(canMoveInto(['Taxes'], dirs, 'Taxes')).toBe(false)
    expect(canMoveInto(['Taxes'], dirs, 'Taxes/2025')).toBe(false)
    expect(canMoveInto(['Taxes'], dirs, 'Archive')).toBe(true)
    expect(canMoveInto(['Taxes/a.pdf'], new Set(), 'Taxes')).toBe(false)
    expect(canMoveInto(['Taxes/a.pdf'], new Set(), '')).toBe(true)
  })
  it('drops items inside another selected folder', () => {
    const picked = [item('Taxes', true), item('Taxes/2025', true), item('Taxes/2025/x.pdf'), item('Other.pdf')]
    expect(topLevelOnly(picked).map(i => i.path)).toEqual(['Taxes', 'Other.pdf'])
  })
})

describe('documents names', () => {
  it('splits extensions like Finder', () => {
    expect(splitName('letters.final.pdf')).toEqual({ stem: 'letters.final', ext: '.pdf' })
    expect(splitName('.env')).toEqual({ stem: '.env', ext: '' })
  })
  it('suffixes untitled folders and keep-both names', () => {
    expect(nextUntitledName(['untitled folder', 'Untitled Folder 2'])).toBe('untitled folder 3')
    expect(keepBothName('scan.pdf', ['scan.pdf', 'scan 2.pdf'])).toBe('scan 3.pdf')
  })
  it('middle-ellipsis keeps the extension', () => {
    const s = middleEllipsis('Quarterly statement for the account ending 4411.pdf', 30)
    expect(s.endsWith('4411.pdf')).toBe(true)
    expect([...s].length).toBe(30)
  })
  it('middle-ellipsis never splits emoji, surrogate pairs or combining marks', () => {
    const nfd = 'Cafe\u0301 '.repeat(8) + '👩‍👩‍👧 📄.pdf'
    const s = middleEllipsis(nfd, 16)
    expect(graphemes(s)).toHaveLength(16)
    expect(s.endsWith('👩‍👩‍👧 📄.pdf')).toBe(true)
    expect(s).not.toMatch(/\uD83D(?![\uDC00-\uDFFF])/)
    expect(graphemes('e\u0301📄')).toEqual(['e\u0301', '📄'])
    expect(middleEllipsis('日本語のとても長いファイル名の書類です.pdf', 12).endsWith('書類です.pdf')).toBe(true)
  })
  it('sorts special characters naturally (numeric, accent- and case-insensitive)', () => {
    const names = ['Ελληνικά', 'emoji 📄.txt', 'Café', 'cafe 10', 'cafe 9', 'Taxes — 2025', '#1', '日本語.pdf']
    const sorted = sortItems(names.map(n => item(n)), { field: 'name', dir: 'asc' }).map(i => i.name)
    expect(sorted.indexOf('cafe 9')).toBeLessThan(sorted.indexOf('cafe 10'))
    expect(sorted).toHaveLength(names.length)
  })
  it('refuses names the server would hide', () => {
    expect(nameProblem('.secret')).toBeTruthy()
    expect(nameProblem('movie.mp4.part')).toBeTruthy()
    expect(nameProblem('#recycle')).toBeTruthy()
    expect(nameProblem('@eaDir')).toBeTruthy()
    expect(nameProblem('a/b')).toBeTruthy()
    expect(nameProblem('Taxes 2025')).toBeNull()
  })
  it('maps extensions to kinds', () => {
    expect(fileKind({ isDir: false, name: 'x.DOCX' })).toBe('word')
    expect(fileKind({ isDir: false, name: 'x.xlsx' })).toBe('excel')
    expect(fileKind({ isDir: true, name: 'x.pdf' })).toBe('folder')
    expect(fileKind({ isDir: false, name: 'x.bin' })).toBe('other')
  })
})

describe('documents paths', () => {
  it('cleans ?folder= and labels paths', () => {
    expect(cleanFolder('/Taxes//2025/../x/')).toBe('Taxes/2025/x')
    expect(pathLabel('Taxes/2025')).toBe('Documents › Taxes › 2025')
    expect(isWithin('Taxes/2025', 'Taxes')).toBe(true)
    expect(isWithin('Taxes2', 'Taxes')).toBe(false)
  })
  it('round-trips special characters through ?folder=', () => {
    for (const f of ['Taxes — 2025', 'Ελληνικά/日本語', 'a # b', '100% & more', 'what?', 'c++ notes', 'emoji 📄']) {
      const qs = new URLSearchParams({ folder: f }).toString()
      expect(cleanFolder(new URLSearchParams(qs).get('folder'))).toBe(f)
      expect(pathLabel(f).endsWith(f.split('/').pop() ?? '')).toBe(true)
    }
  })
})
