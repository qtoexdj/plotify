# Storage Buckets (Supabase)

**Tag:** #db #storage
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Generacion de Documentos]]

---

## Vision general

2 buckets de almacenamiento en Supabase para archivos de usuario.

---

## Bucket: avatars

**Proposito:** Fotos de perfil de usuarios.

**Migracion:** `20260310195608_add_profile_fields_and_avatar_bucket.sql`

**Politicas RLS (4):**
1. SELECT publico — cualquier usuario autenticado puede ver avatares.
2. INSERT propio — cada usuario puede subir su propio avatar.
3. UPDATE propio — cada usuario puede actualizar su propio avatar.
4. DELETE propio — cada usuario puede borrar su propio avatar.

**Campos relacionados:** `profiles.avatar_url`

---

## Bucket: documents

**Proposito:** Documentos legales generados (PDFs de escrituras, deslindes).

**Creacion:** Creado via Supabase Dashboard (no tiene archivo de migracion).

**Politicas RLS:**
- SELECT: usuarios autenticados de la org pueden descargar documentos.
- INSERT: solo el sistema (service role) puede subir documentos generados.
- Las politicas filtran por `organization_id`.

**Uso:**
- Se guardan al generar documentos legales (pipeline Jinja2 → WeasyPrint → PDF).
- La URL se almacena en `generated_documents.file_url`.
- Accesible desde el frontend `/documentos/historial`.

---

## Acceso desde el codigo

### Frontend (browser)

```typescript
// Subir avatar
const { data } = await supabase.storage
  .from('avatars')
  .upload(filePath, file)

// Descargar documento
const { data } = await supabase.storage
  .from('documents')
  .createSignedUrl(path, expiresIn)
```

### Microservicio (service role)

El microservicio usa la service role key para subir documentos sin restricciones de RLS.

---

## Relacionado
- [[Generacion de Documentos]] — Pipeline que genera los PDFs
- [[Schema General BD]] — Referencia a los buckets
- [[Tablas Documentos BD]] — Tabla generated_documents con file_url
