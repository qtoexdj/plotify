import { notFound } from 'next/navigation'

import { SheetAccessibilityFixture } from './sheet-accessibility-fixture'

export const dynamic = 'force-dynamic'

export default function SheetFixturePage() {
  if (process.env.NODE_ENV !== 'development' && process.env.PLOTIFY_E2E_FIXTURES !== '1') {
    notFound()
  }
  return <SheetAccessibilityFixture />
}
