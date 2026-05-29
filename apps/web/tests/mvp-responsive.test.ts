import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ─── Import Actual Web Components to Ensure Compilation & Integration ───────
import { LotReservationForm } from '@/components/projects/LotReservationForm'
import { PendingApprovalsPanel } from '@/components/dashboard/approvals/pending-approvals-panel'
import { GenerationWizard } from '@/components/dashboard/documents/generation-wizard'

describe('T082 - Responsive Reservation Form Layout Verification', () => {
  it('verifies that LotReservationForm compiles, imports, and is exported as a functional component', () => {
    expect(LotReservationForm).toBeTypeOf('function')
  })

  it('guarantees scrolling and responsive grid/flex layout rules in the source file', () => {
    const filePath = path.resolve(__dirname, '../src/components/projects/LotReservationForm.tsx')
    const sourceCode = fs.readFileSync(filePath, 'utf8')

    // Form must have mobile-first wrapper with scroll limits
    expect(sourceCode).toContain('max-h-[80vh]')
    expect(sourceCode).toContain('overflow-y-auto')

    // Layout grid must transition from 1 column on mobile to 2 columns on desktop
    expect(sourceCode).toContain('grid grid-cols-1 md:grid-cols-2 gap-4')

    // Submit and cancel buttons container must stack vertically on mobile and stretch full width, and transition to horizontal row on desktop
    expect(sourceCode).toContain('flex flex-col sm:flex-row justify-end gap-2 pt-4 w-full')
    expect(sourceCode).toContain('className="w-full sm:w-auto"')
  })
})

describe('T083 - Responsive Admin Approval Layout Verification', () => {
  it('verifies that PendingApprovalsPanel compiles, imports, and is exported as a functional component', () => {
    expect(PendingApprovalsPanel).toBeTypeOf('function')
  })

  it('guarantees responsive items flex container transitions and actions stretching in the source file', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/components/dashboard/approvals/pending-approvals-panel.tsx'
    )
    const sourceCode = fs.readFileSync(filePath, 'utf8')

    // Item container must stack flex-col on mobile and transition to flex-row on desktop
    expect(sourceCode).toContain(
      'flex flex-col md:flex-row justify-between items-start md:items-center gap-4'
    )

    // Action buttons container must stretch to full width on mobile (flex w-full) and auto-wrap on desktop
    expect(sourceCode).toContain('flex w-full md:w-auto gap-2 justify-stretch sm:justify-end')

    // Action buttons must stretch to fill the container equally on mobile (flex-1) and return to initial on desktop
    expect(sourceCode).toContain('flex-1 md:flex-initial justify-center')
  })
})

describe('T084 - Responsive Document Generation Wizard Verification', () => {
  it('verifies that GenerationWizard compiles, imports, and is exported as a functional component', () => {
    expect(GenerationWizard).toBeTypeOf('function')
  })

  it('guarantees responsive grids, scrollareas, and column span scaling for mobile stacking in the source file', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/components/dashboard/documents/generation-wizard.tsx'
    )
    const sourceCode = fs.readFileSync(filePath, 'utf8')

    // Step 1: Template selection grid must wrap from 1 column on mobile to 2 on tablet and 3 on desktop
    expect(sourceCode).toContain('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4')

    // Step 2: Scroll area must exist to constrain height on mobile screen sizes
    expect(sourceCode).toContain('ScrollArea className="h-[60vh] pr-4"')

    // Step 2: Layout inputs grid must stack vertically on mobile (grid-cols-1) and double column on screens sm+
    expect(sourceCode).toContain('grid grid-cols-1 sm:grid-cols-2 gap-3')

    // Step 2: Children inputs spanning two columns must be sm:col-span-2 or col-span-1 sm:col-span-2 to avoid breaking grid-cols-1 on mobile
    expect(sourceCode).toContain('col-span-1 sm:col-span-2')
    expect(sourceCode).not.toContain('className="col-span-2"') // should not have raw col-span-2 class on layout divs
  })
})
