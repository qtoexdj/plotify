# Escrituras Lab: Template Inicial de Compraventa

Contexto de redaccion: actuar como abogado senior especialista en Derecho Civil chileno y practica notarial. El borrador se rige por el Codigo Civil de Chile, la Ley sobre Efecto Retroactivo de las Leyes, el Reglamento del Registro Conservatorio de Bienes Raices y la normativa aplicable a predios rusticos, subdivisiones SAG, roles SII y Conservadores de Bienes Raices.

Este template es un borrador base para el motor documental. Todo dato variable queda entre corchetes `[ ]`. Las clausulas marcadas como revision legal no deben renderizarse automaticamente sin aprobacion humana.

---

## ESCRITURA PUBLICA DE COMPRAVENTA

**[vendedor.nombre]**

a

**[comprador.nombre]**

**Lote [lote.numero] - [proyecto.nombre]**

---

1. **COMPARECENCIA.** En [documento.ciudad_otorgamiento], Republica de Chile, a [documento.fecha_otorgamiento], ante mi, [documento.notario.nombre], Notario Publico Titular/Suplente/Interino de [documento.notaria.jurisdiccion], con oficio en [documento.notaria.direccion], comparecen: por una parte, como vendedor, [vendedor.nombre], [vendedor.tipo], Rol Unico Tributario numero [vendedor.rut], del giro [vendedor.profesion_giro], domiciliado para estos efectos en [vendedor.domicilio], representado por [vendedor.representantes_texto], segun se acredita en la clausula de personeria; y por la otra, como comprador, [comprador.nombre], [comprador.nacionalidad], [comprador.estado_civil], [comprador.profesion_giro], cedula nacional de identidad numero [comprador.rut], domiciliado en [comprador.domicilio]. Los comparecientes mayores de edad, quienes acreditan su identidad con las cedulas ya indicadas, exponen:

2. **ANTECEDENTES DE DOMINIO DEL PREDIO MATRIZ.** [vendedor.nombre] es dueno del inmueble denominado [matriz.nombre_predio], ubicado en [matriz.ubicacion], comuna de [matriz.comuna], provincia de [matriz.provincia], Region de [matriz.region], de una superficie aproximada de [matriz.superficie_total], y que deslinda: al Norte, [matriz.deslindes.norte]; al Sur, [matriz.deslindes.sur]; al Oriente, [matriz.deslindes.oriente]; y al Poniente, [matriz.deslindes.poniente]. Lo adquirio por [matriz.adquisicion_modo], segun escritura publica de fecha [matriz.adquisicion_fecha], otorgada en la Notaria de [matriz.adquisicion_notaria], Repertorio numero [matriz.adquisicion_repertorio], encontrandose inscrito su dominio a fojas [matriz.inscripcion_fojas], numero [matriz.inscripcion_numero], del Registro de Propiedad del Conservador de Bienes Raices de [matriz.inscripcion_cbr], correspondiente al ano [matriz.inscripcion_anio]. El rol de avaluo matriz es [matriz.rol_avaluo].

3. **SUBDIVISION, CERTIFICADO SAG Y PLANO.** El predio matriz fue subdividido conforme a la normativa aplicable a predios rusticos, segun Certificado de Subdivision emitido por el Servicio Agricola y Ganadero, numero [sag.certificado_numero], de fecha [sag.certificado_fecha], expedido por [sag.oficina_sectorial], relativo al proyecto [proyecto.nombre]. El plano respectivo fue archivado/agregado bajo el numero [sag.plano_cbr_numero], ano [sag.plano_cbr_anio], en [sag.plano_cbr_registro] del Conservador de Bienes Raices de [matriz.inscripcion_cbr]. Las partes dejan constancia que la subdivision no importa cambio de destino agricola, ganadero o forestal del predio, sin perjuicio de las autorizaciones sectoriales que fueren legalmente procedentes.

4. **INDIVIDUALIZACION DEL LOTE.** Dentro de la subdivision indicada se encuentra el Lote [lote.numero], de una superficie de [lote.superficie_texto] ([lote.superficie_m2] metros cuadrados), equivalente a [lote.superficie_ha_texto], rol de avaluo [sii.rol_asignado_lote], o rol en tramite [lote.rol_tramite], que deslinda: [lote.deslindes]. De la superficie indicada, [servidumbre.superficie_texto] ([servidumbre.superficie_m2] metros cuadrados) se encuentran afectos, si corresponde, a servidumbre de transito conforme se expresa en esta escritura y en el plano archivado.

5. **COMPRAVENTA.** Por el presente instrumento, [vendedor.nombre], debidamente representado, vende, cede y transfiere a [comprador.nombre], quien compra, acepta y adquiere para si, el Lote [lote.numero] individualizado en la clausula precedente, con todos sus usos, costumbres, derechos, servidumbres activas y pasivas, entradas, salidas y mejoras, libre de ocupantes, salvo [clausulas.ocupantes_excepciones], en el estado material y juridico en que actualmente se encuentra y que el comprador declara conocer y aceptar.

6. **PRECIO Y LIQUIDACION.** El precio de la compraventa es la suma unica y total de [transaccion.precio_letras] ([transaccion.moneda] [transaccion.precio_numeros]), que el comprador paga al vendedor en la siguiente forma: [transaccion.forma_pago]. Para efectos de liquidacion, las partes dejan constancia de lo siguiente: [transaccion.detalle_pago]. El vendedor declara recibir a su entera satisfaccion las sumas indicadas, otorgando por este acto el mas amplio, completo y eficaz recibo, carta de pago y finiquito respecto del precio, salvo las obligaciones pendientes expresamente indicadas en [transaccion.saldo_pendiente].

7. **CUERPO CIERTO Y CABIDA.** La venta se hace como especie o cuerpo cierto, en el estado en que el comprador declara haber examinado el inmueble, con sus deslindes, cabida, usos, costumbres, derechos y servidumbres, sin perjuicio de las acciones que la ley concede en caso de eviccion, vicios redhibitorios, dolo, error o infraccion de normas imperativas, segun corresponda. La cabida expresada se funda en los antecedentes tecnicos y legales indicados en esta escritura y en el plano de subdivision.

8. **SANEAMIENTO, EVICCION Y VICIOS REDHIBITORIOS.** El vendedor respondera del saneamiento de la eviccion y de los vicios redhibitorios conforme a las reglas del Codigo Civil, salvo pacto expreso, juridicamente procedente y aprobado en revision legal. [clausulas.saneamiento_eviccion].

9. **EXENCION O LIMITACION EXPRESA DE EVICCION - REVISION LEGAL.** Si las partes instruyen una exencion o limitacion de responsabilidad por eviccion o vicios redhibitorios, esta solo se incorporara cuando [clausulas.exencion_eviccion_aprobada] sea verdadero, conste instruccion expresa de las partes y no afecte normas de orden publico, derechos de terceros ni prohibiciones legales. En tal caso, la redaccion aprobada sera: [clausulas.exencion_eviccion_texto]. En defecto de aprobacion expresa, esta clausula no se renderiza y rige la clausula anterior.

10. **GRAVAMENES, PROHIBICIONES Y LITIGIOS.** El vendedor declara que el inmueble se transfiere libre de hipotecas, gravamenes, prohibiciones, embargos, litigios, usufructos, arrendamientos, ocupantes, promesas, opciones, derechos preferentes y toda otra limitacion al dominio, salvo [evidencia.gravamenes_excepciones], segun antecedentes que deberan constar en los certificados conservatorios vigentes agregados o tenidos a la vista para esta operacion. [evidencia.certificado_gp_referencia].

11. **SERVIDUMBRE DE TRANSITO.** En cuanto proceda, el Lote [lote.numero], como predio sirviente, queda afecto a una servidumbre de transito amplia, irrestricta, gratuita, perpetua y reciproca en favor de [servidumbre.predios_dominantes], como predios dominantes, para el uso de caminos, accesos, transito peatonal y vehicular, paso de servicios basicos y demas finalidades inherentes al aprovechamiento regular del proyecto, todo segun el trazado, superficie y deslindes que constan en el plano de subdivision y que se describen como sigue: [servidumbre.deslindes_tramo]. El comprador acepta expresamente la servidumbre, su ubicacion, extension, destino y cargas.

12. **DESTINO DEL PREDIO Y NORMATIVA URBANISTICA.** Las partes declaran conocer que el inmueble proviene de una subdivision de predio rustico y que su destino no puede alterarse sino en los casos y con las autorizaciones que contemplen las normas aplicables, especialmente la normativa de subdivision de predios rusticos y las reglas de la Ley General de Urbanismo y Construcciones. El comprador declara conocer que cualquier edificacion, urbanizacion, cambio de destino, acceso, factibilidad de agua, electricidad, alcantarillado u otros servicios requiere cumplir previamente las autorizaciones, permisos y factibilidades que correspondan. [clausulas.lguc_destino_suelo].

13. **ENTREGA MATERIAL.** La entrega material del inmueble vendido se efectua en este acto/a contar de [clausulas.entrega_fecha], declarando el comprador recibirlo a su entera satisfaccion, con los cierres, accesos, mejoras, servidumbres y condiciones de hecho que declara conocer. [clausulas.entrega_material].

14. **GASTOS, DERECHOS E IMPUESTOS.** Los gastos, derechos notariales, copias, impuestos si procedieren, inscripciones conservatorias, certificados y demas desembolsos necesarios para el otorgamiento, autorizacion, inscripcion y perfeccionamiento de esta escritura seran de cargo de [clausulas.gastos_cargo], salvo pacto distinto indicado en [clausulas.gastos_excepciones].

15. **REGISTRO NACIONAL DE DEUDORES DE PENSIONES DE ALIMENTOS.** En cumplimiento de la normativa aplicable, el notario debera verificar, cuando corresponda, la situacion de los otorgantes respecto del Registro Nacional de Deudores de Pensiones de Alimentos. La constancia, certificado o resultado de dicha consulta sera [clausulas.rnda_declaracion].

16. **MANDATO PARA RECTIFICAR, ACLARAR Y COMPLEMENTAR.** Las partes confieren mandato especial a [mandato.rectificacion_nombre], cedula nacional de identidad numero [mandato.rectificacion_rut], para que, actuando en nombre y representacion de ellas, pueda suscribir escrituras aclaratorias, complementarias o rectificatorias destinadas exclusivamente a subsanar errores, omisiones o exigencias del Conservador de Bienes Raices, Servicio de Impuestos Internos, Servicio Agricola y Ganadero u otra autoridad competente, siempre que tales actos no alteren el precio, la cosa vendida, la voluntad esencial de las partes ni importen nuevas obligaciones sustanciales. [mandato.facultades].

17. **DOMICILIO Y COMPETENCIA.** Para todos los efectos derivados de esta escritura, las partes fijan su domicilio especial en la ciudad y comuna de [clausulas.domicilio_contractual], y se someten a la competencia de sus Tribunales Ordinarios de Justicia, sin perjuicio de las normas imperativas de competencia que fueren aplicables.

18. **PERSONERIA.** La personeria de [vendedor.representantes_texto] para representar a [vendedor.nombre] consta de [personeria.constitucion_texto] y de [personeria.poder_texto], documentos que no se insertan por ser conocidos de las partes y del notario que autoriza, y por haberlos tenido a la vista. La vigencia y suficiencia de dichas facultades debera encontrarse aprobada en [personeria.estado_revision]. [personeria.delegacion_facultades].

19. **PORTADOR DE COPIA E INSCRIPCION.** Se faculta al portador de copia autorizada de la presente escritura para requerir y firmar las inscripciones, subinscripciones, anotaciones, rectificaciones y demas actuaciones que fueren necesarias ante el Conservador de Bienes Raices competente, Servicio de Impuestos Internos, Servicio Agricola y Ganadero y demas organismos publicos o privados que correspondan.

20. **LECTURA Y FIRMA.** Previa lectura de la presente escritura por los comparecientes, y declarando estos haberla comprendido, aceptado y ratificado en todas sus partes, firman conjuntamente con el notario que autoriza. Se deja constancia que los datos variables, antecedentes legales, certificados y clausulas especiales deben encontrarse respaldados en los documentos fuente indicados en el expediente de generacion documental de Plotify.

---

## Checklist minimo antes de renderizar

- `[lote.deslindes]`, `[lote.superficie_m2]` y `[servidumbre.deslindes_tramo]` deben estar `geometry_verified`.
- Dominio, gravamenes/prohibiciones, SAG, plano CBR y roles SII deben estar `legal_verified`.
- Comparecientes, RUT, domicilio, estado civil, poderes y personeria deben estar `legal_verified` o `manual_review`.
- Precio, forma de pago y liquidacion deben estar `commercial_verified`.
- Exencion o limitacion de eviccion requiere aprobacion legal expresa.
- RNDA y constancias notariales deben ser vigentes para el otorgamiento.
