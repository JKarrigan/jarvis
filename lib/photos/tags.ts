// Free-form photo tags: normalisation and list helpers shared by the API routes, the
// catalog and the client (optimistic updates). Client-safe: no server imports.
//
// A tag is stored as typed (trimmed, inner whitespace collapsed) but matched
// case-insensitively through its key, so "Beach" and "beach" are the same tag.

export const MAX_TAG_LENGTH = 40
/** Tags on one item (PATCH `{ tags }`). */
export const MAX_TAGS_PER_ITEM = 100
/** Tags in one bulk `add` / `remove` list. */
export const MAX_TAGS_PER_REQUEST = 50

// C0/C1 control characters plus the Unicode line/paragraph separators.
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/

/**
 * Normalise a user-typed tag: NFC, trimmed, runs of whitespace collapsed to one space,
 * 1–40 characters, no control characters. Returns null when the value isn't a valid tag.
 */
export function normalizeTag(v: unknown): string | null {
  if (typeof v !== 'string') return null
  // Tabs/newlines are just whitespace; any other control character rejects the tag.
  const s = v.normalize('NFC').replace(/[\t\n\r\f\v]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s || CONTROL_RE.test(s)) return null
  const len = [...s].length
  return len >= 1 && len <= MAX_TAG_LENGTH ? s : null
}

/** Case-insensitive identity of a (normalised) tag. */
export function tagKey(tag: string): string {
  return tag.toLowerCase()
}

/**
 * Validate a list of tags: an array of valid tags, at most `max` long. Duplicates (by key)
 * are dropped, keeping the first spelling. Returns null for anything else.
 */
export function parseTagList(v: unknown, max = MAX_TAGS_PER_REQUEST): string[] | null {
  if (!Array.isArray(v) || v.length > max) return null
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of v) {
    const t = normalizeTag(raw)
    if (t === null) return null
    const k = tagKey(t)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

export function hasTag(tags: readonly string[], tag: string): boolean {
  const k = tagKey(tag)
  return tags.some(t => tagKey(t) === k)
}

/** Sort for display: case-insensitive, then by spelling. */
export function sortTags(tags: string[]): string[] {
  return tags.sort((a, b) => {
    const ka = tagKey(a)
    const kb = tagKey(b)
    return ka < kb ? -1 : ka > kb ? 1 : a < b ? -1 : a > b ? 1 : 0
  })
}

/** `tags` plus `add` (skipping ones already present in any case) minus `remove`, sorted. */
export function applyTagChange(tags: readonly string[], add: readonly string[] = [], remove: readonly string[] = []): string[] {
  const drop = new Set(remove.map(tagKey))
  const next = tags.filter(t => !drop.has(tagKey(t)))
  for (const t of add) if (!drop.has(tagKey(t)) && !hasTag(next, t)) next.push(t)
  return sortTags(next)
}
