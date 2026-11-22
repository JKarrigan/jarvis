import { AirSidebar } from '@/app/_components/AirSidebar'
import { PollingProvider } from '@/app/_components/PollingProvider'

// PollingProvider is mounted here rather than in the root layout so the media app never
// polls the air-quality API or downloads its history. The layout owns the page background
// and the bottom padding that clears the phone tab bar; pages only lay out their content.
export default function AirLayout({ children }: { children: React.ReactNode }) {
  return (
    <PollingProvider>
      <div className="min-h-screen bg-air-bg text-zinc-100 md:flex">
        <AirSidebar />
        <div className="min-w-0 flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
      </div>
    </PollingProvider>
  )
}
