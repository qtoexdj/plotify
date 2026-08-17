// @vitest-environment jsdom
/**
 * SDD 021 — Tests de componentes de la campana de notificaciones:
 *   - US2: contador numérico de pendientes accionables
 *   - US3: copy de contexto + CTA navegable (1 clic)
 *   - US7: controles accesibles (focus/aria)
 */
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { NotificationItem } from '@/components/notifications/notification-item'
import { NotificationBell } from '@/components/notifications/notification-bell'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@hugeicons/react', () => ({ HugeiconsIcon: () => <span data-testid="icon" /> }))
vi.mock('@hugeicons/core-free-icons', () => ({
  Tick02Icon: 'Tick02Icon',
  Cancel01Icon: 'Cancel01Icon',
  Task01Icon: 'Task01Icon',
  UserIcon: 'UserIcon',
  Location01Icon: 'Location01Icon',
  Calendar01Icon: 'Calendar01Icon',
  SparklesIcon: 'SparklesIcon',
  NotificationOff01Icon: 'NotificationOff01Icon',
  Notification01Icon: 'Notification01Icon',
  AlertCircleIcon: 'AlertCircleIcon',
  ArrowDown01Icon: 'ArrowDown01Icon',
}))
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: any) => <span className={className}>{children}</span>,
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, className, disabled, onClick, 'aria-label': ariaLabel }: any) => (
    <button className={className} disabled={disabled} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}))
vi.mock('@/components/ui/spinner', () => ({
  Spinner: () => <span data-testid="spinner" />,
}))
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel: vi.fn(),
  }),
}))
vi.mock('@/lib/services/notifications.service', () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  dismissNotification: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  decideNotificationApproval: vi.fn(),
}))

import { listNotifications } from '@/lib/services/notifications.service'

const noop = async () => {}

const baseItem = {
  id: 'notif-1',
  approval_id: 'app-1',
  request_type: 'sale',
  status: 'approved',
  project_name: 'Proyecto Los Castaños',
  lot_label: 'Lote 12',
  client_name: 'María Pérez',
  vendor_name: 'Juan Vendedor',
  created_at: '2026-08-14T10:00:00Z',
  decided_at: '2026-08-14T12:00:00Z',
  can_decide: false,
  read_at: null,
  dismissed_at: null,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('US3: Copy accionable con navegación', () => {
  it('renderiza el copy del servidor y el CTA que navega al deep_link', () => {
    const item = {
      ...baseItem,
      title: 'Borrador por revisar',
      message: 'El borrador de escritura de Lote 12 está listo para revisión en la mesa.',
      action_label: 'Abrir borrador',
      deep_link: '/documentos/matriz/case-1',
    }

    render(<NotificationItem item={item} userRole="admin" onMarkRead={noop} onDismiss={noop} />)

    expect(screen.getByText('Borrador por revisar')).toBeTruthy()
    expect(
      screen.getByText('El borrador de escritura de Lote 12 está listo para revisión en la mesa.')
    ).toBeTruthy()
    const cta = screen.getByRole('link', { name: 'Abrir borrador' })
    expect(cta.getAttribute('href')).toBe('/documentos/matriz/case-1')
  })

  it('no muestra CTA cuando no hay destino asociado', () => {
    render(<NotificationItem item={baseItem} userRole="admin" onMarkRead={noop} onDismiss={noop} />)

    expect(screen.queryByRole('link')).toBeNull()
  })

  it('el vendedor nunca ve controles de decisión administrativa', () => {
    const item = { ...baseItem, status: 'pending' as const, can_decide: true }
    render(
      <NotificationItem
        item={item}
        userRole="vendor"
        onMarkRead={noop}
        onDismiss={noop}
        onDecide={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rechazar' })).toBeNull()
  })

  it('muestra el control de descartar con label accesible', () => {
    render(<NotificationItem item={baseItem} userRole="admin" onMarkRead={noop} onDismiss={noop} />)

    const dismiss = screen.getByRole('button', { name: 'Descartar notificación' })
    expect(dismiss).toBeTruthy()
  })

  it('anuncia su estado y expone un control de marcar leída por teclado', () => {
    render(
      <NotificationItem
        item={{ ...baseItem, read_at: null }}
        userRole="admin"
        onMarkRead={noop}
        onDismiss={noop}
      />
    )

    const article = screen.getByRole('article')
    expect(article.getAttribute('aria-label')).toContain('sin leer')
    // El control de "marcar leída" es un botón real, alcanzable por Tab (US7-AC1).
    expect(screen.getByRole('button', { name: 'Marcar como leída' })).toBeTruthy()
  })

  it('el ítem no leído es focusable y activa marcar leída con Enter o Espacio (US7-AC1)', () => {
    const onMarkRead = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(
      <NotificationItem
        item={{ ...baseItem, read_at: null }}
        userRole="admin"
        onMarkRead={onMarkRead}
        onDismiss={noop}
      />
    )

    const article = screen.getByRole('article')
    expect(article.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(article, { key: 'Enter' })
    expect(onMarkRead).toHaveBeenCalledWith('notif-1')

    unmount()
    onMarkRead.mockClear()
    render(
      <NotificationItem
        item={{ ...baseItem, read_at: null }}
        userRole="admin"
        onMarkRead={onMarkRead}
        onDismiss={noop}
      />
    )

    fireEvent.keyDown(screen.getByRole('article'), { key: ' ' })
    expect(onMarkRead).toHaveBeenCalledWith('notif-1')
  })

  it('el ítem ya leído queda fuera del orden de tabulación', () => {
    render(
      <NotificationItem
        item={{ ...baseItem, read_at: '2026-08-14T11:00:00Z' }}
        userRole="admin"
        onMarkRead={noop}
        onDismiss={noop}
      />
    )

    expect(screen.getByRole('article').getAttribute('tabindex')).toBe('-1')
  })
})

describe('US2: Contador de pendientes accionables', () => {
  beforeEach(() => {
    vi.mocked(listNotifications).mockResolvedValue({
      success: true,
      items: [baseItem],
      counts: { pending: 3, approved: 0, rejected: 0, unread: 1 },
    })
  })

  it('muestra el número de pendientes junto al ícono', async () => {
    render(<NotificationBell userId="u1" organizationId="o1" userRole="admin" />)

    const badge = await screen.findByText('3')
    expect(badge).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Campana de notificaciones, 3 solicitudes pendientes/ })
    ).toBeTruthy()
  })

  it('no muestra número ni indicador cuando hay cero pendientes', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      success: true,
      items: [],
      counts: { pending: 0, approved: 0, rejected: 0, unread: 0 },
    })

    render(<NotificationBell userId="u1" organizationId="o1" userRole="vendor" />)

    await screen.findByRole('button', { name: 'Campana de notificaciones' })
    expect(screen.queryByText('0')).toBeNull()
  })

  it('solicita datos paginados de 50 en 50', async () => {
    render(<NotificationBell userId="u1" organizationId="o1" userRole="admin" />)
    await screen.findByText('3')

    expect(listNotifications).toHaveBeenCalledWith('u1', 'o1', { limit: 50, offset: 0 })
  })
})
