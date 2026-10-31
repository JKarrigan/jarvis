import { NextRequest, NextResponse } from 'next/server'
import { numParam } from '@/lib/http'
import { addLog } from '@/lib/httpLog'

export const revalidate = 900

/** Two decimals (~1 km) is plenty for an area AQI and bounds the fetch-cache key space. */
function coord(raw: string | null | undefined, limit: number): number | null {
  const n = numParam(raw, -limit, limit)
  return n === null ? null : Math.round(n * 100) / 100
}

/**
 * GET [?lat=&lon=] (falls back to OUTDOOR_LAT / OUTDOOR_LON).
 * → { aqi, pm25Aqi }: `aqi` is Open-Meteo's overall US AQI (max of all
 * pollutants, as before); `pm25Aqi` is the PM2.5-only sub-index, comparable to
 * the indoor AQI computed from the sensor's PM2.5.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const fromQuery = params.has('lat') || params.has('lon')
  const lat = coord(fromQuery ? params.get('lat') : process.env.OUTDOOR_LAT, 90)
  const lon = coord(fromQuery ? params.get('lon') : process.env.OUTDOOR_LON, 180)
  if (lat === null || lon === null) {
    return NextResponse.json(
      fromQuery ? { aqi: null, pm25Aqi: null, error: 'Invalid lat/lon' } : { aqi: null, pm25Aqi: null },
      { status: fromQuery ? 400 : 200 },
    )
  }

  const qs = new URLSearchParams({ latitude: String(lat), longitude: String(lon), current: 'us_aqi,us_aqi_pm2_5' })
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${qs}`
  const ts = Date.now()
  try {
    const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(5000) })
    addLog({ ts, source: 'outdoor-aqi', method: 'GET', url, status: res.status, durationMs: Date.now() - ts })
    if (!res.ok) return NextResponse.json({ aqi: null, pm25Aqi: null })
    const data = await res.json() as { current?: { us_aqi?: number | null; us_aqi_pm2_5?: number | null } }
    return NextResponse.json({ aqi: data.current?.us_aqi ?? null, pm25Aqi: data.current?.us_aqi_pm2_5 ?? null })
  } catch (err) {
    addLog({ ts, source: 'outdoor-aqi', method: 'GET', url, status: null, durationMs: Date.now() - ts, error: String(err) })
    return NextResponse.json({ aqi: null, pm25Aqi: null })
  }
}
