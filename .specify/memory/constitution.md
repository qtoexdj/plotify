# Plotify Constitution

Esta constitución define los principios fundamentales, restricciones de arquitectura y reglas de calidad no negociables para el desarrollo de **Plotify**, la plataforma CRM SaaS especializada en la administración de proyectos, gestión de clientes, vendedores y automatización documental para loteos de parcelas y terrenos en Chile.

---

## Core Principles

### I. Producto Piloto Primero (Flujo Core KMZ)

El MVP de Plotify prioriza la estabilidad, fiabilidad y precisión en el flujo operativo del "piloto cliente real en Chile" por sobre cualquier funcionalidad experimental o exploratoria.

- **Alcance Core V1:** El flujo fundamental consiste en la importación de archivos **KMZ** para crear proyectos, la subdivisión automática de lotes con sus geometrías y deslindes, la asignación de proyectos a vendedores, la operación omnicanal (Web y bot de Telegram para vendedores en terreno) y la aprobación administrativa web de reservas/ventas con generación documental automática.
- **Fuera de Alcance V1:** Firma electrónica avanzada integrada de terceros, CRM masivo de marketing automatizado sin supervisión, comparadores visuales automatizados de documentos de identidad, y flujos de reserva 100% autónomos sin validación humana.

### II. Geometría Espacial como Origen de Deslindes y Documentos

Los límites geográficos y la metadata técnica extraída de los archivos KMZ constituyen la base legal y física de cada propiedad en la plataforma.

- **Automatización de Deslindes:** El sistema debe derivar de manera matemática y textual los deslindes reales de cada lote (linderos norte, sur, este, oeste, dimensiones y superficie total en metros cuadrados/hectáreas) a partir del KMZ procesado.
- **Generación de Documentos:** Esta metadata geográfica es la fuente de verdad que alimenta el motor de plantillas para la generación ágil e inequívoca de escrituras de promesa de compraventa, contratos de reserva y fichas técnicas, asegurando una correlación absoluta entre el plano digital y el documento legal.
- **Repositorio de Documentos Técnicos:** Cada proyecto y lote debe actuar como un almacén seguro para la documentación técnica requerida en las operaciones chilenas, tales como planos aprobados por el SAG, resoluciones de subdivisión, certificados de dominio vigente del Conservador de Bienes Raíces (CBR) y roles de avalúo.

### III. Supabase y Migraciones Canónicas

Supabase (PostgreSQL + pgvector) es la única fuente transaccional y operativa de verdad (_Single Source of Truth_).

- Ningún documento local, mensaje de chat, interacción de Telegram o contexto de IA puede suplantar, omitir o actuar independientemente del estado estructurado en la base de datos.
- **Centralización Absoluta:** Todas las migraciones deben vivir exclusivamente en `packages/database/supabase/migrations`. Queda terminantemente prohibido crear carpetas de migración en las aplicaciones individuales (`apps/web` o `apps/api`).
- Toda modificación del esquema debe acompañarse de su correspondiente script de migración incremental y validarse localmente mediante `pnpm verify:migrations`.

### IV. Contratos Tipados Entre Servicios

La comunicación y transferencia de datos entre la aplicación web (Next.js) y el microservicio de IA/mensajería (FastAPI) se rige bajo contratos estrictos y tipados estáticamente.

- Se prohíben las llamadas a rutas _ad-hoc_ sin tipado o contratos manuales.
- FastAPI actúa como el motor que expone el esquema OpenAPI (versión autogenerada).
- El frontend debe generar sus clientes API y tipos TypeScript consumiendo este esquema canónico a través del comando `pnpm contracts:generate`.

### V. Seguridad Multi-Tenant y Asignación de Vendedores

Plotify garantiza un aislamiento multi-tenant absoluto para resguardar la privacidad comercial de las parceladoras y desarrolladores clientes.

- **Inferencia del Tenant:** Ningún endpoint que requiera roles de servicio o credenciales administrativas debe confiar en el `organization_id` enviado libremente por el frontend. La API o Server Action debe inferir y validar la pertenencia del tenant contrastando el JWT del usuario autenticado con las relaciones persistidas en la DB.
- **Asignación de Vendedores:** Un vendedor registrado en la plataforma solo podrá visualizar, consultar mediante Telegram y operar sobre los proyectos específicos que tenga expresamente asignados por el administrador de su inmobiliaria.
- **Auditoría Completa (Nivel B):** Es obligatorio registrar con trazabilidad histórica todo cambio comercial, legal, documental, de pertenencia de tenant o integración externa. Cada evento crítico (modificación de precios, reservas de terrenos, cambio de estado contractual, mutación de roles y accesos) debe auditarse de manera atómica.

### VI. Testing y Gates de Calidad Obligatorios

La calidad del software no es opcional. El monorepo exige la ejecución de pruebas y validaciones sistemáticas antes de dar por cerrado cualquier cambio en componentes críticos.

- **Testing Exigido:** Es obligatorio escribir y ejecutar tests para cualquier modificación que toque: importación y parseo de archivos KMZ, cálculo de deslindes espaciales, contratos de comunicación API, políticas RLS/Tenant de Supabase, scripts de migración de base de datos, lógica de generación de documentos, transacciones de reservas/ventas y bot de Telegram.
- **Calidad de Código y Estilos:** Se exige el cumplimiento estricto del estándar de interfaz basado en **shadcn/ui** y **Tailwind CSS 4** siguiendo la paleta corporativa y variables del sistema.

---

## Restricciones y Calidad Arquitectónica

### Integraciones Externas Seguras

Cualquier llamada o integración con un proveedor externo (pasarelas de pago, APIs de mensajería, servidores geospaciales o modelos fundacionales de IA) debe estar sujeta a:

- Un _allowlist_ explícito de dominios permitidos.
- Configuración estricta de _timeouts_ no superiores a 10 segundos para evitar bloqueos del microservicio FastAPI.
- Sanitización exhaustiva y validación estricta de URLs/hosts antes de procesar payloads.

---

## Calidad y Gates del Pipeline

Antes de marcar una tarea como completada, se deben ejecutar y superar satisfactoriamente los siguientes procesos de verificación según corresponda a los archivos modificados:

| Comando                   | Propósito                                                                   |
| :------------------------ | :-------------------------------------------------------------------------- |
| `pnpm typecheck:web`      | Validación de tipos TypeScript en la aplicación web.                        |
| `pnpm test:web`           | Ejecución de pruebas unitarias y de integración del frontend.               |
| `pnpm build:web`          | Compilación de producción del frontend para asegurar compatibilidad.        |
| `pnpm test:api`           | Ejecución de pruebas unitarias y de integración de la API Python (FastAPI). |
| `pnpm verify:migrations`  | Validación e integridad de los esquemas y scripts de Supabase.              |
| `pnpm contracts:generate` | Regeneración y validación de tipos e interfaces compartidas.                |

---

## Gobernanza

- Esta constitución tiene rango de norma suprema de ingeniería en el monorepo.
- Toda adición, enmienda o desviación excepcional de estos principios debe documentarse en una decisión de arquitectura formal (ADR) y ratificarse actualizando este archivo.

**Version**: 1.0.0 | **Ratified**: 2026-05-25 | **Last Amended**: 2026-05-25
