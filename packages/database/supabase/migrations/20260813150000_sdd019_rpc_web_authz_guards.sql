-- ============================================================================
-- SDD019: Authz guards en RPCs expuestas a authenticated
-- Fecha: 2026-08-13
-- Contexto: register_telegram_bot y seed_escritura_blocks son SECURITY DEFINER
-- invocables por usuarios autenticados (la UI valida el rol admin antes de
-- llamarlas), pero no validaban autorización internamente: un cliente podía
-- invocar el RPC directo con un p_org_id arbitrario (cross-tenant write).
-- Ahora el RPC exige admin de la org (o service_role para flujos backend).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- register_telegram_bot: upsert del bot de una organización
-- Callers: web (authenticated, admin de la org) y API bots.py (service_role)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_telegram_bot(p_org_id uuid, p_token text, p_username text, p_webhook_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth', 'storage', 'vault'
AS $$
DECLARE
    v_key TEXT;
BEGIN
    IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.is_org_admin(p_org_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: solo un admin de la organización puede registrar el bot'
            USING ERRCODE = '42501';
    END IF;

    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'plotify_encryption_key';

    IF v_key IS NULL THEN
        RAISE EXCEPTION 'plotify_encryption_key not found in vault';
    END IF;

    INSERT INTO public.telegram_bots (organization_id, bot_token_encrypted, bot_username, webhook_url)
    VALUES (
        p_org_id,
        extensions.pgp_sym_encrypt(p_token, v_key),
        p_username,
        p_webhook_url
    )
    ON CONFLICT (organization_id) DO UPDATE SET
        bot_token_encrypted = EXCLUDED.bot_token_encrypted,
        bot_username        = EXCLUDED.bot_username,
        webhook_url         = EXCLUDED.webhook_url,
        updated_at          = now();
END;
$$;

-- ----------------------------------------------------------------------------
-- seed_escritura_blocks: siembra de bloques de escritura
-- Callers: web (authenticated, admin de la org). El API no la usa.
-- Guard: admin de la org (o service_role) + atribución consistente del creador.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_escritura_blocks(p_org_id uuid, p_user_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'auth', 'storage', 'vault'
    AS $_$
DECLARE
    v_count INT := 0;
BEGIN
    IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.is_org_admin(p_org_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: solo un admin de la organización puede sembrar bloques'
            USING ERRCODE = '42501';
    END IF;

    IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
        RAISE EXCEPTION 'FORBIDDEN: p_user_id debe coincidir con el usuario autenticado'
            USING ERRCODE = '42501';
    END IF;

    -- ── BLOQUE: Comparecencia
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'Comparecencia',
        'articulo',
        '<p>En {{ firma_lugar | default("__________") }}, a {{ firma_fecha | default("__________") }}, comparecen:</p>
<p><strong>Por una parte</strong>, {{ vendedor.nombre | default("__________") }},
{%- if vendedor.tipo == "juridica" %} representada por {{ vendedor.representantes[0].nombre | default("__________") }},{%- endif %}
RUT {{ vendedor.rut | default("__________") }}, en adelante <em>"el Vendedor"</em>;</p>
<p><strong>y por la otra</strong>, {{ comprador.nombre | default("__________") }},
RUT {{ comprador.rut | default("__________") }},
{{ comprador.estado_civil | default("soltero/a") }},
{{ comprador.profesion_giro | default("__________") }},
domiciliado/a en {{ comprador.domicilio | default("__________") }},
en adelante <em>"el Comprador"</em>.</p>',
        ARRAY['vendedor.nombre','vendedor.rut','vendedor.tipo','comprador.nombre','comprador.rut',
              'comprador.estado_civil','comprador.profesion_giro','comprador.domicilio',
              'firma_lugar','firma_fecha'],
        ARRAY['comparecencia','partes','escritura'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- ── ART-01: Antecedentes
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'PRIMERO — Antecedentes',
        'articulo',
        '<h2>PRIMERO</h2>
<p>El Vendedor es dueño del predio denominado <strong>{{ matriz.nombre_predio | default("__________") }}</strong>,
ubicado en {{ matriz.ubicacion | default("__________") }},
de una superficie aproximada de {{ matriz.superficie_total | default("__________") }},
que deslinda: al Norte, {{ matriz.deslindes.norte | default("__________") }};
al Sur, {{ matriz.deslindes.sur | default("__________") }};
al Oriente, {{ matriz.deslindes.oriente | default("__________") }};
al Poniente, {{ matriz.deslindes.poniente | default("__________") }}.</p>
<p>El predio fue adquirido {{ matriz.adquisicion_modo | default("__________") }},
según escritura pública otorgada ante {{ matriz.adquisicion_notaria | default("__________") }},
de fecha {{ matriz.adquisicion_fecha | default("__________") }},
Repertorio N° {{ matriz.adquisicion_repertorio | default("__________") }},
inscrita a fojas {{ matriz.inscripcion_fojas | default("__________") }} N° {{ matriz.inscripcion_numero | default("__________") }}
del año {{ matriz.inscripcion_anio | default("__________") }}
del Registro de Propiedad del {{ matriz.inscripcion_cbr | default("Conservador de Bienes Raíces respectivo") }}.
Rol de Avalúo N° {{ matriz.rol_avaluo | default("__________") }}.</p>',
        ARRAY['matriz.nombre_predio','matriz.ubicacion','matriz.superficie_total',
              'matriz.deslindes.norte','matriz.deslindes.sur','matriz.deslindes.oriente','matriz.deslindes.poniente',
              'matriz.adquisicion_modo','matriz.adquisicion_notaria','matriz.adquisicion_fecha',
              'matriz.adquisicion_repertorio','matriz.inscripcion_fojas','matriz.inscripcion_numero',
              'matriz.inscripcion_anio','matriz.inscripcion_cbr','matriz.rol_avaluo'],
        ARRAY['antecedentes','matriz','escritura','art-01'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-02: Subdivisión y Lote
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'SEGUNDO — Subdivisión y Lote',
        'articulo',
        '<h2>SEGUNDO</h2>
<p>El predio matriz fue subdividido según Certificado de Subdivisión N° {{ sag.certificado_numero | default("__________") }},
de fecha {{ sag.certificado_fecha | default("__________") }},
plano inscrito en el Conservador de Bienes Raíces bajo el N° {{ sag.plano_cbr_numero | default("__________") }}
del año {{ sag.plano_cbr_anio | default("__________") }}.</p>
<p>El lote objeto de la presente compraventa corresponde al <strong>{{ lote.numero_nombre | default("__________") }}</strong>,
de una superficie de {{ lote.superficie_total | default("__________") }},
y deslinda: {{ lote.deslindes | default("__________") }}</p>
<p>Rol en trámite: {{ lote.rol_tramite | default("en trámite") }}.</p>',
        ARRAY['sag.certificado_numero','sag.certificado_fecha','sag.plano_cbr_numero','sag.plano_cbr_anio',
              'lote.numero_nombre','lote.superficie_total','lote.deslindes','lote.rol_tramite'],
        ARRAY['subdivision','sag','lote','deslindes','escritura','art-02'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-03: Objeto de Venta
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'TERCERO — Objeto de Venta',
        'articulo',
        '<h2>TERCERO</h2>
<p>El Vendedor por el presente instrumento <strong>vende, cede y transfiere</strong> al Comprador,
quien compra y acepta para sí, el {{ lote.numero_nombre | default("______") }}
individualizado en el artículo anterior, con todo lo que de hecho y por derecho le corresponde.</p>',
        ARRAY['lote.numero_nombre'],
        ARRAY['objeto','venta','escritura','art-03'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-04: Precio y Pago
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'CUARTO — Precio y Pago',
        'articulo',
        '<h2>CUARTO</h2>
<p>El precio de la presente compraventa es la suma de
<strong>${{ transaccion.precio_numeros | default("__________") }}</strong>
({{ transaccion.precio_letras | default("__________") }} pesos),
que el Comprador paga {{ transaccion.forma_pago | default("al contado y en dinero en efectivo") }},
declarando el Vendedor recibirlo a su entera satisfacción,
renunciando expresamente a toda acción resolutoria derivada del no pago del precio.</p>',
        ARRAY['transaccion.precio_numeros','transaccion.precio_letras','transaccion.forma_pago'],
        ARRAY['precio','pago','escritura','art-04'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-05: Venta Ad-Corpus
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'QUINTO — Venta Ad-Corpus',
        'articulo',
        '<h2>QUINTO</h2>
<p>La presente compraventa se hace <em>ad corpus</em>, aceptando el Comprador
la propiedad en el estado en que se encuentra, con todos sus usos, costumbres,
servidumbres activas y pasivas, entradas y salidas y demás anexidades y dependencias.</p>',
        ARRAY[]::TEXT[],
        ARRAY['ad-corpus','estado','escritura','art-05'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-06: Servidumbre (condicional)
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'SEXTO — Servidumbre de Tránsito',
        'articulo',
        '<h2>SEXTO</h2>
<p>Se constituye una <strong>servidumbre de tránsito</strong> de carácter perpetuo y gratuito
sobre una franja de {{ servidumbre.superficie | default("__________") }},
que afecta al {{ lote.numero_nombre | default("______") }} en calidad de predio sirviente,
en beneficio de los demás lotes del proyecto en calidad de predios dominantes.</p>
<p>La franja de servidumbre deslinda: {{ servidumbre.deslindes_tramo | default("__________") }}</p>',
        ARRAY['servidumbre.superficie','servidumbre.deslindes_tramo','lote.numero_nombre'],
        ARRAY['servidumbre','transito','escritura','art-06','condicional'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── ART-07 a ART-16 (contenido fijo)
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES
    (p_org_id, 'SÉPTIMO — Entrega Material', 'articulo',
     '<h2>SÉPTIMO</h2><p>El Vendedor hace entrega material y legal de la propiedad al Comprador en este mismo acto, libre de todo ocupante.</p>',
     ARRAY[]::TEXT[], ARRAY['entrega','escritura','art-07'], 1, true, p_user_id),

    (p_org_id, 'OCTAVO — Gastos', 'articulo',
     '<h2>OCTAVO</h2><p>Serán de cargo del Comprador todos los gastos, honorarios notariales, impuestos y derechos que se deriven de la presente escritura y su inscripción en el Conservador de Bienes Raíces.</p>',
     ARRAY[]::TEXT[], ARRAY['gastos','honorarios','escritura','art-08'], 1, true, p_user_id),

    (p_org_id, 'NOVENO — Domicilio Judicial', 'articulo',
     '<h2>NOVENO</h2><p>Para todos los efectos legales derivados del presente contrato, las partes fijan su domicilio en la ciudad de {{ comprador.domicilio | default("__________") }} y se someten a la competencia de sus Tribunales de Justicia.</p>',
     ARRAY['comprador.domicilio'], ARRAY['domicilio','tribunales','escritura','art-09'], 1, true, p_user_id),

    (p_org_id, 'DÉCIMO — Finiquito', 'articulo',
     '<h2>DÉCIMO</h2><p>La presente escritura deja sin efecto cualquier promesa, compromiso o contrato anterior celebrado entre las partes sobre el inmueble que se enajena, declarándose ambas partes recíprocamente al día en sus obligaciones.</p>',
     ARRAY[]::TEXT[], ARRAY['finiquito','promesa','escritura','art-10'], 1, true, p_user_id),

    (p_org_id, 'UNDÉCIMO — Exoneraciones Especiales', 'articulo',
     '<h2>UNDÉCIMO</h2>
<p>a) <strong>Agua potable y alcantarillado:</strong> El Vendedor no garantiza la disponibilidad de agua potable ni alcantarillado en la propiedad, siendo de exclusiva responsabilidad del Comprador la obtención de dichos servicios.</p>
<p>b) <strong>Energía eléctrica:</strong> El Vendedor no garantiza la provisión de energía eléctrica en la propiedad. El Comprador deberá gestionar la conexión directamente con la empresa distribuidora correspondiente.</p>
<p>c) <strong>CONAF — Tala de árboles:</strong> Toda intervención sobre la vegetación nativa existente en el predio deberá contar con la autorización previa de la Corporación Nacional Forestal (CONAF), siendo el Comprador el único responsable de obtener los permisos correspondientes.</p>',
     ARRAY[]::TEXT[], ARRAY['exoneraciones','agua','luz','conaf','escritura','art-11','opcional'], 1, true, p_user_id),

    (p_org_id, 'DUODÉCIMO — IVA y Exención', 'articulo',
     '<h2>DUODÉCIMO</h2><p>La presente compraventa no queda afecta al Impuesto al Valor Agregado, por tratarse de un predio de carácter rural, de conformidad con lo dispuesto en la Ley N° 825 y sus modificaciones posteriores.</p>',
     ARRAY[]::TEXT[], ARRAY['iva','exencion','rural','escritura','art-12'], 1, true, p_user_id),

    (p_org_id, 'DECIMOTERCERO — Mandato de Rectificación', 'articulo',
     '<h2>DECIMOTERCERO</h2><p>Las partes confieren mandato especial irrevocable a don/doña {{ mandato.nombre_representante | default("__________") }}, RUT {{ mandato.rut_representante | default("__________") }}, para que en nombre y representación de cualquiera de ellas, pueda concurrir ante el Conservador de Bienes Raíces a rectificar, aclarar o complementar la presente escritura en todo cuanto sea necesario para su correcta inscripción.</p>',
     ARRAY['mandato.nombre_representante','mandato.rut_representante'],
     ARRAY['mandato','rectificacion','cbr','escritura','art-13'], 1, true, p_user_id),

    (p_org_id, 'DECIMOCUARTO — Deudores de Alimentos', 'articulo',
     '<h2>DECIMOCUARTO</h2><p>De conformidad a lo establecido en la Ley N° 21.389, las partes declaran, bajo juramento, no tener deudas impagas por concepto de pensiones alimenticias.</p>',
     ARRAY[]::TEXT[], ARRAY['alimentos','ley-21389','escritura','art-14'], 1, true, p_user_id),

    (p_org_id, 'DECIMOQUINTO — Uso de Suelo', 'articulo',
     '<h2>DECIMOQUINTO</h2><p>Las partes declaran que la propiedad objeto de esta compraventa mantiene su destino agrícola, quedando expresamente prohibido modificar su uso de suelo sin contar con las autorizaciones que correspondan según la Ley General de Urbanismo y Construcciones (LGUC) y demás normativas vigentes.</p>',
     ARRAY[]::TEXT[], ARRAY['uso-suelo','agricola','lguc','escritura','art-15'], 1, true, p_user_id),

    (p_org_id, 'DECIMOSEXTO — Facultad de Copia', 'articulo',
     '<h2>DECIMOSEXTO</h2><p>El portador de una copia autorizada de la presente escritura queda facultado para solicitar y gestionar todas las inscripciones, subinscripciones y demás trámites necesarios ante el Conservador de Bienes Raíces y cualquier otro organismo pertinente.</p>',
     ARRAY[]::TEXT[], ARRAY['copia','cbr','tramites','escritura','art-16'], 1, true, p_user_id)

    ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── Personería (condicional)
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'Personería y Poderes',
        'articulo',
        '<p><strong>Personería:</strong> La personería de {{ vendedor.nombre | default("__________") }}
consta de {{ personeria.tipo_documento | default("escritura pública") }}
otorgada ante {{ personeria.notaria | default("Notario Público respectivo") }},
de fecha {{ personeria.fecha | default("__________") }},
inscrita a fojas {{ personeria.inscripcion_fojas | default("__________") }}
N° {{ personeria.inscripcion_numero | default("__________") }}
del año {{ personeria.inscripcion_anio | default("__________") }}
del Registro de Comercio del {{ personeria.inscripcion_cbr | default("Conservador respectivo") }}.</p>',
        ARRAY['vendedor.nombre','personeria.tipo_documento','personeria.notaria','personeria.fecha',
              'personeria.inscripcion_fojas','personeria.inscripcion_numero',
              'personeria.inscripcion_anio','personeria.inscripcion_cbr'],
        ARRAY['personeria','poderes','sociedad','escritura','condicional'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    -- ── Cierre y Firmas
    INSERT INTO document_blocks (organization_id, name, category, content, variables, tags, version, is_active, created_by)
    VALUES (
        p_org_id,
        'Cierre y Firmas',
        'articulo',
        '<p>En comprobante, previa lectura, firman:</p>
<div class="firma-vendedor">
<p>___________________________<br>
{{ vendedor.nombre | default("VENDEDOR") }}<br>
RUT: {{ vendedor.rut | default("__________") }}</p>
</div>
<div class="firma-comprador">
<p>___________________________<br>
{{ comprador.nombre | default("COMPRADOR") }}<br>
RUT: {{ comprador.rut | default("__________") }}</p>
</div>',
        ARRAY['vendedor.nombre','vendedor.rut','comprador.nombre','comprador.rut'],
        ARRAY['cierre','firmas','escritura'],
        1, true, p_user_id
    ) ON CONFLICT (organization_id, name) DO NOTHING;

    RETURN v_count;
END;
$_$;
