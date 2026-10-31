import type { MetadataRoute } from 'next'

// Web app manifest (served at /manifest.webmanifest; Next adds the <link>).
// Installing needs HTTPS on Android/Chrome; over plain LAN HTTP the realistic
// route is iOS Safari "Add to Home Screen", which uses app/apple-icon.png and
// the appleWebApp metadata in app/layout.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Home',
    short_name: 'Home',
    description: 'Home server: air quality, lights, files, media and photos',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // The glyph sits inside the maskable safe zone, so the same file works masked.
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
