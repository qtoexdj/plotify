/**
 * FASE 4 — F-v2-4.7 / F-v2-4.8 / F-v2-4.9
 * Tests de componentes:
 *   - VariableChips (lógica de extracción)
 *   - BlockEditorDialog (esquema Zod)
 *   - TemplatesList (schema de nueva plantilla, lógica de badge, filtrado por tipo)
 *
 * Nota: componentes React no se renderizan en vitest (env node). Se testea la lógica pura.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'

// ─── Lógica de extracción de variables (duplicada del componente para testear) ──

function extractVariables(content: string): string[] {
  const raw = content.match(/\{\{\s*([a-zA-Z_][\w.]*\s*(?:\|[^}]*)?)\}\}/g) ?? []
  return [...new Set(raw.map((m) => m.replace(/\{\{\s*([a-zA-Z_][\w.]*).*?\}\}/, '$1')))]
}

// ─── Schema de validación del formulario (duplicado del dialog) ───────────────

const BLOCK_CATEGORIES = ['encabezado', 'articulo', 'precio', 'clausula', 'firma', 'anexo'] as const

const BlockFormSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100, 'Máximo 100 caracteres'),
  category: z.enum(BLOCK_CATEGORIES),
  tags: z.string(),
})

// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.7/4.8 — VariableChips: extracción de variables', () => {
  it('extrae una variable simple', () => {
    const vars = extractVariables('El vendedor es {{ vendedor.nombre }} y tiene RUT {{ vendedor.rut }}.')
    expect(vars).toContain('vendedor.nombre')
    expect(vars).toContain('vendedor.rut')
    expect(vars).toHaveLength(2)
  })

  it('elimina duplicados', () => {
    const vars = extractVariables('{{ lote.numero_nombre }} y {{ lote.numero_nombre }} otra vez')
    expect(vars).toHaveLength(1)
    expect(vars[0]).toBe('lote.numero_nombre')
  })

  it('extrae variable con filtro Jinja2 (|upper)', () => {
    const vars = extractVariables('{{ vendedor.nombre | upper }} vendió a {{ comprador.nombre }}')
    expect(vars).toContain('vendedor.nombre')
    expect(vars).toContain('comprador.nombre')
  })

  it('retorna [] para contenido sin variables', () => {
    const vars = extractVariables('<p>Sin ninguna variable aquí.</p>')
    expect(vars).toHaveLength(0)
  })

  it('retorna [] para contenido vacío', () => {
    const vars = extractVariables('')
    expect(vars).toHaveLength(0)
  })

  it('extrae múltiples variables en párrafo HTML', () => {
    const html = `<p>El lote {{ lote.numero_nombre }} tiene {{ lote.superficie_total }} m²,
      con deslindes {{ lote.deslindes }}. Precio: {{ transaccion.precio_numeros }}
      ({{ transaccion.precio_letras }}).</p>`
    const vars = extractVariables(html)
    expect(vars).toContain('lote.numero_nombre')
    expect(vars).toContain('lote.superficie_total')
    expect(vars).toContain('lote.deslindes')
    expect(vars).toContain('transaccion.precio_numeros')
    expect(vars).toContain('transaccion.precio_letras')
  })

  it('extrae variable con espacios extra en llaves', () => {
    const vars = extractVariables('{{  vendedor.nombre  }} firmó')
    expect(vars).toContain('vendedor.nombre')
  })

  it('ignora texto que no son variables Jinja2', () => {
    const vars = extractVariables('<p>{algo_invalido}</p> y {{123}} también invalido')
    expect(vars).toHaveLength(0)
  })

  it('extrae exactamente todos los vars del artículo de lote (ART-01 style)', () => {
    const content = `<h2>PRIMERO — Antecedentes</h2>
      <p>El inmueble denomindado {{ matriz.nombre_predio }}, ubicado en {{ matriz.ubicacion }},
      con superficie de {{ matriz.superficie_total }}, inscrito bajo el Rol {{ matriz.rol_avaluo }}.</p>`
    const vars = extractVariables(content)
    expect(vars).toContain('matriz.nombre_predio')
    expect(vars).toContain('matriz.ubicacion')
    expect(vars).toContain('matriz.superficie_total')
    expect(vars).toContain('matriz.rol_avaluo')
    expect(vars).toHaveLength(4)
  })
})

describe('F-v2-4.7/4.8 — BlockFormSchema: validación del formulario', () => {
  it('acepta un form válido con categoría articulo', () => {
    const result = BlockFormSchema.safeParse({
      name: 'PRIMERO — Antecedentes',
      category: 'articulo',
      tags: 'escritura, art-01',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza name vacío', () => {
    const result = BlockFormSchema.safeParse({
      name: '',
      category: 'articulo',
      tags: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find((i) => i.path.includes('name'))
      expect(nameError?.message).toMatch(/requerido/i)
    }
  })

  it('rechaza name con más de 100 caracteres', () => {
    const result = BlockFormSchema.safeParse({
      name: 'A'.repeat(101),
      category: 'articulo',
      tags: '',
    })
    expect(result.success).toBe(false)
  })

  it('acepta todas las categorías válidas', () => {
    for (const cat of BLOCK_CATEGORIES) {
      const result = BlockFormSchema.safeParse({
        name: 'Test',
        category: cat,
        tags: '',
      })
      expect(result.success, `Categoría '${cat}' debe ser válida`).toBe(true)
    }
  })

  it('rechaza categoría inválida', () => {
    const result = BlockFormSchema.safeParse({
      name: 'Test',
      category: 'invalida',
      tags: '',
    })
    expect(result.success).toBe(false)
  })

  it('acepta tags vacío (campo opcional)', () => {
    const result = BlockFormSchema.safeParse({
      name: 'Test',
      category: 'firma',
      tags: '',
    })
    expect(result.success).toBe(true)
  })

  it('parsea tags de string a lista correctamente (lógica post-schema)', () => {
    const raw = '  escritura , art-02 ,  lote  '
    const tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    expect(tags).toEqual(['escritura', 'art-02', 'lote'])
  })

  it('tags vacío produce lista vacía', () => {
    const raw = ''
    const tags = raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    expect(tags).toHaveLength(0)
  })
})

describe('F-v2-4.7/4.8 — BlocksTable: filtrado de bloques (lógica pura)', () => {
  const mockBlocks = [
    { id: '1', name: 'PRIMERO — Antecedentes', category: 'articulo', tags: ['escritura'] },
    { id: '2', name: 'COMPARECENCIA', category: 'encabezado', tags: ['comparecencia'] },
    { id: '3', name: 'PRECIO Y PAGO', category: 'precio', tags: ['pago', 'precio'] },
    { id: '4', name: 'FIRMA Y CIERRE', category: 'firma', tags: ['firma'] },
  ]

  function filter(blocks: typeof mockBlocks, search: string, category: string) {
    return blocks.filter((b) => {
      const matchesCategory = category === 'todos' || b.category === category
      const matchesSearch =
        !search ||
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      return matchesCategory && matchesSearch
    })
  }

  it('sin filtros devuelve todos los bloques', () => {
    expect(filter(mockBlocks, '', 'todos')).toHaveLength(4)
  })

  it('filtra por categoría articulo', () => {
    const result = filter(mockBlocks, '', 'articulo')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('PRIMERO — Antecedentes')
  })

  it('filtra por búsqueda en el nombre', () => {
    const result = filter(mockBlocks, 'precio', 'todos')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('PRECIO Y PAGO')
  })

  it('filtra por tag', () => {
    const result = filter(mockBlocks, 'comparecencia', 'todos')
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('encabezado')
  })

  it('filtro combinado: categoría + búsqueda', () => {
    const result = filter(mockBlocks, 'firma', 'firma')
    expect(result).toHaveLength(1)
  })

  it('búsqueda sin coincidencia devuelve []', () => {
    const result = filter(mockBlocks, 'xyz_no_existe', 'todos')
    expect(result).toHaveLength(0)
  })

  it('búsqueda case-insensitive', () => {
    const result = filter(mockBlocks, 'PRIMERO', 'todos')
    expect(result).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.9 — TemplatesList
// ─────────────────────────────────────────────────────────────────────────────

// ─── Schema de nueva plantilla (duplicado del componente para testear) ────────

const TEMPLATE_DOCUMENT_TYPES = ['escritura', 'reserva', 'promesa', 'deslinde', 'otro'] as const

const NewTemplateSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  document_type: z.string().min(1, 'Selecciona un tipo'),
  description: z.string().max(300).optional(),
})

// ─── Helper de badge por tipo (duplicado del componente para testear) ─────────

const DOCUMENT_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  escritura: { label: 'Escritura', className: 'bg-blue-100 text-blue-800' },
  reserva: { label: 'Reserva', className: 'bg-green-100 text-green-800' },
  promesa: { label: 'Promesa', className: 'bg-orange-100 text-orange-800' },
  deslinde: { label: 'Deslinde', className: 'bg-purple-100 text-purple-800' },
}

function getBadgeConfig(type: string) {
  return DOCUMENT_TYPE_CONFIG[type] ?? { label: type, className: 'bg-gray-100 text-gray-700' }
}

// ─── Helper de fecha ──────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(dateStr))
}

// ─────────────────────────────────────────────────────────────────────────────

describe('F-v2-4.9 — NewTemplateSchema: validación del formulario', () => {
  it('acepta una plantilla válida de tipo escritura', () => {
    const result = NewTemplateSchema.safeParse({
      name: 'Escritura Compraventa 2026',
      document_type: 'escritura',
      description: 'Plantilla base para escrituras de compraventa.',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza name vacío', () => {
    const result = NewTemplateSchema.safeParse({
      name: '',
      document_type: 'escritura',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find((i) => i.path.includes('name'))
      expect(nameError?.message).toMatch(/requerido/i)
    }
  })

  it('rechaza name con más de 100 caracteres', () => {
    const result = NewTemplateSchema.safeParse({
      name: 'A'.repeat(101),
      document_type: 'escritura',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza document_type vacío', () => {
    const result = NewTemplateSchema.safeParse({
      name: 'Plantilla válida',
      document_type: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const typeError = result.error.issues.find((i) => i.path.includes('document_type'))
      expect(typeError).toBeDefined()
    }
  })

  it('acepta todos los tipos de documento válidos', () => {
    for (const type of TEMPLATE_DOCUMENT_TYPES) {
      const result = NewTemplateSchema.safeParse({
        name: 'Test',
        document_type: type,
      })
      expect(result.success, `Tipo '${type}' debe ser válido`).toBe(true)
    }
  })

  it('acepta description opcional ausente', () => {
    const result = NewTemplateSchema.safeParse({
      name: 'Test',
      document_type: 'reserva',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza description con más de 300 caracteres', () => {
    const result = NewTemplateSchema.safeParse({
      name: 'Test',
      document_type: 'reserva',
      description: 'A'.repeat(301),
    })
    expect(result.success).toBe(false)
  })
})

describe('F-v2-4.9 — DocumentTypeBadge: configuración por tipo', () => {
  it('tipo escritura retorna badge azul', () => {
    const config = getBadgeConfig('escritura')
    expect(config.label).toBe('Escritura')
    expect(config.className).toContain('blue')
  })

  it('tipo reserva retorna badge verde', () => {
    const config = getBadgeConfig('reserva')
    expect(config.label).toBe('Reserva')
    expect(config.className).toContain('green')
  })

  it('tipo promesa retorna badge naranja', () => {
    const config = getBadgeConfig('promesa')
    expect(config.label).toContain('Promesa')
    expect(config.className).toContain('orange')
  })

  it('tipo desconocido retorna fallback gris con el tipo como label', () => {
    const config = getBadgeConfig('tipo_desconocido')
    expect(config.label).toBe('tipo_desconocido')
    expect(config.className).toContain('gray')
  })
})

describe('F-v2-4.9 — TemplatesList: formatDate helper', () => {
  it('fecha ISO retorna string formateado', () => {
    const formatted = formatDate('2026-03-31T10:00:00.000Z')
    expect(formatted).toBeTruthy()
    expect(formatted).not.toBe('—')
    // Debe contener el año
    expect(formatted).toContain('2026')
  })

  it('fecha null retorna "—"', () => {
    expect(formatDate(null)).toBe('—')
  })
})

describe('F-v2-4.9 — TemplatesList: datos de plantillas', () => {
  const mockTemplates = [
    {
      id: 'tpl-1',
      name: 'Escritura Compraventa 2026',
      document_type: 'escritura',
      description: 'Plantilla base',
      is_default: true,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-31T00:00:00Z',
    },
    {
      id: 'tpl-2',
      name: 'Reserva Simple',
      document_type: 'reserva',
      description: null,
      is_default: false,
      created_at: '2026-03-15T00:00:00Z',
      updated_at: '2026-03-20T00:00:00Z',
    },
    {
      id: 'tpl-3',
      name: 'Promesa de Compraventa',
      document_type: 'promesa',
      description: 'Para etapa de promesa',
      is_default: false,
      created_at: '2026-03-20T00:00:00Z',
      updated_at: null,
    },
  ]

  it('la lista tiene 3 plantillas', () => {
    expect(mockTemplates).toHaveLength(3)
  })

  it('exactamente una plantilla es default', () => {
    const defaults = mockTemplates.filter((t) => t.is_default)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].name).toBe('Escritura Compraventa 2026')
  })

  it('todos los tipos tienen badge configurado', () => {
    for (const t of mockTemplates) {
      const config = getBadgeConfig(t.document_type)
      expect(config.label).toBeTruthy()
    }
  })

  it('plantillas sin descripción se manejan sin error', () => {
    const sinDesc = mockTemplates.filter((t) => t.description === null)
    expect(sinDesc).toHaveLength(1)
    // No lanza error al intentar mostrar description null
    expect(() => sinDesc[0].description ?? '').not.toThrow()
  })

  it('updated_at null se formatea como "—"', () => {
    const tplSinFecha = mockTemplates.find((t) => t.updated_at === null)!
    expect(formatDate(tplSinFecha.updated_at)).toBe('—')
  })

  it('filtrando por tipo escritura devuelve 1 plantilla', () => {
    const escrituras = mockTemplates.filter((t) => t.document_type === 'escritura')
    expect(escrituras).toHaveLength(1)
  })

  it('la URL del builder sigue el patrón correcto', () => {
    for (const t of mockTemplates) {
      const url = `/documentos/plantillas/${t.id}/builder`
      expect(url).toMatch(/^\/documentos\/plantillas\/.+\/builder$/)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F-v2-4.10 — TemplateBuilder: lógica DnD y gestión de secuencia
// ─────────────────────────────────────────────────────────────────────────────

import { arrayMove } from '@dnd-kit/sortable'

// Duplicar las constantes del componente para testear
const CONDITION_FIELDS_TEST: Record<string, string> = {
  'servidumbre.aplica': 'Aplica servidumbre',
  'personeria.aplica': 'Aplica personería/representación',
}

interface ArticleItemTest {
  id: string
  block_id: string
  block_name: string
  block_category: string
  position: number
  is_optional: boolean
  condition_field: string | null
}

function makeItem(overrides: Partial<ArticleItemTest> = {}): ArticleItemTest {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    block_id: 'block-1',
    block_name: 'Bloque test',
    block_category: 'articulo',
    position: 1,
    is_optional: false,
    condition_field: null,
    ...overrides,
  }
}

function addBlock(
  items: ArticleItemTest[],
  block: { id: string; name: string; category: string }
): ArticleItemTest[] {
  return [
    ...items,
    {
      id: `${block.id}-${Date.now()}`,
      block_id: block.id,
      block_name: block.name,
      block_category: block.category,
      position: items.length + 1,
      is_optional: false,
      condition_field: null,
    },
  ]
}

function removeBlock(items: ArticleItemTest[], id: string): ArticleItemTest[] {
  return items
    .filter((i) => i.id !== id)
    .map((item, idx) => ({ ...item, position: idx + 1 }))
}

function reorder(items: ArticleItemTest[], oldIdx: number, newIdx: number): ArticleItemTest[] {
  const reordered = arrayMove(items, oldIdx, newIdx)
  return reordered.map((item, idx) => ({ ...item, position: idx + 1 }))
}

describe('F-v2-4.10 — CONDITION_FIELDS', () => {
  it('tiene la clave servidumbre.aplica', () => {
    expect(CONDITION_FIELDS_TEST).toHaveProperty('servidumbre.aplica')
  })

  it('tiene la clave personeria.aplica', () => {
    expect(CONDITION_FIELDS_TEST).toHaveProperty('personeria.aplica')
  })

  it('los valores son strings no vacíos', () => {
    for (const v of Object.values(CONDITION_FIELDS_TEST)) {
      expect(v.length).toBeGreaterThan(0)
    }
  })
})

describe('F-v2-4.10 — addBlock', () => {
  it('agrega un bloque al final', () => {
    const items = [makeItem({ position: 1 }), makeItem({ position: 2 })]
    const result = addBlock(items, { id: 'b-3', name: 'Nuevo bloque', category: 'clausula' })
    expect(result).toHaveLength(3)
    expect(result[2].block_id).toBe('b-3')
  })

  it('el bloque agregado tiene position = items.length + 1', () => {
    const items = [makeItem({ position: 1 }), makeItem({ position: 2 })]
    const result = addBlock(items, { id: 'b-3', name: 'Bloque', category: 'firma' })
    expect(result[2].position).toBe(3)
  })

  it('el bloque agregado tiene is_optional false y condition_field null', () => {
    const result = addBlock([], { id: 'b-1', name: 'Bloque', category: 'encabezado' })
    expect(result[0].is_optional).toBe(false)
    expect(result[0].condition_field).toBeNull()
  })
})

describe('F-v2-4.10 — removeBlock', () => {
  it('elimina el bloque con el id indicado', () => {
    const a = makeItem({ id: 'a', position: 1 })
    const b = makeItem({ id: 'b', position: 2 })
    const c = makeItem({ id: 'c', position: 3 })
    const result = removeBlock([a, b, c], 'b')
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('renumera posiciones tras eliminar', () => {
    const a = makeItem({ id: 'a', position: 1 })
    const b = makeItem({ id: 'b', position: 2 })
    const c = makeItem({ id: 'c', position: 3 })
    const result = removeBlock([a, b, c], 'a')
    expect(result.map((i) => i.position)).toEqual([1, 2])
  })

  it('retorna lista vacía si se elimina el único elemento', () => {
    const a = makeItem({ id: 'a', position: 1 })
    const result = removeBlock([a], 'a')
    expect(result).toHaveLength(0)
  })
})

describe('F-v2-4.10 — reorder (DnD)', () => {
  it('mueve elemento del índice 0 al 2', () => {
    const items = [
      makeItem({ id: 'a', position: 1 }),
      makeItem({ id: 'b', position: 2 }),
      makeItem({ id: 'c', position: 3 }),
    ]
    const result = reorder(items, 0, 2)
    expect(result.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('renumera posiciones tras reordenar', () => {
    const items = [
      makeItem({ id: 'a', position: 1 }),
      makeItem({ id: 'b', position: 2 }),
      makeItem({ id: 'c', position: 3 }),
    ]
    const result = reorder(items, 2, 0)
    expect(result.map((i) => i.position)).toEqual([1, 2, 3])
  })

  it('no cambia nada si oldIdx === newIdx', () => {
    const items = [
      makeItem({ id: 'a', position: 1 }),
      makeItem({ id: 'b', position: 2 }),
    ]
    const result = reorder(items, 1, 1)
    expect(result.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('F-v2-4.10 — ArticleItem shape', () => {
  it('un item tiene todos los campos requeridos', () => {
    const item = makeItem()
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('block_id')
    expect(item).toHaveProperty('block_name')
    expect(item).toHaveProperty('block_category')
    expect(item).toHaveProperty('position')
    expect(item).toHaveProperty('is_optional')
    expect(item).toHaveProperty('condition_field')
  })

  it('la posición es un número positivo', () => {
    const item = makeItem({ position: 5 })
    expect(item.position).toBeGreaterThan(0)
  })
})

