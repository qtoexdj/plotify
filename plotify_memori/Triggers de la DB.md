# Triggers de la Base de Datos

**Tag:** #db
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Procedimientos Atomicos]]

---

## Vision general

4 triggers activos en la base de datos que automatizan comportamientos clave.

---

## 1. on_auth_user_created (handle_new_user)

**Migracion:** `20260107170400_handle_new_user.sql`

**Cuando:** Despues de INSERT en `auth.users`.

**Que hace:**
- Crea automaticamente un registro en `profiles` con el `id` del nuevo usuario.
- Copia email y metadata del signup.

**Importancia:** Sin este trigger, los usuarios nuevos no tendrian perfil y no podrian acceder al sistema.

---

## 2. lot_records_on_lot_insert

**Migracion:** `20260113171352_add_lot_records_insert_trigger.sql`

**Cuando:** Despues de INSERT en `lots` con estado `reservado`.

**Que hace:**
- Crea automaticamente un `lot_record` vacio vinculado al lote.
- Asegura que todo lote reservado tenga su ficha contractual.

**Importancia:** Evita lotes reservados sin ficha de seguimiento.

---

## 3. trg_guard_legal_fields

**Migracion:** `20260212200000_add_lot_verification.sql`

**Cuando:** Antes de UPDATE en `lots` cuando cambia `verified_status`.

**Que hace:**
- Valida que los campos legales requeridos esten presentes antes de marcar un lote como verificado.
- Campos protegidos: area oficial, boundaries, servidumbre.
- Rechaza la actualizacion si faltan datos requeridos.

**Importancia:** Previene lotes marcados como verificados sin datos legales completos.

---

## 4. trg_single_active_prompt

**Migracion:** `20260331012911_create_prompt_ops_tables.sql`

**Cuando:** Despues de UPDATE en `prompt_versions` cuando se cambia `is_active`.

**Que hace:**
- Asegura que solo una version de un prompt sea activa a la vez.
- Si se activa una version nueva, desactiva la anterior automaticamente.

**Importancia:** Previene conflictos de multiples versiones activas del mismo prompt.

---

## Resumen

| Trigger | Tabla | Timing | Proposito |
|---------|-------|--------|-----------|
| on_auth_user_created | auth.users | AFTER INSERT | Crear perfil automatico |
| lot_records_on_lot_insert | lots | AFTER INSERT (reservado) | Crear ficha contractual |
| trg_guard_legal_fields | lots | BEFORE UPDATE | Validar datos legales |
| trg_single_active_prompt | prompt_versions | AFTER UPDATE | Una version activa por prompt |

## Relacionado
- [[Procedimientos Atomicos]] — Triggers y procedimientos atomicos
- [[Tablas Core BD]] — Tablas que disparan los triggers
- [[Tablas Agente IA]] — Trigger de prompt_versions
