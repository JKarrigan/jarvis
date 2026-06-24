import { AirSidebar } from '@/app/_components/AirSidebar'

export default function AirLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:flex">
      <AirSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
