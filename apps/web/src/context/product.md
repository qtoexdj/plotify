# Plotify - Especificación de Producto

## 📋 Descripción del Producto

Plotify es una plataforma SaaS B2B diseñada para **empresas inmobiliarias y desarrolladores de loteos** que necesitan:

1. Gestionar proyectos de subdivisión de terrenos
2. Importar datos geoespaciales desde archivos KMZ/KML y CAD (DXF/DWG - **Congelado V2.1**)
3. Asignar geometrías a lotes individuales
4. Gestionar el estado del lote y su ficha contractual (cliente, escritura, CBR, gastos)
5. Visualizar KPIs globales y rendimiento de ventas a través de un Dashboard de Bienvenida centralizado.

---

## 👥 Actores del Sistema

### 0. **Super Admin** (global)
- Acceso transversal a todas las empresas, usuarios, proyectos y auditoría
- UI dedicada bajo `/super-admin` con sidebar propio
- Se identifica por `profiles.is_super_admin = true`

### 1. **Owner/Administrador** (único rol actual)
- Usuario autenticado propietario de proyectos
- Puede crear, editar, eliminar proyectos
- Asigna geometrías a lotes
- Gestiona la ficha por lote y estados de venta

### 2. **Vendedor** (modelo preparado, no implementado en UI)
- Asociado a proyectos del owner
- Puede reservar lotes y gestionar la ficha del lote asignado

### 3. **Comprador** (no es usuario del sistema)
- Se registra como datos de ficha en cada lote
- No existe un perfil global de cliente en el sistema

---

## 🔄 Flujos de Negocio Principales

### Flujo 0: Acceso Super Admin
1. Login por Supabase Auth
2. Si `profiles.is_super_admin = true` se redirige a `/super-admin`
3. Acceso a dashboard global, empresas, usuarios, proyectos y auditoría

### Flujo 1: Crear Proyecto (Onboarding Wizard)

```
┌─────────────────────┐
│ Paso 1: Datos       │
│ - Nombre            │
│ - Región/Comuna     │
│ - Total lotes       │
│ - Formato Nombre    │
│   (Prefijo/Sufijo)  │
│ - Precio Inicial    │
│   (Fijo/Variable)   │
│ - Reserva Inicial   │
│   (Fijo/Variable)   │
└────────┬────────────┘
         │
         ▼
┌──────────────────┐
│ Paso 2: Upload   │
│ - KMZ, KML o CAD  │
│ - (DXF/DWG)      │
│ - Parseo auto    │
│ - Clasificación  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Paso 3: Asignar  │
│ - Canvas Konva   │
│   (Onboarding)   │
│ - Select geom    │
│ - Assign to lot  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Paso 4: Confirm  │
│ - Resumen        │
│ - Redirección    │
└──────────────────┘
```

### Flujo 2: Gestión de Lotes

| Estado | Descripción | Transiciones permitidas |
|--------|-------------|------------------------|
| `disponible` | Lote libre para venta | → `reservado` |
| `reservado` | Con reserva activa | → `vendido` o → `disponible` |
| `vendido` | Venta completada | (final) |

**Ficha por lote**:
- Cada lote tiene una única ficha (`lot_records`)
- Se guarda información de cliente, escritura, CBR, gastos y comisión

### Flujo 3: Visualización de Proyecto

- Vista de detalle con tabs: Overview, Lotes, **Visor (MapLibre GL)**, Clientes
- Gestión interactiva: clics en lotes del mapa abren la ficha directamente
- **Dark Mode completo**: Basemap, capas, labels, sidebar y todos los paneles soportan tema claro/oscuro vía `next-themes`.
- **Ficha Técnica Mejorada**:
  - **Superficie (m²) Auto-Calculada**: Se calcula automáticamente. Muestra `area_official_m2` o `area_legal_m2`. 
  - **Servidumbre y Superficie Neta**: Muestra los m² de servidumbre (caminos internos o de tránsito) y la Superficie Neta (Area Total - Servidumbre).
  - **Motor de Servidumbre v2 (Geométrico)**: La servidumbre se calcula geométricamente mediante la intersección del polígono del lote con el buffer del camino (`road_geometry` del proyecto, con `road_width_m` metros de ancho). El resultado es el mini-polígono de servidumbre real. El motor clasifica cada arista del mini-polígono como:
    - **`internal`**: colinda con el lote propio ("con la misma propiedad, esto es, lote N")
    - **`neighbor`**: colinda con un lote vecino ("con servidumbre que grava al lote N")
    - **`external`**: colinda con predio externo ("con lote N de anterior subdivisión")
    - Detecta automáticamente escenarios **multi-tramo** (lotes esquina donde el camino aparece en dos deslindes).
    - **Ocultamiento de cabezas**: Los lados cortos del mini-polígono (ancho del camino ≤ `road_width_m + 2`m) no llevan distancia en el texto legal, por norma notarial chilena.
    - **Fallback legacy**: Si no hay `road_geometry` o el análisis falla, usa `generateServidumbreTextLegacy()` con `boundaries_official` del lote.
  - **Superficie read-only en edición**: El campo m2 está deshabilitado en el formulario de edición. Solo se modifica vía Verificación Legal o recálculo UTM / Servidumbre.
  - Precio (CLP) sigue siendo editable.
- **Módulo Legal de Verificación** (Pestaña Legal):
  - **Componente único**: Panel de Verificación Legal con deslindes oficiales editables.
  - **Deslindes Oficiales — Layout de Cards**: Cada deslinde se muestra como una card individual con:
    - **Fila superior**: Orientación (input de ancho completo, sin truncar "Norponiente"/"Nororiente") + distancia con sufijo "m" (`InputGroup` de shadcn/ui) + botón eliminar
    - **Fila inferior**: "Colinda con" (input de ancho completo)
    - Deslindes que colindan con caminos se destacan con borde/fondo amber y tooltip informativo.
  - **Superficie Oficial**: Permite sobrescribir los valores calculados por los valores del plano oficial.
  - **Deslindes Oficiales Agrupados**: Detección automática y agrupación de deslindes analizando la "Normal Exterior" al polígono. La orientación se determina usando saltos geográficos de `22.5°` en cuadrantes Azimutales.
  - **Generación Textual Inteligente**: Al exportar deslindes, el sistema genera automáticamente texto legal estructurado:
      - **Detección de Servidumbres**: "servidumbre de por medio" (contacto total) vs "parte servidumbre" (contacto parcial).
      - **Prefijo de Proporción ("Parte del")**: Si el solape con un vecino es significativamente menor a la longitud total de su cara (ej: solape 35m vs cara 90m), se antepone automáticamente "parte del" al nombre del vecino.
      - **Manejo de Múltiples Vecinos**: Agrupación inteligente ("Lote 5, parte servidumbre, y parte del Lote 6, ambos de la misma subdivisión").
      - **Resiliencia CAD**: El motor de cálculo es inmune a la fragmentación de aristas en archivos DXF/DWG mediante suma colineal de segmentos.
  - **Sincronización**: Al verificar, el valor oficial se refleja automáticamente en la card de Superficie de la pestaña General.
  - **Edición Manual Flexible**: Los deslindes permiten editar individualmente la distancia en metros y sobrescribir la Orientación Cardinal calculada matemáticamente (Ej: de "Surponiente" a "Sur") para calzar exactamente con borradores notariales existentes.
  - **Estados de Verificación**: `draft`, `verified_exact` y `verified_override`.
  - **Protección de Datos**: Solo el Administrador del Proyecto puede modificar datos legales; los cambios son bloqueados por trigger para otros roles.
- Métricas calculadas en tiempo real: lotes libres, reservados, vendidos

---

## 📐 Reglas de Negocio Críticas

### Multitenancy
- **REGLA #1**: Todo proyecto, lote, geometría y ficha de lote pertenece a un `owner_id` u `organization_id`
- **RLS (Row Level Security)** de Supabase filtra automáticamente por usuario
- NUNCA mostrar datos de otros owners
- Si el usuario pertenece a una organización, opera en modo organización (no modo personal)
- En modo organización, los proyectos se crean con `organization_id` y solo miembros con rol `admin` pueden crearlos

### Super Admin
- El rol global se maneja con `profiles.is_super_admin`
- RLS permite acceso total solo cuando `is_super_admin()` retorna `true`

### Geometrías
- **Tipos**: `lot`, `road`, `common_area`
- Un lote puede tener **máximo 1 geometría** asignada.
- **Filtrado Visual**: En el visor final, **solo se muestran las geometrías asignadas**.
- **Arquitectura de Camino Unificado**: Toda la red de caminos del loteo se fusiona en un solo elemento (`road_geometry` dentro del proyecto) de tipo `MultiLineString` o `Polygon` al guardarse en el Onboarding. Esto facilita el cálculo por intersecciones (servidumbres). 
- **Áreas Comunes**: Requieren marcarse con `is_assigned = true` en Onboarding para ser visibles en el visor.
- Geometrías se clasifican automáticamente por:
  - `LineString/MultiLineString` → `road`
  - Keywords en nombre (plaza, parque, etc.) → `common_area`
  - **Nomenclatura Dinámica**: Durante el onboarding, el usuario puede configurar un prefijo para los lotes (ej: "Lote ", "Parcela ") o dejarlo vacío para usar solo números. Esta regla se aplica en la creación masiva inicial.
- Default → `lot`

### Ficha de lote
- Un lote tiene una ficha única (`lot_records`) con datos del comprador y la escritura
- Al reservar lote: `Lot.estado = 'reservado'`
- Al vender lote: `Lot.estado = 'vendido'`

---

## 🚧 Restricciones y Limitaciones

1. **Sin edición de proyectos post-creación** (botón existe, funcionalidad parcial)
2. **Sin módulo global de clientes** (la ficha es por lote)
3. **Sin módulo de ventas separado en UI** (todo está en Gestión de Lotes)
4. **Sin notificaciones** ni sistema de alertas
5. **Sin exportación de datos** (PDF, Excel)
6. **Single-tenant por base de datos** (un Supabase project = un tenant)

---

## 📊 Modelo de Datos Simplificado

```
Project (1) ──────── (N) Lot
    │                    │
    │                    │ (1)
    │                    ▼
    └───────── (N) Geometry

Lot (1) ──────── (1) LotRecord
Lot (N) ──────── (1) Vendor (asignación)
```

---

## 🎯 Métricas Clave (KPIs)

Por proyecto:
- `total_lotes`: Definido al crear
- `lotes_libres`: Count where `estado = 'disponible'`
- `lotes_reservados`: Count where `estado = 'reservado'`
- `lotes_vendidos`: Count where `estado = 'vendido'`

---

