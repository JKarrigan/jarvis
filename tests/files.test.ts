import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// lib/files reads FILES_ROOT at import time: point it at a temp tree first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-test-'))
vi.stubEnv('FILES_ROOT', root)
vi.stubEnv('NAS_REQUIRE_MOUNT', '')
const files = await import('@/lib/files')
const mount = await import('@/lib/mount')

function write(rel: string, bytes: number): void {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, Buffer.alloc(bytes))
}

beforeAll(() => {
  write('a.txt', 10)
  write('.hidden', 5)
  write('upload.pdf.part', 7)
  write('#recycle/old.txt', 100)
  write('#snapshot/x.txt', 100)
  write('@eaDir/thumb.jpg', 100)
  write('Taxes/2025/w2.pdf', 20)
  write('Taxes/2025/.DS_Store', 3)
  write('Taxes/2025/@eaDir/w2.pdf/SYNOFILE_THUMB_M.jpg', 50)
  write('Taxes/notes.md', 30)
  fs.mkdirSync(path.join(root, 'Empty'))
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('isHiddenName', () => {
  it('hides dot-entries, Synology housekeeping and upload temps', () => {
    for (const n of ['.DS_Store', '.photos-library', '#recycle', '#snapshot', '@eaDir', 'x.part', 'Movie.MKV.PART']) {
      expect(files.isHiddenName(n)).toBe(true)
    }
  })

  it('keeps ordinary names', () => {
    for (const n of ['Taxes', 'a.txt', 'recycle', '#notes', 'eaDir', 'archive.part1.rar', 'partial.pdf']) {
      expect(files.isHiddenName(n)).toBe(false)
    }
  })
})

describe('listDirectory / searchEntries', () => {
  it('omits hidden entries and counts only visible children', async () => {
    const entries = await files.listDirectory('')
    expect(entries.map(e => e.name).sort()).toEqual(['Empty', 'Taxes', 'a.txt'])
    const taxes = entries.find(e => e.name === 'Taxes')
    expect(taxes?.kind === 'dir' && taxes.childCount).toBe(2)
    const y2025 = (await files.listDirectory('Taxes')).find(e => e.name === '2025')
    expect(y2025?.kind === 'dir' && y2025.childCount).toBe(1)
  })

  it('search never descends into or returns hidden entries', async () => {
    const { results } = await files.searchEntries('', 't')
    const paths = results.map(r => r.relPath)
    expect(paths).toContain('a.txt')
    expect(paths.some(p => p.includes('#') || p.includes('@eaDir') || p.endsWith('.part'))).toBe(false)
    expect((await files.searchEntries('', 'thumb')).results).toEqual([])
  })
})

describe('folderStats', () => {
  it('counts visible files, folders and bytes recursively', async () => {
    expect(await files.folderStats('')).toEqual({ files: 3, folders: 3, bytes: 60, truncated: false })
    expect(await files.folderStats('Taxes')).toEqual({ files: 2, folders: 1, bytes: 50, truncated: false })
    expect(await files.folderStats('Empty')).toEqual({ files: 0, folders: 0, bytes: 0, truncated: false })
  })

  it('reports a file as one file', async () => {
    expect(await files.folderStats('Taxes/notes.md')).toEqual({ files: 1, folders: 0, bytes: 30, truncated: false })
  })

  it('stops (truncated) when aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    expect((await files.folderStats('', ac.signal)).truncated).toBe(true)
  })

  it('clamps paths to the root', async () => {
    await expect(files.folderStats('../../etc')).rejects.toMatchObject({ code: 'ENOENT' }) // <root>/etc
    expect((await files.folderStats('../../')).files).toBe(3)
  })
})

describe('mount guard', () => {
  it('a plain temp directory is not a mount point', async () => {
    expect(await mount.isMountPoint(root)).toBe(false)
    expect(await mount.isMountPoint(path.join(root, 'Taxes'))).toBe(false)
  })

  it('errors count as not mounted', async () => {
    expect(await mount.isMountPoint(path.join(root, 'nope'))).toBe(false)
    expect(await mount.isMountPoint(path.join(root, 'a.txt'))).toBe(false)
  })

  it('storageOnline follows NAS_REQUIRE_MOUNT', async () => {
    expect(await files.storageOnline()).toBe(true)
    vi.stubEnv('NAS_REQUIRE_MOUNT', '1')
    try {
      expect(await files.storageOnline()).toBe(false)
      const res = await files.assertStorageOnline()
      expect(res?.status).toBe(503)
      expect(await res?.json()).toEqual({ error: 'Storage offline', offline: true })
    } finally {
      vi.stubEnv('NAS_REQUIRE_MOUNT', '')
    }
    expect(await files.assertStorageOnline()).toBeNull()
  })

  it('a missing root is offline even without the flag', async () => {
    expect(await mount.rootOnline(path.join(root, 'missing'))).toBe(false)
  })
})

describe('thumbCacheKey', () => {
  it('is a stable sha1 of path + size + mtime', () => {
    const k = files.thumbCacheKey('Taxes/2025/w2.pdf', 't', 1_700_000_000_123)
    expect(k).toMatch(/^[0-9a-f]{40}$/)
    expect(files.thumbCacheKey('Taxes/2025/w2.pdf', 't', 1_700_000_000_123)).toBe(k)
    // Pinned so an accidental format change (which would orphan every cached thumb) is noticed.
    expect(k).toBe('67aeaa651955dae25aff2d45aad373b6858ab117')
    // Equivalent spellings of the path and sub-millisecond mtimes share the entry.
    expect(files.thumbCacheKey('/Taxes//2025/./w2.pdf', 't', 1_700_000_000_123.9)).toBe(k)
  })

  it('changes with size, mtime and path', () => {
    const k = files.thumbCacheKey('a.pdf', 't', 1000)
    expect(files.thumbCacheKey('a.pdf', 'p', 1000)).not.toBe(k)
    expect(files.thumbCacheKey('a.pdf', 't', 2000)).not.toBe(k)
    expect(files.thumbCacheKey('b.pdf', 't', 1000)).not.toBe(k)
  })

  it('shards cache paths under FILES_CACHE', () => {
    const k = files.thumbCacheKey('a.pdf', 't', 1000)
    expect(files.thumbCachePath(k)).toBe(path.join(files.FILES_CACHE, k.slice(0, 2), `${k}.webp`))
  })
})

describe('deleteEntry and the share recycle bin', () => {
  const write = (rel: string, body = 'x') => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), body)
  }

  it('deletes permanently when the share has no #recycle', async () => {
    // The shared fixture tree has a #recycle (hidden-entry tests): set it aside here.
    const bin = path.join(root, '#recycle')
    const held = path.join(root, 'recycle-held')
    const hadBin = fs.existsSync(bin)
    if (hadBin) fs.renameSync(bin, held)
    try {
      write('bin-test/gone.txt')
      expect(await files.recycleAvailable()).toBe(false)
      expect(await files.deleteEntry('bin-test/gone.txt')).toEqual({ recycled: false })
      expect(fs.existsSync(path.join(root, 'bin-test/gone.txt'))).toBe(false)
    } finally {
      if (hadBin) fs.renameSync(held, bin)
    }
  })

  it('moves files and folders into #recycle/<folder> and never overwrites earlier copies', async () => {
    fs.mkdirSync(path.join(root, '#recycle'), { recursive: true })
    expect(await files.recycleAvailable()).toBe(true)

    write('bin-test/Tax/return.pdf', 'first')
    expect(await files.deleteEntry('bin-test/Tax/return.pdf')).toEqual({ recycled: true })
    write('bin-test/Tax/return.pdf', 'second')
    await files.deleteEntry('bin-test/Tax/return.pdf')
    const binDir = path.join(root, '#recycle/bin-test/Tax')
    expect(fs.readFileSync(path.join(binDir, 'return.pdf'), 'utf8')).toBe('first')
    expect(fs.readFileSync(path.join(binDir, 'return (2).pdf'), 'utf8')).toBe('second')

    write('bin-test/Old/a.txt')
    expect(await files.deleteEntry('bin-test/Old')).toEqual({ recycled: true })
    expect(fs.existsSync(path.join(root, 'bin-test/Old'))).toBe(false)
    expect(fs.existsSync(path.join(root, '#recycle/bin-test/Old/a.txt'))).toBe(true)
  })

  it('removes an empty folder outright with recursive=false', async () => {
    fs.mkdirSync(path.join(root, 'bin-test/Empty'), { recursive: true })
    expect(await files.deleteEntry('bin-test/Empty', { recursive: false })).toEqual({ recycled: false })
    expect(fs.existsSync(path.join(root, '#recycle/bin-test/Empty'))).toBe(false)
  })
})
