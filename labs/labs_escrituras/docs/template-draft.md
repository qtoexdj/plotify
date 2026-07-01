# Escrituras Lab: Template Inicial de Compraventa

Contexto de redaccion: actuar como abogado senior especialista en Derecho Civil chileno y practica notarial. El borrador se rige por el Codigo Civil de Chile, la Ley sobre Efecto Retroactivo de las Leyes, el Reglamento del Registro Conservatorio de Bienes Raices y la normativa aplicable a predios rusticos, subdivisiones SAG, roles SII y Conservadores de Bienes Raices.

Este template es un borrador base para el motor documental. Todo dato variable queda entre corchetes `[ ]`. Las clausulas marcadas como revision legal no deben renderizarse automaticamente sin aprobacion humana.

Alineado 2026-06-30 contra una escritura real ya otorgada del mismo caso (Teno, Lote 29): la comparecencia ya no lleva preambulo de ciudad/fecha/notario (ese dato lo agrega la notaria al momento de la firma); subdivision+individualizacion del lote se fusionaron en una sola clausula, igual que cuerpo cierto+saneamiento+gravamenes; se elimino la clausula separada de inscripciones por redundante con el bloque narrativo de titulo; servidumbre de transito y entrega material se reordenaron para seguir el orden real; se agregaron finiquito de promesa, factibilidad de servicios/permisos (agua-luz, construccion, tala de arboles) y declaracion de IVA (esta ultima, condicional, apagada por defecto); destino del predio quedo acotada a la prohibicion LGUC; y la clausula de lectura y firma perdio la nota de trazabilidad propia de Plotify.

---

## ESCRITURA PUBLICA DE COMPRAVENTA

**[vendedor.nombre]**

a

**[comprador.nombre]**

---

1. **COMPARECENCIA.** Comparecen: por una parte, como vendedor, [vendedor.nombre], [vendedor.tipo], Rol Unico Tributario numero [vendedor.rut], del giro [vendedor.profesion_giro], domiciliado para estos efectos en [vendedor.domicilio], representado por [vendedor.representantes_texto], segun se acredita en la clausula de personeria; y por la otra, como comprador, [comprador.nombre], [comprador.nacionalidad], [comprador.estado_civil], [comprador.profesion_giro], cedula nacional de identidad numero [comprador.rut], domiciliado en [comprador.domicilio]. Los comparecientes mayores de edad, quienes acreditan su identidad con las cedulas ya indicadas, exponen:

2. **ANTECEDENTES DE DOMINIO DEL PREDIO MATRIZ.** [vendedor.nombre] es dueno del inmueble denominado [matriz.nombre_predio], ubicado en [matriz.ubicacion], comuna de [matriz.comuna], provincia de [matriz.provincia], Region de [matriz.region], de una superficie aproximada de [matriz.superficie_total], y que deslinda: al Norte, [matriz.deslindes.norte]; al Sur, [matriz.deslindes.sur]; al Oriente, [matriz.deslindes.oriente]; y al Poniente, [matriz.deslindes.poniente]. Lo adquirio por [matriz.adquisicion_modo], segun escritura publica de fecha [matriz.adquisicion_fecha], otorgada en la Notaria de [matriz.adquisicion_notaria], Repertorio numero [matriz.adquisicion_repertorio], encontrandose inscrito su dominio a fojas [matriz.inscripcion_fojas], numero [matriz.inscripcion_numero], del Registro de Propiedad del Conservador de Bienes Raices de [matriz.inscripcion_cbr], correspondiente al ano [matriz.inscripcion_anio]. El rol de avaluo matriz es [matriz.rol_avaluo].

3. **SUBDIVISION, CERTIFICADO SAG Y LOTE.** El predio matriz fue subdividido conforme a la normativa aplicable a predios rusticos, segun Certificado de Subdivision emitido por el Servicio Agricola y Ganadero, numero [sag.certificado_numero], de fecha [sag.certificado_fecha], expedido por [sag.oficina_sectorial], relativo al proyecto [proyecto.nombre]. El plano respectivo fue archivado/agregado bajo el numero [sag.plano_cbr_numero], ano [sag.plano_cbr_anio], en [sag.plano_cbr_registro] del Conservador de Bienes Raices de [matriz.inscripcion_cbr]. Las partes dejan constancia que la subdivision no importa cambio de destino agricola, ganadero o forestal del predio, sin perjuicio de las autorizaciones sectoriales que fueren legalmente procedentes. Dentro de la subdivision indicada se encuentra el Lote [lote.numero], de una superficie de [lote.superficie_texto] ([lote.superficie_m2] metros cuadrados), equivalente a [lote.superficie_ha_texto], rol de avaluo en tramite [lote.rol_tramite], que deslinda: [lote.deslindes]. De la superficie indicada, [servidumbre.superficie_texto] ([servidumbre.superficie_m2] metros cuadrados) se encuentran afectos, si corresponde, a servidumbre de transito conforme se expresa en esta escritura y en el plano archivado.

4. **COMPRAVENTA.** Por el presente instrumento, [vendedor.nombre], debidamente representado, vende, cede y transfiere a [comprador.nombre], quien compra, acepta y adquiere para si, el Lote [lote.numero] individualizado en la clausula precedente, con todos sus usos, costumbres, derechos, servidumbres activas y pasivas, entradas, salidas y mejoras, libre de ocupantes, salvo [clausulas.ocupantes_excepciones], en el estado material y juridico en que actualmente se encuentra y que el comprador declara conocer y aceptar.

5. **PRECIO Y LIQUIDACION.** El precio de la compraventa es la suma unica y total de [transaccion.precio_letras] ([transaccion.moneda] [transaccion.precio_numeros]), que el comprador paga al vendedor en la siguiente forma: [transaccion.forma_pago]. Para efectos de liquidacion, las partes dejan constancia de lo siguiente: [transaccion.detalle_pago]. El vendedor declara recibir a su entera satisfaccion las sumas indicadas, otorgando por este acto el mas amplio, completo y eficaz recibo, carta de pago y finiquito respecto del precio, salvo las obligaciones pendientes expresamente indicadas en [transaccion.saldo_pendiente].

6. **CUERPO CIERTO, SANEAMIENTO Y GRAVAMENES.** La venta se hace como especie o cuerpo cierto, en el estado en que el comprador declara haber examinado el inmueble, con sus deslindes, cabida, usos, costumbres, derechos y servidumbres, sin perjuicio de las acciones que la ley concede en caso de eviccion, vicios redhibitorios, dolo, error o infraccion de normas imperativas, segun corresponda. La cabida expresada se funda en los antecedentes tecnicos y legales indicados en esta escritura y en el plano de subdivision. El vendedor respondera del saneamiento de la eviccion y de los vicios redhibitorios conforme a las reglas del Codigo Civil, salvo pacto expreso, juridicamente procedente y aprobado en revision legal. [clausulas.saneamiento_eviccion]. Asimismo, el vendedor declara que el inmueble se transfiere libre de hipotecas, gravamenes, prohibiciones, embargos, litigios, usufructos, arrendamientos, ocupantes, promesas, opciones, derechos preferentes y toda otra limitacion al dominio, salvo [evidencia.gravamenes_excepciones], segun antecedentes que constan en los certificados conservatorios vigentes tenidos a la vista para esta operacion. [evidencia.certificado_gp_referencia].

7. **EXENCION O LIMITACION EXPRESA DE EVICCION - REVISION LEGAL.** Si las partes instruyen una exencion o limitacion de responsabilidad por eviccion o vicios redhibitorios, esta solo se incorporara cuando [clausulas.exencion_eviccion_aprobada] sea verdadero, conste instruccion expresa de las partes y no afecte normas de orden publico, derechos de terceros ni prohibiciones legales. En tal caso, la redaccion aprobada sera: [clausulas.exencion_eviccion_texto]. En defecto de aprobacion expresa, esta clausula no se renderiza y rige la clausula anterior.

8. **SERVIDUMBRE DE TRANSITO.** En cuanto proceda, el Lote [lote.numero], como predio sirviente, queda afecto a una servidumbre de transito amplia, irrestricta, gratuita, perpetua y reciproca en favor de [servidumbre.predios_dominantes], como predios dominantes, para el uso de caminos, accesos, transito peatonal y vehicular, paso de servicios basicos y demas finalidades inherentes al aprovechamiento regular del proyecto, todo segun el trazado, superficie y deslindes que constan en el plano de subdivision y que se describen como sigue: [servidumbre.deslindes_tramo]. El comprador acepta expresamente la servidumbre, su ubicacion, extension, destino y cargas.

9. **ENTREGA MATERIAL.** La entrega material del inmueble vendido se efectua en este acto/a contar de [clausulas.entrega_fecha], declarando el comprador recibirlo a su entera satisfaccion, con los cierres, accesos, mejoras, servidumbres y condiciones de hecho que declara conocer. [clausulas.entrega_material].

10. **GASTOS, DERECHOS E IMPUESTOS.** Los gastos, derechos notariales, copias, impuestos si procedieren, inscripciones conservatorias, certificados y demas desembolsos necesarios para el otorgamiento, autorizacion, inscripcion y perfeccionamiento de esta escritura seran de cargo de [clausulas.gastos_cargo], salvo pacto distinto indicado en [clausulas.gastos_excepciones].

11. **DOMICILIO Y COMPETENCIA.** Para todos los efectos derivados de esta escritura, las partes fijan su domicilio especial en la ciudad y comuna de [clausulas.domicilio_contractual], y se someten a la competencia de sus Tribunales Ordinarios de Justicia, sin perjuicio de las normas imperativas de competencia que fueren aplicables.

12. **FINIQUITO DE PROMESA Y NEGOCIACIONES PREVIAS.** [clausulas.promesa_finiquito].

13. **FACTIBILIDAD DE SERVICIOS Y PERMISOS DEL COMPRADOR.** a) Factibilidad de agua y electricidad: [clausulas.factibilidad_servicios]. b) Permisos de construccion: [clausulas.permisos_construccion]. c) Permisos de corta o tala de arboles: [clausulas.permisos_tala_arboles].

14. **DECLARACION SOBRE IMPUESTO A LAS VENTAS Y SERVICIOS - CONDICIONAL, APAGADA POR DEFECTO.** Si [clausulas.iva_no_afecto_aplica] es verdadero (se activa por proyecto o vía el interruptor de activar/desactivar clausula de la mesa), se incorpora: [clausulas.iva_no_afecto_texto].

15. **MANDATO PARA RECTIFICAR, ACLARAR Y COMPLEMENTAR.** Las partes confieren mandato especial a [mandato.rectificacion_nombre], cedula nacional de identidad numero [mandato.rectificacion_rut], para que, actuando en nombre y representacion de ellas, pueda suscribir escrituras aclaratorias, complementarias o rectificatorias destinadas exclusivamente a subsanar errores, omisiones o exigencias del Conservador de Bienes Raices, Servicio de Impuestos Internos, Servicio Agricola y Ganadero u otra autoridad competente, siempre que tales actos no alteren el precio, la cosa vendida, la voluntad esencial de las partes ni importen nuevas obligaciones sustanciales. [mandato.facultades].

16. **REGISTRO NACIONAL DE DEUDORES DE PENSIONES DE ALIMENTOS.** En cumplimiento de la normativa aplicable, el notario debera verificar, cuando corresponda, la situacion de los otorgantes respecto del Registro Nacional de Deudores de Pensiones de Alimentos. La constancia, certificado o resultado de dicha consulta sera [clausulas.rnda_declaracion].

17. **DESTINO DEL PREDIO Y NORMATIVA URBANISTICA.** El Lote materia del presente instrumento queda sujeto a la prohibicion de cambiar el destino del uso del suelo, en conformidad a lo establecido en los articulos cincuenta y cinco y cincuenta y seis de la Ley General de Urbanismo y Construcciones. [clausulas.lguc_destino_suelo].

18. **PERSONERIA - CONDICIONAL.** Si aplica ([personeria.aplica], vendedor persona juridica), la personeria de [vendedor.representantes_texto] para representar a [vendedor.nombre] consta de [personeria.constitucion_texto] y de [personeria.poder_texto], documentos que no se insertan por ser conocidos de las partes y del notario que autoriza, y por haberlos tenido a la vista. La vigencia y suficiencia de dichas facultades debera encontrarse aprobada en [personeria.estado_revision]. [personeria.delegacion_facultades].

19. **PORTADOR DE COPIA E INSCRIPCION.** Se faculta al portador de copia autorizada de la presente escritura para requerir y firmar las inscripciones, subinscripciones, anotaciones, rectificaciones y demas actuaciones que fueren necesarias ante el Conservador de Bienes Raices competente, Servicio de Impuestos Internos, Servicio Agricola y Ganadero y demas organismos publicos o privados que correspondan.

20. **LECTURA Y FIRMA.** Previa lectura de la presente escritura por los comparecientes, y declarando estos haberla comprendido, aceptado y ratificado en todas sus partes, firman conjuntamente con el notario que autoriza.

---

## Checklist minimo antes de renderizar

- `[lote.deslindes]`, `[lote.superficie_m2]` y `[servidumbre.deslindes_tramo]` deben estar `geometry_verified`.
- Dominio, gravamenes/prohibiciones, SAG, plano CBR y roles SII deben estar `legal_verified`.
- Comparecientes, RUT, domicilio, estado civil, poderes y personeria deben estar `legal_verified` o `manual_review`.
- Precio, forma de pago y liquidacion deben estar `commercial_verified`.
- Exencion o limitacion de eviccion requiere aprobacion legal expresa.
- Declaracion de IVA/DL 825 requiere activacion expresa (condicion o interruptor manual); apagada por defecto.
- RNDA y constancias notariales deben ser vigentes para el otorgamiento.
