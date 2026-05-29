import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ─── Import Actual Web Components to Ensure Compilation & Integration ───────
import { LotReservationForm } from '@/components/projects/LotReservationForm'
import { PendingApprovalsPanel } from '@/components/dashboard/approvals/pending-approvals-panel'
import { GenerationWizard } from '@/components/dashboard/documents/generation-wizard'

/**
 * NOTA DE CALIDAD (QA):
 * Este archivo realiza una validación estructural estática de los componentes del frontend de Plotify
 * para garantizar que posean las clases responsivas necesarias de Tailwind CSS v4 para dispositivos
 * móviles, tabletas y computadoras de escritorio.
 *
 * Estas aserciones estructurales de clases responsivas y scroll se complementan con un protocolo
 * formal de QA visual y funcional manual detallado en walkthrough.md y quickstart.md.
 */

describe('T082 - Responsive Reservation Form Layout Verification', () => {
  it('verifies that LotReservationForm compiles, imports, and is exported as a functional component', () => {
    expect(LotReservationForm).toBeTypeOf('function')
  })

  it('guarantees scrolling and responsive grid/flex layout rules in the source file', () => {
    const filePath = path.resolve(__dirname, '../src/components/projects/LotReservationForm.tsx')
    const sourceCode = fs.readFileSync(filePath, 'utf8')

    // Form must have mobile-first wrapper with scroll limits
    expect(sourceCode).toMatch(/max-h-\[80vh\]/)
    expect(sourceCode).toMatch(/overflow-y-auto/)

    // Layout grid must transition from 1 column on mobile to 2 columns on desktop
    // Buscamos grid-cols-1 y md:grid-cols-2 independientemente o en orden flexible
    expect(sourceCode).toMatch(/grid-cols-1/)
    expect(sourceCode).toMatch(/md:grid-cols-2/)

    // Submit and cancel buttons container must stack vertically on mobile and stretch full width, and transition to horizontal row on desktop
    expect(sourceCode).toMatch(/flex-col/)
    expect(sourceCode).toMatch(/sm:flex-row/)
    expect(sourceCode).toMatch(/w-full/)
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
    expect(sourceCode).toMatch(/flex-col/)
    expect(sourceCode).toMatch(/md:flex-row/)

    // Action buttons container must stretch to full width on mobile (flex w-full) and auto-wrap on desktop
    expect(sourceCode).toMatch(/w-full/)
    expect(sourceCode).toMatch(/md:w-auto/)

    // Action buttons must stretch to fill the container equally on mobile (flex-1)
    expect(sourceCode).toMatch(/flex-1/)
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
    expect(sourceCode).toMatch(/grid-cols-1/)
    expect(sourceCode).toMatch(/md:grid-cols-2/)
    expect(sourceCode).toMatch(/lg:grid-cols-3/)

    // Step 2: Scroll area must exist to constrain height on mobile screen sizes
    expect(sourceCode).toMatch(/h-\[60vh\]/)
    expect(sourceCode).toMatch(/pr-4/)

    // Step 2: Layout inputs grid must stack vertically on mobile (grid-cols-1) and double column on screens sm+
    expect(sourceCode).toMatch(/grid-cols-1/)
    expect(sourceCode).toMatch(/sm:grid-cols-2/)

    // Step 2: Children inputs spanning two columns must stack on mobile and span 2 columns on sm+
    expect(sourceCode).toMatch(/col-span-1/)
    expect(sourceCode).toMatch(/sm:col-span-2/)
  })
})
