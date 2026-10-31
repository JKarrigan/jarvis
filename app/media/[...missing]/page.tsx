import { notFound } from 'next/navigation'

// Unmatched /media/* URLs render the Reel-styled media/not-found.tsx (inside the media
// shell) instead of the app-wide 404. Real routes, e.g. /media/photos, take precedence.
export default function MissingMediaPage() {
  notFound()
}
