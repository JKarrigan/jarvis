'use client'

import type { CollectionSummary } from './types'

/** Client wrappers around the server-side Jellyfin collection routes. */

export async function fetchCollections(): Promise<CollectionSummary[]> {
  const res = await fetch('/api/jellyfin/collections', { cache: 'no-store' })
  if (!res.ok) return []
  return (await res.json()) as CollectionSummary[]
}

/** Create a collection (optionally seeded with title ids); returns the new id or null. */
export async function createCollection(name: string, ids: string[] = []): Promise<string | null> {
  const res = await fetch('/api/jellyfin/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ids }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { id?: string }
  return data.id ?? null
}

export async function addToCollection(collectionId: string, titleId: string): Promise<boolean> {
  const res = await fetch(`/api/jellyfin/collections/${collectionId}/items?ids=${encodeURIComponent(titleId)}`, {
    method: 'POST',
  })
  return res.ok
}

export async function removeFromCollection(collectionId: string, titleId: string): Promise<boolean> {
  const res = await fetch(`/api/jellyfin/collections/${collectionId}/items?ids=${encodeURIComponent(titleId)}`, {
    method: 'DELETE',
  })
  return res.ok
}

export async function deleteCollection(collectionId: string): Promise<boolean> {
  const res = await fetch(`/api/jellyfin/collections/${collectionId}`, { method: 'DELETE' })
  return res.ok
}
