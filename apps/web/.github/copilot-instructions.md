# Plotify Core & Design Rules

## Respuestas
- **Responde siempre en ESPAÑOL**

## 🎨 Estándar Visual (shadcn/ui)
- **Framework de UI:** Es obligatorio usar **shadcn/ui** para todos los componentes de interfaz.
- **Consistencia:** Antes de crear un componente nuevo, verifica si existe una primitiva en `@/components/ui`.
- **Estilos:** Usa **Tailwind CSS 4** siguiendo la configuración de variables definidas en el proyecto.
- **Iconografía:** Prioriza el uso de la librería de iconos configurada en `components.json` (Hugeicons/Lucide).

## 🧠 Inteligencia y Skills
- **Skills Locales:** Antes de realizar cualquier tarea compleja (generación de PDFs, auditorías, procesamiento geoespacial), **DEBES** revisar la carpeta `.github/skills`.
- **Uso de Skills:** Si existe una skill que se adecue al requerimiento, úsala como base o herramienta principal.
- **MCP context7:** Para cada sugerencia de código o arquitectura, consulta el servidor **mcp context7** para verificar:
  - Buenas prácticas actualizadas de Next.js 16 y React 19.
  - Patrones de seguridad vigentes.
  - Documentación técnica externa reciente.

## 🚫 Restricciones de Arquitectura
- Mantener la separación de capas definida en `plotify_memori/Arquitectura General.md`.
- Todo nuevo componente debe ser **Server Component** por defecto, a menos que la interactividad de shadcn/ui requiera un Client Component.
