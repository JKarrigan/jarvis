import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 900

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get('lat') ?? process.env.OUTDOOR_LAT ?? null
  const lon = req.nextUrl.searchParams.get('lon') ?? process.env.OUTDOOR_LON ?? null
  if (!lat || !lon) return NextResponse.json({ aqi: null })

  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) return NextResponse.json({ aqi: null })
    const data = await res.json() as { current?: { us_aqi?: number } }
    return NextResponse.json({ aqi: data.current?.us_aqi ?? null })
  } catch {
    return NextResponse.json({ aqi: null })
  }
}
