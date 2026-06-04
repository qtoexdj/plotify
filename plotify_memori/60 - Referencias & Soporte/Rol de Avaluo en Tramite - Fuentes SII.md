---
title: Rol de Avaluo en Tramite - Fuentes SII
aliases:
  - Rol de avaluo en tramite
  - Preroles SII
date: 2026-06-03
status: referencia
tags:
  - referencia
  - legal
  - sii
  - escrituras
related:
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
  - "[[SDD 006 Escrituras Lab - Minuta DOCX y Readiness]]"
---

# Rol de Avaluo en Tramite - Fuentes SII

## Criterio para Plotify

En una primera transferencia de un lote nacido de una subdivision, la expresion
`Rol de avaluo en tramite` debe tratarse como una forma valida de
individualizacion tributaria del lote, no como dato faltante.

El numero lo respalda el Servicio de Impuestos Internos mediante certificado de
asignacion de roles/preroles. El Conservador informa o registra la inscripcion y
la enajenacion por el flujo F2890, pero Plotify no debe describirlo como quien
crea el rol.

## Regla de template

Cuando exista respaldo SII, el template puede renderizar:

```text
Rol de avaluo en tramite numero [rol] de la comuna de [comuna].
```

Variables recomendadas:

- `sii.certificado_asignacion_roles_numero`
- `sii.certificado_fecha_emision`
- `sii.solicitud_numero`
- `sii.rol_matriz`
- `sii.pre_rol_lote`
- `sii.rol_avaluo_en_tramite_texto`
- `sii.rol_avaluo_definitivo`
- `sii.unidad_nombre`

## Fuentes SII consultadas

- [SII - Documentos requeridos para solicitudes de bienes raices](https://www.sii.cl/servicios_online/1048-doctos_requeridos-2573.html)
- [SII - Solicitar asignacion de numero de rol de avaluo](https://www.sii.cl/como_se_hace_para/peticiones_administrativas/asignacion_numero_rol_avaluo.pdf)
- [SII - Resolucion Exenta 4553 de 1996](https://www.sii.cl/documentos/resoluciones/1996/reso4553.htm)
- [SII - FAQ division de inmueble](https://www.sii.cl/preguntas_frecuentes/aval_contrib_bbrr/001_165_2743.htm)
- [SII - FAQ asignacion de rol](https://www.sii.cl/preguntas_frecuentes/aval_contrib_bbrr/001_165_2108.htm)
- [SII - FAQ Formulario 2890](https://www.sii.cl/preguntas_frecuentes/aval_contrib_bbrr/001_165_8878.htm)

## Implicancia de producto

- El estado `rol_en_tramite` no debe disparar alerta roja si existe evidencia
  SII o aprobacion legal.
- El gate `sii_verified` debe exigir rol matriz y pre-rol/rol de avaluo en
  tramite del lote.
- Si no existe respaldo documental, el caso debe quedar en `manual_review` o
  bloqueado hasta resolver la evidencia.

