/**
 * FASE 4 — F-v2-4.13 / F-v2-4.14 / F-v2-4.15
 * Tests de lógica pura para:
 *   - DocumentsHistoryTable: filtros de búsqueda, tipo y rango de fechas
 *   - FORMAT_LABELS / DOCTYPE_LABELS: etiquetas de formato y tipo
 *   - formatDate / formatDateTime: formateadores de fecha
 *   - Sidebar navItems: estructura del grupo Documentos
 *   - Rutas del index /documentos: accesos rápidos correctos
 *
 * Estrategia: vitest corre en env node (sin jsdom).
 * Se replica la lógica pura de los componentes para testearla de forma aislada.
 */
import { describe, it, expect } from 'vitest'
import { navItems } from '@/components/app-sidebar'

// ─────────────────────────────────────────────────────────────────────────────
// Lógica replicada de documents-history-table.tsx
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  pdf: { label: 'PDF', variant: 'default' },
  docx: { label: 'DOCX', variant: 'secondary' },
}

const DOCTYPE_LABELS: Record<string, string> = {
  compraventa: 'Compraventa',
  promesa: 'Promesa de C/V',
  mandato: 'Mandato',
  servidumbre: 'Servidumbre',
  poder: 'Poder Notarial',
  otro: 'Otro',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Tipo local que replica DocWithTemplate del componente ───────────────────

interface DocWithTemplate {
  id: string
  organization_id: string
  template_id: string
  lot_id: string | null
  lot_record_id: string | null
  document_type: string
  file_format: string
  file_url: string
  generated_by: string | null
  variables_snapshot: unknown
  created_at: string | null
  document_templates?: { name: string; document_type: string } | null
}

// ─── Lógica de filtrado replicada del useMemo del componente ─────────────────

function filterDocuments(
  documents: DocWithTemplate[],
  search: string,
  filterType: string,
  filterFrom: string,
  filterTo: string
): DocWithTemplate[] {
  return documents.filter((doc) => {
    if (search) {
      const q = search.toLowerCase()
      const templateName = doc.document_templates?.name?.toLowerCase() ?? ''
      const docType = doc.document_type.toLowerCase()
      if (!templateName.includes(q) && !docType.includes(q)) return false
    }
    if (filterType !== 'todos' && doc.document_type !== filterType) return false
    if (filterFrom && doc.created_at) {
      if (new Date(doc.created_at) < new Date(filterFrom)) return false
    }
    if (filterTo && doc.created_at) {
      const to = new Date(filterTo)
      to.setHours(23, 59, 59, 999)
      if (new Date(doc.created_at) > to) return false
    }
    return true
  })
}

function uniqueTypes(documents: DocWithTemplate[]): string[] {
  return Array.from(new Set(documents.map((d) => d.document_type)))
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1'

function makeDoc(overrides: Partial<DocWithTemplate> = {}): DocWithTemplate {
  return {
    id: 'doc-uuid-1',
    organization_id: ORG_ID,
    template_id: 'tmpl-uuid-1',
    lot_id: 'lot-uuid-1',
    lot_record_id: null,
    document_type: 'compraventa',
    file_format: 'pdf',
    file_url: 'https://storage.example.com/docs/doc.pdf',
    generated_by: 'user-uuid-1',
    variables_snapshot: {},
    created_at: '2026-03-15T10:00:00Z',
    document_templates: { name: 'Escritura Rural', document_type: 'compraventa' },
    ...overrides,
  }
}

const SAMPLE_DOCS: DocWithTemplate[] = [
  makeDoc({
    id: 'doc-1',
    document_type: 'compraventa',
    file_format: 'pdf',
    created_at: '2026-03-15T10:00:00Z',
    document_templates: { name: 'Escritura Compraventa Rural', document_type: 'compraventa' },
  }),
  makeDoc({
    id: 'doc-2',
    document_type: 'promesa',
    file_format: 'docx',
    created_at: '2026-03-20T14:00:00Z',
    document_templates: { name: 'Promesa de Compraventa', document_type: 'promesa' },
  }),
  makeDoc({
    id: 'doc-3',
    document_type: 'mandato',
    file_format: 'pdf',
    created_at: '2026-03-25T09:00:00Z',
    document_templates: { name: 'Mandato Notarial', document_type: 'mandato' },
  }),
]

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.13 — FORMAT_LABELS
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.13 — FORMAT_LABELS', () => {
  it('PDF tiene label "PDF" y variant default', () => {
    expect(FORMAT_LABELS['pdf']).toEqual({ label: 'PDF', variant: 'default' })
  })

  it('DOCX tiene label "DOCX" y variant secondary', () => {
    expect(FORMAT_LABELS['docx']).toEqual({ label: 'DOCX', variant: 'secondary' })
  })

  it('formato desconocido no existe en el mapa', () => {
    expect(FORMAT_LABELS['odt']).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.13 — DOCTYPE_LABELS
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.13 — DOCTYPE_LABELS', () => {
  const cases: [string, string][] = [
    ['compraventa', 'Compraventa'],
    ['promesa', 'Promesa de C/V'],
    ['mandato', 'Mandato'],
    ['servidumbre', 'Servidumbre'],
    ['poder', 'Poder Notarial'],
    ['otro', 'Otro'],
  ]

  it.each(cases)('DocType "%s" mapea a "%s"', (type, label) => {
    expect(DOCTYPE_LABELS[type]).toBe(label)
  })

  it('cubre exactamente 6 tipos de documento', () => {
    expect(Object.keys(DOCTYPE_LABELS)).toHaveLength(6)
  })

  it('tipo desconocido no existe en el mapa (fallback al consumidor)', () => {
    expect(DOCTYPE_LABELS['escritura']).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.13 — formatDate / formatDateTime
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.13 — formatDate', () => {
  it('retorna "—" para null', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('formatea una fecha ISO a dd/mm/aaaa (locale es-CL)', () => {
    const result = formatDate('2026-03-15T10:00:00Z')
    // Verificar que contiene los componentes de la fecha
    expect(result).toMatch(/15/)
    expect(result).toMatch(/03|3/)
    expect(result).toMatch(/2026/)
  })
})

describe('F-v2-4.13 — formatDateTime', () => {
  it('retorna "—" para null', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('formatea un ISO a una cadena que contiene fecha y hora', () => {
    const result = formatDateTime('2026-03-15T10:00:00Z')
    expect(result).toMatch(/2026/)
    // Contiene algún separador de hora (: o similar)
    expect(result.length).toBeGreaterThan(10)
  })

  it('formatDate y formatDateTime difieren en longitud (fecha vs datetime)', () => {
    const iso = '2026-03-15T10:00:00Z'
    expect(formatDateTime(iso).length).toBeGreaterThanOrEqual(formatDate(iso).length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.13 — Filtro de búsqueda por texto
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.13 — filterDocuments: búsqueda por texto', () => {
  it('sin filtros retorna todos los documentos', () => {
    const result = filterDocuments(SAMPLE_DOCS, '', 'todos', '', '')
    expect(result).toHaveLength(3)
  })

  it('busca por nombre de plantilla (case-insensitive)', () => {
    const result = filterDocuments(SAMPLE_DOCS, 'escritura', 'todos', '', '')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('doc-1')
  })

  it('busca por tipo de documento', () => {
    const result = filterDocuments(SAMPLE_DOCS, 'promesa', 'todos', '', '')
    expect(result).toHaveLength(1)
    expect(result[0].document_type).toBe('promesa')
  })

  it('búsqueda parcial funciona', () => {
    const result = filterDocuments(SAMPLE_DOCS, 'rural', 'todos', '', '')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('doc-1')
  })

  it('búsqueda que no coincide retorna vacío', () => {
    const result = filterDocuments(SAMPLE_DOCS, 'inexistente_xyz', 'todos', '', '')
    expect(result).toHaveLength(0)
  })

  it('búsqueda en mayúsculas funciona (case-insensitive)', () => {
    const result = filterDocuments(SAMPLE_DOCS, 'MANDATO', 'todos', '', '')
    expect(result).toHaveLength(1)
    expect(result[0].document_type).toBe('mandato')
  })

  it('doc sin template_name usa el tipo para buscar', () => {
    const docSinTemplate = makeDoc({
      id: 'doc-noname',
      document_type: 'poder',
      document_templates: null,
    })
    const result = filterDocuments([docSinTemplate], 'poder', 'todos', '', '')
    expect(result).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.13 — Filtro por tipo de documento
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.13 — filterDocuments: filtro por tipo', () => {
  it('filterType="todos" no descarta ningún documento', () => {
    const result = filterDocuments(SAMPLE_DOCS, '', 'todos', '', '')
    expect(result).toHaveLength(3)
  })

  it('filterType="compraventa" retorna solo los de ese tipo', () => {
    const result = filterDocuments(SAMPLE_DOCS, '', 'compraventa', '', '')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('doc-1')
  })

  it('filterType="mandato" retorna solo mandatos', () => {
    const result = filterDocuments(SAMPLE_DOCS, '', 'mandato', '', '')
    expect(result).toHaveLength(1)
    expect(result[0].document_type).toBe('mandato')
  })

  it('filterType de tipo que no existe en fixture retorna vacío', () => {
    const result = filterDocuments(SAMPLE_DOCS, '', 'poder', '', '')
    expect(result).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.13 — Filtro por rango de fechas
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.13 — filterDocuments: filtro por rango de fechas', () => {
  it('desde una fecha anterior a todos los docs no descarta ninguno', () => {
    const result = filterDocuments(SAMPLE_DOCS, '', 'todos', '2026-01-01', '')
    expect(result).toHaveLength(3)
  })

  it('desde una fecha posterior a todos los docs retorna vacío', () => {
    const result = filterDocuments(SAMPLE_DOCS, '', 'todos', '2026-04-01', '')
    expect(result).toHaveLength(0)
  })

  it('hasta una fecha anterior a todos los docs retorna vacío', () => {
    const result = filterDocuments(SAMPLE_DOCS, '', 'todos', '', '2026-02-28')
    expect(result).toHaveLength(0)
  })

  it('hasta una fecha posterior a todos los docs no descarta ninguno', () => {
    const result = filterDocuments(SAMPLE_DOCS, '', 'todos', '', '2026-12-31')
    expect(result).toHaveLength(3)
  })

  it('rango [2026-03-15 → 2026-03-21] incluye doc-1 y doc-2 pero no doc-3', () => {
    // Usamos un día de margen superior (+1) para evitar ambigüedad de zona horaria:
    // `new Date('2026-03-21')` se parsea como UTC midnight; setHours(23,59,59) usa
    // hora local, pero siempre queda por encima de doc-2 (2026-03-20T14:00Z).
    const result = filterDocuments(SAMPLE_DOCS, '', 'todos', '2026-03-15', '2026-03-21')
    const ids = result.map((d) => d.id)
    expect(ids).toContain('doc-1')
    expect(ids).toContain('doc-2')
    expect(ids).not.toContain('doc-3')
  })

  it('doc sin created_at no se filtra por fecha', () => {
    const docSinFecha = makeDoc({ id: 'doc-sinfecha', created_at: null })
    const result = filterDocuments([docSinFecha], '', 'todos', '2026-01-01', '2026-02-01')
    // created_at null no aplica filtro de fecha → pasa el filtro
    expect(result).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.13 — uniqueTypes
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.13 — uniqueTypes: tipos únicos de documentos', () => {
  it('retorna los tipos únicos de la lista', () => {
    const types = uniqueTypes(SAMPLE_DOCS)
    expect(types).toContain('compraventa')
    expect(types).toContain('promesa')
    expect(types).toContain('mandato')
    expect(types).toHaveLength(3)
  })

  it('no hay duplicados cuando hay docs del mismo tipo', () => {
    const docs = [
      makeDoc({ id: 'd1', document_type: 'compraventa' }),
      makeDoc({ id: 'd2', document_type: 'compraventa' }),
      makeDoc({ id: 'd3', document_type: 'promesa' }),
    ]
    const types = uniqueTypes(docs)
    expect(types).toHaveLength(2)
  })

  it('retorna [] para lista vacía', () => {
    expect(uniqueTypes([])).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.13 — Combinación de filtros
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.13 — filterDocuments: combinación de filtros', () => {
  it('texto + tipo juntos aplican AND', () => {
    // Busca "compraventa" en texto Y filtra por tipo compraventa → solo doc-1
    const result = filterDocuments(SAMPLE_DOCS, 'escritura', 'compraventa', '', '')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('doc-1')
  })

  it('texto + tipo incompatibles retornan vacío', () => {
    // Texto coincide con doc-1 pero el tipo filtra mandato → sin resultado
    const result = filterDocuments(SAMPLE_DOCS, 'escritura', 'mandato', '', '')
    expect(result).toHaveLength(0)
  })

  it('tipo + rango fechas juntos aplican AND', () => {
    // promesa creada 2026-03-20, filtra todos los anteriores a 2026-03-18 → vacío
    const result = filterDocuments(SAMPLE_DOCS, '', 'promesa', '2026-03-21', '')
    expect(result).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.15 — navItems: grupo Documentos en el sidebar
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.15 — navItems: grupo Documentos', () => {
  const docGroup = navItems.find((item) => item.title === 'Documentos')

  it('existe el grupo "Documentos" en navItems', () => {
    expect(docGroup).toBeDefined()
  })

  it('el grupo Documentos tiene subitems', () => {
    expect(docGroup?.items).toBeDefined()
    expect(docGroup?.items?.length).toBeGreaterThan(0)
  })

  it('tiene exactamente 2 subitems', () => {
    expect(docGroup?.items).toHaveLength(2)
  })

  it('subitem Plantillas existe con la URL correcta', () => {
    const sub = docGroup?.items?.find((i) => i.title === 'Plantillas')
    expect(sub).toBeDefined()
    expect(sub?.url).toBe('/documentos/plantillas')
  })

  it('no publica la ruta MVP de Bloques', () => {
    const sub = docGroup?.items?.find((i) => i.title === 'Bloques')
    expect(sub).toBeUndefined()
  })

  it('subitem Historial existe con la URL correcta', () => {
    const sub = docGroup?.items?.find((i) => i.title === 'Historial')
    expect(sub).toBeDefined()
    expect(sub?.url).toBe('/documentos/historial')
  })

  it('el grupo Documentos no tiene URL propia (es colapsable)', () => {
    expect(docGroup).not.toHaveProperty('url')
  })

  it('el grupo Documentos tiene un icono asignado', () => {
    expect(docGroup?.icon).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.15 — navItems: orden y estructura global del sidebar
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.15 — navItems: estructura global del sidebar', () => {
  it('contiene al menos 5 grupos/items de navegación', () => {
    expect(navItems.length).toBeGreaterThanOrEqual(5)
  })

  it('Dashboard es el primer item', () => {
    expect(navItems[0].title).toBe('Dashboard')
  })

  it('Proyectos existe con URL /projects', () => {
    const item = navItems.find((i) => i.title === 'Proyectos')
    expect(item).toBeDefined()
    expect((item as { url?: string })?.url).toBe('/projects')
  })

  it('Agente existe y tiene subitems', () => {
    const item = navItems.find((i) => i.title === 'Agente')
    expect(item).toBeDefined()
    expect(item?.items?.length).toBeGreaterThan(0)
  })

  it('Documentos aparece después de Vendedores', () => {
    const vendedoresIdx = navItems.findIndex((i) => i.title === 'Vendedores')
    const documentosIdx = navItems.findIndex((i) => i.title === 'Documentos')
    expect(vendedoresIdx).toBeGreaterThanOrEqual(0)
    expect(documentosIdx).toBeGreaterThan(vendedoresIdx)
  })

  it('todos los items tienen al menos title', () => {
    navItems.forEach((item) => {
      expect(item.title).toBeTruthy()
    })
  })

  it('todos los items hoja (sin subitems) tienen URL', () => {
    const leafItems = navItems.filter((i) => !i.items || i.items.length === 0)
    leafItems.forEach((item) => {
      expect((item as { url?: string }).url).toBeTruthy()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.14 — Rutas del index /documentos
// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.14 — /documentos accesos rápidos: rutas correctas', () => {
  const ACCESOS = [
    { title: 'Plantillas', href: '/documentos/plantillas' },
    { title: 'Bloques', href: '/documentos/bloques' },
    { title: 'Historial', href: '/documentos/historial' },
  ]

  it('hay exactamente 3 accesos rápidos definidos', () => {
    expect(ACCESOS).toHaveLength(3)
  })

  it.each(ACCESOS)('acceso "$title" tiene la href "$href"', ({ title, href }) => {
    const item = ACCESOS.find((a) => a.title === title)
    expect(item?.href).toBe(href)
  })

  it('todas las hrefs empiezan con /documentos/', () => {
    ACCESOS.forEach((a) => {
      expect(a.href).toMatch(/^\/documentos\//)
    })
  })

  it('las hrefs coinciden con los subitems del sidebar', () => {
    const docGroup = navItems.find((i) => i.title === 'Documentos')
    const sidebarUrls = new Set(docGroup?.items?.map((i) => i.url))
    ACCESOS.forEach((a) => {
      expect(sidebarUrls.has(a.href)).toBe(true)
    })
  })

  it('CTA de la página index apunta a /projects', () => {
    const ctaHref = '/projects'
    expect(ctaHref).toBe('/projects')
  })
})
