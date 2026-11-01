import { describe, expect, it } from 'vitest'
import type { DocItem } from '@/app/_components/media/documents/api'
import { cleanFolder, isWithin, pathLabel } from '@/app/_components/media/documents/api'
import {
  fileKind, keepBothName, middleEllipsis, nameProblem, nextUntitledName, splitName,
} from '@/app/_components/media/documents/fileKinds'
import {
  EMPTY_SELECTION, applyClick, canMoveInto, pruneSelection, sortItems, toggleSort, topLevelOnly,
} from '@/app/_components/media/documents/selection'

const item = (path: string, isDir = false, extra: Partial<DocItem> = {}): DocItem => ({
  path, name: path.slice(path.lastIndexOf('/') + 1), isDir, size: 0, modified: 0, childCount: 0,
  parent: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '', ...extra,
})

describe('documents selection', () => {
  const keys = ['a', 'b', 'c', 'd']
  it('click selects only, meta toggles, shift ranges from the anchor', () => {
    let s = applyClick(EMPTY_SELECTION, keys, 'b')
    expect([...s.selected]).toEqual(['b'])
    s = applyClick(s, keys, 'd', { meta: true })
    expect([...s.selected].sort()).toEqual(['b', 'd'])
    s = applyClick(s, keys, 'a', { shift: true })
    expect([...s.selected]).toEqual(['a', 'b', 'c', 'd'])
    s = applyClick(s, keys, 'b', { meta: true })
    expect(s.selected.has('b')).toBe(false)
  })
  it('prunes keys that left the list and keeps the same object otherwise', () => {
    const s = applyClick(EMPTY_SELECTION, keys, 'c')
    expect(pruneSelection(s, keys)).toBe(s)
    expect(pruneSelection(s, ['a']).selected.size).toBe(0)
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
})
