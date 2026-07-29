// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSetBreadcrumbLabel } from '@/components/dashboard/breadcrumb-context'

function BreadcrumbWriter() {
  useSetBreadcrumbLabel('Proyecto de prueba')
  return <div>contenido</div>
}

afterEach(cleanup)

describe('useSetBreadcrumbLabel', () => {
  it('no bloquea la página durante una transición sin provider', () => {
    expect(() => render(<BreadcrumbWriter />)).not.toThrow()
  })
})
