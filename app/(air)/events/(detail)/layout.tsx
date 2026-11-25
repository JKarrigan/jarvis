import { EventDetailRoute } from '@/app/_components/events/EventDetail'

/**
 * The event page lives in this layout, not in `[id]/page.tsx`: Next remounts a page
 * for every new param, and moving to the newer or older event should keep this one
 * on screen, dimmed, until the next has loaded. The `(detail)` group keeps the
 * layout off the events log, so arriving from the log starts from a placeholder.
 */
export default function EventDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EventDetailRoute />
      {children}
    </>
  )
}
