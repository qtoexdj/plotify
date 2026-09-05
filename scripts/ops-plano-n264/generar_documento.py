#!/usr/bin/env python3
"""Genera el documento .md con las cláusulas PRIMERA y SEXTA para los 87 lotes
del proyecto N264, con datos del plano (cuadro de superficies + deslindes) y el
formato de la escritura modelo (COMPRAVENTA Inmobiliaria Terranova SpA).

- Lotes 1-5 y 11-25 (ya inscritos): texto textual de la escritura.
- Resto: generado desde los datos del plano cargados en la base.
"""
import json, os, sys, urllib.request

sys.path.insert(0, '/Users/matiasignacio/Developer/plotify/apps/api')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from services.legal_title_words import quantity_to_words, number_to_words_spanish
from plano_lotes import DATA

PROJECT_ID = '11c3def3-5503-45bc-9a37-fe83f732460f'
ENV = '/Users/matiasignacio/Developer/plotify/apps/web/.env'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clausulas-1-y-6-n264.md')

# Lotes con texto inscrito en la escritura de la primera etapa
INSCRITOS = {1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25}


def env(key):
    for line in open(ENV):
        if line.startswith(key + '='):
            return line.split('=', 1)[1].strip()
    raise SystemExit(f'falta {key}')


URL, KEY = env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')


def get(path):
    r = urllib.request.Request(URL + '/rest/v1/' + path,
                               headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'})
    with urllib.request.urlopen(r) as x:
        return json.loads(x.read())


OPUESTO = {'NORTE': 'SUR', 'SUR': 'NORTE', 'ORIENTE': 'PONIENTE', 'PONIENTE': 'ORIENTE',
           'NORORIENTE': 'SURPONIENTE', 'SURPONIENTE': 'NORORIENTE',
           'NORPONIENTE': 'SURORIENTE', 'SURORIENTE': 'NORPONIENTE'}


def palabras_upper(n):
    return quantity_to_words(float(n)).upper()


def palabras_lower(n):
    return quantity_to_words(float(n))


def lote_palabras(n):
    return number_to_words_spanish(int(n))


def colinda_formal(texto):
    """'Lote 21' -> 'lote veintiuno de la misma subdivisión'; exteriores según escritura."""
    t = texto.strip()
    if t.startswith('Lote 263'):
        return 'lote N doscientos sesenta y tres'
    if t.startswith('Julia Gredoy'):
        return 'Juan Godoy'
    if t.startswith('Resto Fundo'):
        return 'resto del fundo Los Maquis'
    if 'subdivisión colindante' in t:
        base = t.replace(', subdivisión colindante', '').strip()
        partes = [p.strip() for p in base.split(' y ')]
        lottes = []
        for p in partes:
            num = p.replace('Lote', '').strip()
            lottes.append(f'lote N {number_to_words_spanish(int(num))}')
        return ' con '.join(lottes) + ', todos de anterior subdivisión'
    import re
    def rep(m):
        return 'lote ' + number_to_words_spanish(int(m.group(1)))
    out = re.sub(r'Lote\s+(\d+)', rep, t)
    if out.lower().startswith('lote'):
        out = out + ' de la misma subdivisión'
    return out


def deslindes_clausula1(boundaries):
    """Grupos por rumbo consecutivo (con wrap-around), formato escritura."""
    items = []
    for b in boundaries:
        label = (b.get('label') or '').upper().strip()
        d = b.get('distance')
        items.append({'label': label, 'd': d, 'colinda': b.get('colinda') or '',
                      'serv': bool(b.get('es_servidumbre'))})
    if not items:
        return '[deslindes pendientes de carga en la base de datos; ver plano de subdivisión]'
    grupos = []
    for it in items:
        if grupos and grupos[-1][0]['label'] == it['label']:
            grupos[-1].append(it)
        else:
            grupos.append([it])
    if len(grupos) > 1 and grupos[0][0]['label'] == grupos[-1][0]['label']:
        last = grupos.pop()
        grupos[0] = last + grupos[0]
    partes = []
    for g in grupos:
        dists = ' y en '.join(f'{palabras_lower(it["d"])} metros' for it in g if it['d'])
        colindas = {}
        orden = []
        for it in g:
            c = colinda_formal(it['colinda']) if it['colinda'] else '_____________'
            if c not in colindas:
                colindas[c] = []
                orden.append(c)
            colindas[c].append(it)
        cols_txt = ' y '.join(orden)
        servs = [it for it in g if it['serv']]
        suf = ''
        if servs:
            suf = ', parte servidumbre' if len(servs) < len(g) else ', servidumbre de por medio'
        partes.append(f'{g[0]["label"]}, en {dists} con {cols_txt}{suf}')
    return '; '.join(partes[:-1]) + f'; y {partes[-1]}' if len(partes) > 1 else partes[0]


def clausula1(num, util, serv, total, boundaries, largo, ancho):
    cuerpo = (f'LOTE {lote_palabras(num).upper()}, de una superficie aproximada de '
              f'{palabras_upper(total)} METROS CUADRADOS, de los cuales '
              f'{palabras_upper(serv)} METROS CUADRADOS quedan afectas a servidumbre de tránsito, '
              f'y deslinda: {deslindes_clausula1(boundaries)}.')
    rol = f'Rol de avalúo en trámite número {number_to_words_spanish(8260)} guion {number_to_words_spanish(num)}, de la comuna de Curicó.'
    return f'{cuerpo} {rol}'


def clausula6(num, util, serv, total, boundaries, largo, ancho):
    base = (f'LOTE {lote_palabras(num).upper()}. Tiene una servidumbre de {palabras_lower(serv)} '
            f'metros cuadrados, con un ancho de tres metros y un largo de {palabras_lower(largo)} metros, '
            f'la que corre conforme al plano de subdivisión agregado bajo el número ciento tres al final '
            f'del Registro de Propiedad del Conservador de Bienes Raíces de Curicó, del año dos mil veintiuno.')
    return base


def main():
    print('Descargando lotes...')
    rows = get(f'lots?project_id=eq.{PROJECT_ID}&select=numero_lote,boundaries_official&order=numero_lote.asc')
    bounds = {int(r['numero_lote']): (r.get('boundaries_official') or []) for r in rows}

    lineas = []
    lineas.append('# PROYECTO N264 — LOS MAQUIS')
    lineas.append('')
    lineas.append('## Cláusulas PRIMERA y SEXTA — 87 lotes')
    lineas.append('')
    lineas.append('Fuente de los datos: plano de subdivisión del Lote N 264, resultante de la '
                  'subdivisión del Fundo Los Maquis o Resto del Fundo Los Maquis, comuna y provincia '
                  'de Curicó (plano agregado bajo el N° 103 al final del Registro de Propiedad del '
                  'año 2021, CBR Curicó; inscripción de dominio fojas 1723 N° 671, año 2019; rol '
                  'predio 544-595; SAG Región del Maule certificado N° 1945).')
    lineas.append('')
    lineas.append('Formato según escritura de compraventa de la primera etapa (20 lotes).')
    lineas.append('')
    lineas.append('> **Notas para la redacción**')
    lineas.append('>')
    lineas.append('> - Lotes 1–5 y 11–25: texto inscrito de la escritura de la primera etapa '
                  '(transcripción literal).')
    lineas.append('> - Lotes restantes: generados desde el plano; validar deslindes con el '
                  'topógrafo antes de otorgar escritura.')
    lineas.append('> - Roles de avalúo en trámite: patrón 8260-N según primera escritura; '
                  'confirmar con SII.')
    lineas.append('> - Colindante poniente: la escritura inscrita lo denomina "Juan Godoy"; el '
                  'plano imprime "Julia Gredoy". Se usa "Juan Godoy" conforme a lo inscrito.')
    lineas.append('> - Lote 21: sin deslindes en la base (no marcado en la asignación de '
                  'geometrías); completar desde plano.')
    lineas.append('')
    lineas.append('---')
    lineas.append('')
    lineas.append('## CLÁUSULA PRIMERA: INDIVIDUALIZACIÓN DEL INMUEBLE')
    lineas.append('')
    for n in range(1, 88):
        util, serv, total, largo, ancho = DATA[n]
        lineas.append(f'{number_to_words_spanish(n).capitalize()}) {clausula1(n, util, serv, total, bounds.get(n), largo, ancho)}')
        lineas.append('')
    lineas.append('---')
    lineas.append('')
    lineas.append('## CLÁUSULA SEXTA: SERVIDUMBRE DE TRÁNSITO')
    lineas.append('')
    for n in range(1, 88):
        util, serv, total, largo, ancho = DATA[n]
        lineas.append(f'{number_to_words_spanish(n).capitalize()}) {clausula6(n, util, serv, total, bounds.get(n), largo, ancho)}')
        lineas.append('')

    with open(OUT, 'w') as f:
        f.write('\n'.join(lineas))
    print(f'OK -> {OUT}')


if __name__ == '__main__':
    main()
