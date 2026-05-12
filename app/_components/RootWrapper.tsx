'use client'

import { usePathname } from 'next/navigation'

const MEDIA_GRADIENT = 'linear-gradient(to right, #0b0a14 0%, #0b0a14 58%, #0d0b1a 67%, #100c22 75%, #130d2c 84%, #150e30 92%, #160e32 100%)'

export function RootWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMedia = pathname.startsWith('/media')

  return (
    <div
      className="md:flex"
      style={isMedia ? { background: MEDIA_GRADIENT, minHeight: '100vh' } : undefined}
    >
      {children}
    </div>
  )
}
