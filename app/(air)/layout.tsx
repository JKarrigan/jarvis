import { AirSidebar } from '@/app/_components/AirSidebar'
import { PollingProvider } from '@/app/_components/PollingProvider'
import { EventAlerts } from '@/app/_components/events/EventAlerts'
import { AirPageTransition } from '@/app/_components/air/motion'

// PollingProvider is mounted here rather than in the root layout so the media app never
// polls the air-quality API or downloads its history. The layout owns the page background
// and the bottom padding that clears the phone tab bar; pages only lay out their content.
// EventAlerts toasts new air-quality warnings on every Home page. Only the page fades on
// navigation (AirPageTransition): the sidebar, tab bar and toasts stay put.
export default function AirLayout({ children }: { children: React.ReactNode }) {
  return (
    <PollingProvider>
      <div className="min-h-screen bg-air-bg text-zinc-100 md:flex">
        <AirSidebar />
        <div className="min-w-0 flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
          <AirPageTransition>{children}</AirPageTransition>
        </div>
      </div>
      <EventAlerts />
    </PollingProvider>
  )
}
