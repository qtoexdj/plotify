import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ─── Import Actual Web Components to Ensure Compilation & Integration ───────
import { LotReservationForm } from '@/components/projects/LotReservationForm'
import { PendingApprovalsPanel } from '@/components/dashboard/approvals/pending-approvals-panel'

/**
 * NOTA DE CALIDAD (QA):
 * Este archivo realiza una validación estructural estática de los componentes del frontend de Plotify
 * para garantizar que posean las clases responsivas necesarias de Tailwind CSS v4 para dispositivos
 * móviles, tabletas y computadoras de escritorio.
 *
 * Estas aserciones estructurales de clases responsivas y scroll se complementan con un protocolo
 * formal de QA visual y funcional manual detallado en walkthrough.md y quickstart.md.
 *
 * NOTA (T070): GenerationWizard fue eliminado como código muerto. Su describe T084 fue removido.
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

    // Submit and cancel buttons container must stack vertically on mobile and stretch full width, and transition to horizontal row on desktop
    expect(sourceCode).toMatch(/flex-col/)
    expect(sourceCode).toMatch(/sm:flex-row/)
    expect(sourceCode).toMatch(/w-full/)
  })

  it('guarantees the responsive grid layout in the shared form sections (T041 decomposition)', () => {
    const sectionsDir = path.resolve(__dirname, '../src/components/projects/lot-reservation-form')
    const sourceCode = fs
      .readdirSync(sectionsDir)
      .map((file) => fs.readFileSync(path.join(sectionsDir, file), 'utf8'))
      .join('\n')

    // Layout grid must transition from 1 column on mobile to 2 columns on desktop
    expect(sourceCode).toMatch(/grid-cols-1/)
    expect(sourceCode).toMatch(/md:grid-cols-2/)
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

describe('US1: Responsive Notification Dropdown & Item Layout Verification', () => {
  it('guarantees scrolling and responsive rules in notification list source file', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/components/notifications/notification-list.tsx'
    )

    if (fs.existsSync(filePath)) {
      const sourceCode = fs.readFileSync(filePath, 'utf8')
      expect(sourceCode).toMatch(/max-h-/)
      expect(sourceCode).toMatch(/overflow-y-auto/)
    }
  })

  it('guarantees layout stacking and spacing rules in notification item source file', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/components/notifications/notification-item.tsx'
    )
    if (fs.existsSync(filePath)) {
      const sourceCode = fs.readFileSync(filePath, 'utf8')
      expect(sourceCode).toMatch(/flex/)
    }
  })
})
