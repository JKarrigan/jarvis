import { AirSidebar } from '@/app/_components/AirSidebar'
import { PollingProvider } from '@/app/_components/PollingProvider'

// Mounted here rather than in the root layout so the media app never polls the
// air-quality API or downloads its history.
export default function AirLayout({ children }: { children: React.ReactNode }) {
  return (
    <PollingProvider>
      <div className="md:flex">
        <AirSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </PollingProvider>
  )
}
