/**
 * Hue-derived gradient artwork — deterministic per title, per the Reel spec.
 * Pure + client-safe so it can be imported from both server (SSR mappers in
 * lib/jellyfinServer.ts) and client components. Real Jellyfin posterUrl/backdropUrl
 * remain the <img> src; these gradients are the loading state + permanent fallback.
 */

/** Stable 0–360 hue from any id string. */
export function hueFromId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h % 360
}

/** Portrait poster (2:3) fallback. */
export function poster(hue: number): string {
  return `linear-gradient(160deg, hsl(${hue} 46% 31%) 0%, hsl(${hue + 18} 54% 17%) 55%, hsl(${hue + 8} 60% 8%) 100%)`
}

/** Wide backdrop (deliberately framed differently from the poster). */
export function backdrop(hue: number): string {
  return `radial-gradient(120% 150% at 80% 14%, hsl(${hue + 46} 52% 33%) 0%, transparent 58%), linear-gradient(100deg, hsl(${hue} 36% 19%) 0%, hsl(${hue + 22} 28% 9%) 68%, #0a0810 100%)`
}

/** Fallback backdrop when a title has no Backdrop image (defocused Primary look). */
export function backdropFallback(hue: number): string {
  return `radial-gradient(85% 95% at 50% 30%, hsl(${hue} 38% 26%) 0%, hsl(${hue + 10} 44% 9%) 80%)`
}

/** Cast / crew / profile avatar. */
export function avatar(hue: number): string {
  return `linear-gradient(135deg, hsl(${hue} 40% 42%), hsl(${hue + 30} 45% 26%))`
}

/** Collection tile art. */
export function collArt(hue: number): string {
  return `radial-gradient(120% 130% at 80% 10%, hsl(${hue + 30} 58% 42%) 0%, transparent 56%), linear-gradient(135deg, hsl(${hue} 52% 30%) 0%, hsl(${hue + 18} 46% 12%) 72%, #0a0810 100%)`
}

/** Collection accent text color. */
export function collColor(hue: number): string {
  return `hsl(${hue} 64% 66%)`
}

/** Top-left sheen overlaid on glass posters. */
export const POSTER_SHEEN = 'radial-gradient(80% 50% at 28% 12%, rgba(255,255,255,0.16), transparent 58%)'

/** Convenience: poster gradient straight from an id. */
export function posterForId(id: string): string {
  return poster(hueFromId(id))
}

/** Convenience: backdrop gradient straight from an id. */
export function backdropForId(id: string): string {
  return backdrop(hueFromId(id))
}

/** Rewrite a Jellyfin image URL's maxWidth. Backdrop URLs are built hero-res (4K);
    card-size renders use this to avoid downloading and decoding 4K into a thumbnail. */
export function resizeImage(url: string | undefined, maxWidth: number): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    u.searchParams.set('maxWidth', String(maxWidth))
    return u.toString()
  } catch {
    return url
  }
}
