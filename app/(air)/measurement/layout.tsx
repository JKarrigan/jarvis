import { MetricDetail } from '@/app/_components/MetricDetail'

/**
 * The metric page lives in this layout, not in `[metric]/page.tsx`: Next remounts a
 * page for every new param, and moving from one metric to the next should keep the
 * range, slide the switcher's pill and swap the numbers in place.
 */
export default function MeasurementLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MetricDetail />
      {children}
    </>
  )
}
