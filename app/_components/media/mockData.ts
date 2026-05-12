import type { MediaItem } from './MediaCard'

export const MOCK_MOVIES: MediaItem[] = [
  { id: 'm1', title: 'Dune: Part Two', year: 2024, badge: '4K', posterColor: 'linear-gradient(135deg, #92400e, #b45309)', href: '/media/movies/m1' },
  { id: 'm2', title: 'Oppenheimer', year: 2023, badge: '4K', posterColor: 'linear-gradient(135deg, #1e3a5f, #374151)', href: '/media/movies/m2' },
  { id: 'm3', title: 'The Holdovers', year: 2023, posterColor: 'linear-gradient(135deg, #1c4a2a, #374151)', href: '/media/movies/m3' },
  { id: 'm4', title: 'Past Lives', year: 2023, posterColor: 'linear-gradient(135deg, #4a1c3a, #7c3aed)', href: '/media/movies/m4' },
  { id: 'm5', title: 'Poor Things', year: 2023, badge: 'HD', posterColor: 'linear-gradient(135deg, #1e3a5f, #0e7490)', href: '/media/movies/m5' },
  { id: 'm6', title: 'All of Us Strangers', year: 2023, posterColor: 'linear-gradient(135deg, #7f1d1d, #9a3412)', href: '/media/movies/m6' },
  { id: 'm7', title: 'Anatomy of a Fall', year: 2023, posterColor: 'linear-gradient(135deg, #1c2942, #374151)', href: '/media/movies/m7' },
  { id: 'm8', title: 'Killers of the Flower Moon', year: 2023, badge: '4K', posterColor: 'linear-gradient(135deg, #451a03, #78350f)', href: '/media/movies/m8' },
  { id: 'm9', title: 'Aftersun', year: 2022, posterColor: 'linear-gradient(135deg, #0c4a6e, #0369a1)', href: '/media/movies/m9' },
  { id: 'm10', title: 'The Banshees of Inisherin', year: 2022, posterColor: 'linear-gradient(135deg, #14532d, #166534)', href: '/media/movies/m10' },
  { id: 'm11', title: 'Everything Everywhere All at Once', year: 2022, badge: '4K', posterColor: 'linear-gradient(135deg, #6d28d9, #ec4899)', href: '/media/movies/m11' },
  { id: 'm12', title: 'Tár', year: 2022, posterColor: 'linear-gradient(135deg, #1e293b, #334155)', href: '/media/movies/m12' },
]

export const MOCK_TV: MediaItem[] = [
  { id: 'tv1', title: 'Shogun', subtitle: 'Season 1', year: 2024, badge: '4K', posterColor: 'linear-gradient(135deg, #7f1d1d, #450a0a)', href: '/media/tv/tv1' },
  { id: 'tv2', title: 'The Bear', subtitle: 'Season 3', year: 2024, posterColor: 'linear-gradient(135deg, #1c1917, #44403c)', href: '/media/tv/tv2' },
  { id: 'tv3', title: 'Slow Horses', subtitle: 'Season 4', year: 2024, posterColor: 'linear-gradient(135deg, #0f172a, #1e293b)', href: '/media/tv/tv3' },
  { id: 'tv4', title: 'Silo', subtitle: 'Season 2', year: 2024, badge: 'HD', posterColor: 'linear-gradient(135deg, #292524, #57534e)', href: '/media/tv/tv4' },
  { id: 'tv5', title: 'The Penguin', subtitle: 'Season 1', year: 2024, posterColor: 'linear-gradient(135deg, #1e3a5f, #0f172a)', href: '/media/tv/tv5' },
  { id: 'tv6', title: 'Severance', subtitle: 'Season 2', year: 2025, badge: '4K', posterColor: 'linear-gradient(135deg, #e2e8f0, #94a3b8)', href: '/media/tv/tv6' },
  { id: 'tv7', title: 'The Last of Us', subtitle: 'Season 2', year: 2025, posterColor: 'linear-gradient(135deg, #1a2e1a, #14532d)', href: '/media/tv/tv7' },
  { id: 'tv8', title: 'Succession', subtitle: 'Complete Series', year: 2023, posterColor: 'linear-gradient(135deg, #1c1917, #292524)', href: '/media/tv/tv8' },
]

export const MOCK_MUSIC: MediaItem[] = [
  { id: 'mu1', title: 'Short n\' Sweet', subtitle: 'Sabrina Carpenter', year: 2024, posterColor: 'linear-gradient(135deg, #fda4af, #fb7185)', href: '/media/music/mu1' },
  { id: 'mu2', title: 'Cowboy Carter', subtitle: 'Beyoncé', year: 2024, posterColor: 'linear-gradient(135deg, #92400e, #d97706)', href: '/media/music/mu2' },
  { id: 'mu3', title: 'The Great Impersonator', subtitle: 'Halsey', year: 2024, posterColor: 'linear-gradient(135deg, #1e293b, #475569)', href: '/media/music/mu3' },
  { id: 'mu4', title: 'GNX', subtitle: 'Kendrick Lamar', year: 2024, posterColor: 'linear-gradient(135deg, #0f172a, #1e3a5f)', href: '/media/music/mu4' },
  { id: 'mu5', title: 'Bright Future', subtitle: 'Adrianne Lenker', year: 2024, posterColor: 'linear-gradient(135deg, #fef3c7, #d97706)', href: '/media/music/mu5' },
  { id: 'mu6', title: 'Manning Fireworks', subtitle: 'MJ Lenderman', year: 2024, posterColor: 'linear-gradient(135deg, #1c4a2a, #166534)', href: '/media/music/mu6' },
]

export const MOCK_PHOTOS: MediaItem[] = [
  { id: 'ph1', title: 'Summer 2024', subtitle: '142 photos', posterColor: 'linear-gradient(135deg, #0ea5e9, #7dd3fc)', href: '/media/photos/ph1' },
  { id: 'ph2', title: 'Thanksgiving', subtitle: '38 photos', posterColor: 'linear-gradient(135deg, #92400e, #fbbf24)', href: '/media/photos/ph2' },
  { id: 'ph3', title: 'Road Trip', subtitle: '217 photos', posterColor: 'linear-gradient(135deg, #7c3aed, #a78bfa)', href: '/media/photos/ph3' },
  { id: 'ph4', title: 'Birthday Party', subtitle: '64 photos', posterColor: 'linear-gradient(135deg, #db2777, #f472b6)', href: '/media/photos/ph4' },
  { id: 'ph5', title: 'Winter Hike', subtitle: '91 photos', posterColor: 'linear-gradient(135deg, #1d4ed8, #93c5fd)', href: '/media/photos/ph5' },
  { id: 'ph6', title: 'Concert Night', subtitle: '29 photos', posterColor: 'linear-gradient(135deg, #4c1d95, #7c3aed)', href: '/media/photos/ph6' },
]

export const MOCK_BOOKS: MediaItem[] = [
  { id: 'bk1', title: 'The Road', subtitle: 'Cormac McCarthy', badge: 'EPUB', posterColor: 'linear-gradient(135deg, #1c1917, #57534e)', href: '/media/books/bk1' },
  { id: 'bk2', title: 'A Little Life', subtitle: 'Hanya Yanagihara', badge: 'EPUB', posterColor: 'linear-gradient(135deg, #1e3a5f, #0f172a)', href: '/media/books/bk2' },
  { id: 'bk3', title: 'Project Hail Mary', subtitle: 'Andy Weir', badge: 'Audio', posterColor: 'linear-gradient(135deg, #0c4a6e, #0369a1)', href: '/media/books/bk3' },
  { id: 'bk4', title: 'The Woman in Me', subtitle: 'Britney Spears', badge: 'Audio', posterColor: 'linear-gradient(135deg, #9d174d, #db2777)', href: '/media/books/bk4' },
  { id: 'bk5', title: 'Demon Copperhead', subtitle: 'Barbara Kingsolver', badge: 'EPUB', posterColor: 'linear-gradient(135deg, #14532d, #166534)', href: '/media/books/bk5' },
  { id: 'bk6', title: 'Tomorrow, and Tomorrow, and Tomorrow', subtitle: 'Gabrielle Zevin', badge: 'EPUB', posterColor: 'linear-gradient(135deg, #6d28d9, #4c1d95)', href: '/media/books/bk6' },
]

export const MOCK_CONTINUE_WATCHING: MediaItem[] = [
  { id: 'cw1', title: 'Severance', subtitle: 'S2 E4 · 34 min left', badge: 'Resume', posterColor: 'linear-gradient(135deg, #e2e8f0, #94a3b8)', href: '/media/tv/tv6' },
  { id: 'cw2', title: 'Dune: Part Two', subtitle: '1h 12m left', badge: 'Resume', posterColor: 'linear-gradient(135deg, #92400e, #b45309)', href: '/media/movies/m1' },
  { id: 'cw3', title: 'Project Hail Mary', subtitle: 'Chapter 14', badge: 'Resume', posterColor: 'linear-gradient(135deg, #0c4a6e, #0369a1)', href: '/media/books/bk3' },
]
