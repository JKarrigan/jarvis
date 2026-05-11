import { getLogs } from '@/lib/httpLog'

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(getLogs())
}
