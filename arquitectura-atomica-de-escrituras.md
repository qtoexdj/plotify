# Arquitectura Atómica de Escrituras - Orquestador Plotify

Este modelo divide la escritura en módulos independientes (Artículos/Cláusulas). Cada módulo consume variables específicas y puede ser activado, desactivado o editado por el cliente final sin afectar la integridad del documento.

---

## 1. Diccionario de Variables Completo (Payload JSON)

Para alimentar los módulos, el sistema debe recolectar las siguientes variables exactas:

### 1.1. Variables de Comparecientes (Aplica para Vendedor y Comprador)

- `vendedor.tipo` / `comprador.tipo`: (Enum: "natural" | "juridica")
- [cite_start]`vendedor.nombre` / `comprador.nombre`: (Ej. "INMOBILIARIA BELLA VISTA SpA" o "JUAN DE DIOS GALAZ ABARCA") [cite: 3, 112]
- [cite_start]`vendedor.rut` / `comprador.rut`: (Formato XX.XXX.XXX-X) [cite: 50, 148]
- [cite_start]`vendedor.rut_letras` / `comprador.rut_letras`: (Para la redacción notarial) [cite: 6]
- [cite_start]`vendedor.nacionalidad` / `comprador.nacionalidad` [cite: 6, 7]
- [cite_start]`vendedor.estado_civil` / `comprador.estado_civil` [cite: 7, 115]
- [cite_start]`vendedor.profesion_giro` / `comprador.profesion_giro`: (Ej. "empresario", "dueña de casa", o giro comercial) [cite: 58, 116]
- [cite_start]`vendedor.domicilio` / `comprador.domicilio`: (Calle, número, depto, comuna, región) [cite: 6, 7]
- [cite_start]`vendedor.representantes` / `comprador.representantes`: (Array de objetos con los mismos datos personales anteriores, requerido solo si el tipo es "juridica") [cite: 58, 59, 60]

### 1.2. Variables del Predio Matriz (Antecedentes)

- [cite_start]`matriz.nombre_predio`: (Ej. "Resto Fundo Los Maquis" o "Hijuela número seis del ex Fundo El Condor") [cite: 8, 116]
- [cite_start]`matriz.ubicacion`: (Comuna y provincia) [cite: 8, 117]
- [cite_start]`matriz.superficie_total`: (En hectáreas o metros cuadrados) [cite: 8, 117]
- [cite_start]`matriz.deslindes`: (Objeto con `norte`, `sur`, `oriente`, `poniente`, etc., de la propiedad original) [cite: 8, 9, 10, 117, 118]
- [cite_start]`matriz.adquisicion_modo`: (Texto que explica a quién se compró, ej. "Por compra que hicieron a...") [cite: 19, 119]
- [cite_start]`matriz.adquisicion_notaria`: (Nombre del notario y ciudad) [cite: 19, 119]
- [cite_start]`matriz.adquisicion_fecha`: (Fecha de la escritura anterior) [cite: 19, 119]
- [cite_start]`matriz.adquisicion_repertorio`: (Número y año) [cite: 19, 120]
- [cite_start]`matriz.inscripcion_fojas`: [cite: 21, 119]
- [cite_start]`matriz.inscripcion_numero`: [cite: 21, 119]
- [cite_start]`matriz.inscripcion_anio`: [cite: 21, 119]
- [cite_start]`matriz.inscripcion_cbr`: (Conservador respectivo) [cite: 21, 119]
- [cite_start]`matriz.rol_avaluo`: (Número de rol matriz) [cite: 22, 121]

### 1.3. Variables de Subdivisión (SAG)

- [cite_start]`sag.certificado_numero`: [cite: 23, 122]
- [cite_start]`sag.certificado_fecha`: [cite: 23, 122]
- [cite_start]`sag.plano_cbr_numero`: [cite: 23, 122]
- [cite_start]`sag.plano_cbr_anio`: [cite: 23, 122]

### 1.4. Variables del Lote a Vender

- [cite_start]`lote.numero_nombre`: (Ej. "LOTE N CIENTO SESENTA Y TRES" o "LOTE CUARENTA Y TRES") [cite: 24, 123]
- [cite_start]`lote.superficie_total`: (Texto y números) [cite: 24, 123]
- [cite_start]`lote.deslindes`: (Array u objeto con los linderos específicos del lote: Nororiente, Surponiente, etc.) [cite: 24, 25, 26, 27, 123, 124, 125, 126]
- [cite_start]`lote.rol_tramite`: (Número de rol en trámite y comuna) [cite: 28, 127]

### 1.5. Variables de Servidumbre (Si aplica)

- `servidumbre.aplica`: (Boolean)
- [cite_start]`servidumbre.superficie`: (Metros o hectáreas afectadas) [cite: 24, 163]
- [cite_start]`servidumbre.deslindes_tramo`: (Objeto con los deslindes específicos de la franja de servidumbre) [cite: 33, 34, 35, 36, 173, 174, 175, 176]

### 1.6. Variables de Transacción

- [cite_start]`transaccion.precio_numeros`: [cite: 28, 127]
- [cite_start]`transaccion.precio_letras`: [cite: 28, 127]
- [cite_start]`transaccion.forma_pago`: (Ej. "al contado y en dinero en efectivo") [cite: 29, 127, 128]

### 1.7. Variables Legales y Representación

- [cite_start]`mandato.nombre_representante`: (Quien rectificará) [cite: 40, 140]
- [cite_start]`mandato.rut_representante`: [cite: 40, 140]
- `personeria.aplica`: (Boolean)
- [cite_start]`personeria.tipo_documento`: (Ej. "escritura pública de constitución de sociedad") [cite: 98]
- [cite_start]`personeria.notaria`: [cite: 98]
- [cite_start]`personeria.fecha`: [cite: 98]
- [cite_start]`personeria.inscripcion_fojas`: [cite: 99]
- [cite_start]`personeria.inscripcion_numero`: [cite: 99]
- [cite_start]`personeria.inscripcion_anio`: [cite: 99]
- [cite_start]`personeria.inscripcion_cbr`: [cite: 99]

---

## 2. Orquestación por Módulos (Artículos Atómicos)

En la interfaz de Plotify, el cliente verá cada uno de estos bloques como un ítem que puede editar, habilitar o deshabilitar.

### [Bloque Inicial]

- [cite_start]**Módulo Encabezado:** Inyecta "COMPRAVENTA" e inserta certificado de avalúo[cite: 1, 2, 53, 54].
- **Módulo Comparecencia:** Construye el párrafo de "comparecen: Por una parte... y por la otra...". [cite_start]Maneja dinámicamente si actúan por sí mismos o por representación (SpA)[cite: 6, 7, 58, 59, 60, 61, 115, 116, 155, 156].

### [Cuerpo de la Escritura - Artículos]

- [cite_start]**`[ART-01] PRIMERO - Antecedentes:`** Fija la propiedad de la matriz, sus deslindes generales, historia de títulos y Rol matriz[cite: 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 116, 117, 118, 119, 120, 121, 156, 157, 158, 159, 160, 161]. _(Fijo)_
- [cite_start]**`[ART-02] SEGUNDO - Subdivisión y Lote:`** Detalla el certificado SAG y describe exclusivamente el Lote que se está vendiendo, con sus propios deslindes y Rol en trámite[cite: 22, 23, 24, 25, 26, 27, 28, 76, 77, 78, 79, 80, 81, 82, 121, 122, 123, 124, 125, 126, 127, 161, 162, 163, 164, 165, 166, 167]. _(Fijo)_
- [cite_start]**`[ART-03] TERCERO - Objeto de Venta:`** "Vende, cede y transfiere..." el lote individualizado[cite: 28, 82, 127, 167]. _(Fijo)_
- [cite_start]**`[ART-04] CUARTO - Precio y Pago:`** Monto y renuncia a acciones resolutorias[cite: 28, 29, 30, 82, 83, 84, 127, 128, 129, 167, 168, 169]. _(Fijo)_
- [cite_start]**`[ART-05] QUINTO - Venta Ad-Corpus:`** Aceptación del estado de la propiedad, usos y costumbres[cite: 30, 84, 129, 130, 169, 170]. _(Fijo)_
- [cite_start]**`[ART-06] SEXTO - Servidumbre:`** Constitución de servidumbre de tránsito (Predio sirviente/dominante y sus deslindes).[cite: 30, 31, 32, 33, 34, 35, 36, 37, 84, 85, 86, 87, 88, 89, 90, 91, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181]. _(Toggle Opcional: Solo si `servidumbre.aplica` == true)_
- [cite_start]**`[ART-07] SÉPTIMO - Entrega Material:`** Fecha de entrega (usualmente la misma de la escritura)[cite: 37, 91, 131, 182]. _(Fijo)_
- [cite_start]**`[ART-08] OCTAVO - Gastos:`** Determina quién paga la inscripción (generalmente el comprador)[cite: 37, 38, 91, 92, 131, 132, 182, 183]. _(Fijo)_
- [cite_start]**`[ART-09] NOVENO - Domicilio Judicial:`** Fijación de competencia de tribunales[cite: 38, 92, 132, 183]. _(Fijo)_
- [cite_start]**`[ART-10] DÉCIMO - Finiquito:`** Anula promesas o acuerdos previos[cite: 38, 92, 132, 183]. _(Fijo)_
- [cite_start]**`[ART-11] UNDÉCIMO - Exoneraciones Especiales (Agua/Luz/CONAF):`** Letras a), b) y c) que eximen de responsabilidad al vendedor sobre servicios básicos y tala de árboles[cite: 132, 133, 134, 135, 136, 137, 138, 139, 183, 184, 185, 186, 187, 188, 189, 190]. _(Toggle Opcional)_
- [cite_start]**`[ART-12] DUODÉCIMO - Impuestos y Exención (Ley 825):`** Declaración de no afecto a IVA por ser predio rural[cite: 38, 39, 92, 93, 139, 140, 190, 191]. _(Fijo)_
- [cite_start]**`[ART-13] DECIMOTERCERO - Mandato de Rectificación:`** Faculta a una persona específica para corregir la escritura en el CBR[cite: 39, 40, 41, 93, 94, 95, 96, 140, 141, 142, 143, 191, 192, 193, 194]. _(Fijo)_
- [cite_start]**`[ART-14] DECIMOCUARTO - Deudores de Alimentos (Ley 21.389):`** Declaración de no adeudar pensiones[cite: 41, 42, 96, 143, 194]. _(Fijo)_
- [cite_start]**`[ART-15] DECIMOQUINTO - Uso de Suelo (LGUC):`** Prohibición de cambiar destino agrícola[cite: 42, 96, 97, 143, 144, 194, 195]. _(Fijo)_
- [cite_start]**`[ART-16] DECIMOSEXTO - Facultad de Copia:`** Autoriza al portador de copia para trámites[cite: 42, 43, 97, 144, 195]. _(Fijo)_

### [Bloque Final]

- [cite_start]**Módulo Certificados / Personerías:** Inserta un párrafo extra antes del cierre indicando dónde constan los poderes de los representantes[cite: 44, 98, 99, 100]. _(Toggle Automático: Se activa si hay persona jurídica)_
- [cite_start]**Módulo Cierre y Firmas:** Párrafo notarial de cierre ("En comprobante y previa lectura...") y generación dinámica de las líneas de firma con RUT y "p.p." si es por poder[cite: 45, 46, 47, 48, 49, 50, 51, 52, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 145, 146, 147, 148, 149, 150, 196, 197, 198, 199, 200, 201].
