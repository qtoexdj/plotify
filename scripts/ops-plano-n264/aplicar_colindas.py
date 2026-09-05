#!/usr/bin/env python3
"""Aplica los colindantes de las 63 aristas vacias en boundaries_official del
proyecto N264, resueltos MANUALMENTE contra el plano-n264.pdf (zonas 1-20,
15-22, 31-37, 55-87 verificadas en crops de alta resolucion).

Clave: (numero_lote, label, distance) -> (colinda, es_servidumbre)
  - colindas entre lotes: "Lote N" (mismo loteo; el generador agrega
    "de la misma subdivisión").
  - corredor interno de servidumbre: es_servidumbre=True (sufijo
    "servidumbre de por medio").
  - exteriores segun rotulo del plano: Julia Gredoy, Resto Fundo Los Maquis,
    "Lote 263, subdivisión colindante", predios N 73..N 82 del sur
    ("..., subdivisión colindante"), Servidumbre Existente, Camino de Acceso.

Uso:  python3 aplicar_colindas.py            (dry-run)
      python3 aplicar_colindas.py --apply
"""
import json, os, sys, urllib.request

PROJECT_ID = '11c3def3-5503-45bc-9a37-fe83f732460f'
ACTOR = os.environ.get('ACTOR_USER_ID', '4778854b-6dfd-4aad-8c9a-bd9f92bbb460')
ENV = os.environ.get('ENV_FILE', '/Users/matiasignacio/Developer/plotify/apps/web/.env')
APPLY = '--apply' in sys.argv

S = ', subdivisión colindante'
PLAN = {
    # --- extremo suroeste (frente sur al fan N73-N82, poniente a Julia Gredoy)
    ('1', 'PONIENTE', 89.51): ('Julia Gredoy', False),
    ('1', 'SURORIENTE', 125.67): (f'Lote 73 y Lote 74{S}', False),
    ('2', 'SURORIENTE', 10.8): (f'Lote 74 y Lote 75{S}', False),
    ('2', 'SURORIENTE', 81.85): ('Lote 1', False),
    ('3', 'SURORIENTE', 80.52): (f'Lote 76{S}', False),
    ('4', 'PONIENTE', 149.61): ('Julia Gredoy', False),
    ('5', 'PONIENTE', 75.08): ('Julia Gredoy', False),
    ('6', 'PONIENTE', 48.32): ('Julia Gredoy', False),
    ('6', 'PONIENTE', 10.74): ('Julia Gredoy', False),
    # --- corredor y hueco del lote 21 (zona 15-22 del plano)
    ('15', 'NORORIENTE', 5.78): ('Lote 10', True),
    ('16', 'SURORIENTE', 89.3): (f'Lote 79 y Lote 80{S}', False),
    ('16', 'SURORIENTE', 76.23): ('Lote 13', False),
    ('17', 'SURORIENTE', 62.83): (f'Lote 80 y Lote 81{S}', False),
    ('18', 'SURORIENTE', 49.91): (f'Lote 82{S}', False),
    ('19', 'ORIENTE', 33.85): ('Lote 21', True),
    ('19', 'SURORIENTE', 17.29): ('Lote 21', True),
    ('19', 'NORORIENTE', 32.14): ('Lote 20', True),
    ('19', 'SUR', 30.59): ('Camino de Acceso', False),
    ('20', 'NORPONIENTE', 112.92): ('Lote 21', False),
    ('20', 'ORIENTE', 104.65): ('Servidumbre Existente', False),
    ('22', 'SURORIENTE', 151.63): ('Lote 21', False),
    # --- lado oriente sector sur y cadena norponiente
    ('30', 'ORIENTE', 143.58): ('Servidumbre Existente', False),
    ('31', 'PONIENTE', 152.47): ('Julia Gredoy', False),
    ('32', 'PONIENTE', 61.3): ('Julia Gredoy', False),
    ('33', 'PONIENTE', 41.31): ('Lote 26', True),
    ('33', 'NORTE', 20.11): ('Lote 30', False),
    ('34', 'PONIENTE', 41.61): ('Lote 27', True),
    ('35', 'PONIENTE', 40.99): ('Resto Fundo Los Maquis', False),
    ('36', 'PONIENTE', 33.99): ('Resto Fundo Los Maquis', False),
    ('37', 'PONIENTE', 119.79): ('Resto Fundo Los Maquis', False),
    ('43', 'ORIENTE', 94.81): ('Lote 30', True),
    # --- lado oriente (colinda Lote 263 según rótulo del plano)
    ('44', 'ORIENTE', 48.64): (f'Lote 263{S}', False),
    ('45', 'ORIENTE', 46.84): (f'Lote 263{S}', False),
    ('46', 'ORIENTE', 42.84): (f'Lote 263{S}', False),
    ('49', 'ORIENTE', 105.11): (f'Lote 263{S}', False),
    # --- cadena norponiente (frontera exterior del predio)
    ('55', 'PONIENTE', 129.06): ('Resto Fundo Los Maquis', False),
    ('56', 'PONIENTE', 42.97): ('Resto Fundo Los Maquis', False),
    ('57', 'PONIENTE', 46.95): ('Resto Fundo Los Maquis', False),
    ('58', 'PONIENTE', 128.97): ('Resto Fundo Los Maquis', False),
    ('65', 'ORIENTE', 83.68): (f'Lote 263{S}', False),
    ('66', 'ORIENTE', 8.48): ('Lote 67', False),
    ('66', 'SURORIENTE', 37.4): (f'Lote 263{S}', False),
    ('66', 'ORIENTE', 76.11): (f'Lote 263{S}', False),
    ('67', 'ORIENTE', 61.12): (f'Lote 263{S}', False),
    ('68', 'ORIENTE', 44.32): (f'Lote 263{S}', False),
    ('72', 'PONIENTE', 88.43): ('Resto Fundo Los Maquis', False),
    ('73', 'PONIENTE', 46.4): ('Resto Fundo Los Maquis', False),
    ('74', 'PONIENTE', 54.9): ('Resto Fundo Los Maquis', False),
    ('75', 'PONIENTE', 10.58): ('Resto Fundo Los Maquis', False),
    ('75', 'NORPONIENTE', 46.81): ('Resto Fundo Los Maquis', False),
    ('76', 'NORPONIENTE', 69.41): ('Resto Fundo Los Maquis', False),
    ('76', 'NORPONIENTE', 50.73): ('Resto Fundo Los Maquis', False),
    ('79', 'ORIENTE', 46.43): (f'Lote 263{S}', False),
    ('82', 'ORIENTE', 106.47): (f'Lote 263{S}', False),
    # --- esquina nororiente (83-86)
    ('83', 'ORIENTE', 96.82): (f'Lote 263{S}', False),
    ('83', 'SURORIENTE', 25.19): ('Lote 84', False),
    ('83', 'SURORIENTE', 6.97): ('Lote 84', False),
    ('83', 'NORORIENTE', 37.99): ('Lote 78', True),
    ('84', 'ORIENTE', 101.89): (f'Lote 263{S}', False),
    ('85', 'ORIENTE', 45.99): (f'Lote 263{S}', False),
    ('85', 'NORPONIENTE', 40.6): ('Resto Fundo Los Maquis', False),
    ('85', 'NORTE', 123.19): ('Resto Fundo Los Maquis', False),
    ('86', 'NORPONIENTE', 122.33): ('Resto Fundo Los Maquis', False),
}


def env(key):
    for line in open(ENV):
        if line.startswith(key + '='):
            return line.split('=', 1)[1].strip()
    raise SystemExit(f'falta {key} en {ENV}')


URL, KEY = env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}


def req(method, path, body=None, extra=None):
    r = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
                               data=json.dumps(body).encode() if body is not None else None,
                               headers={**H, **(extra or {})})
    with urllib.request.urlopen(r) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


lots = req('GET', f'lots?project_id=eq.{PROJECT_ID}&select=id,numero_lote,boundaries_official')

por_lote = {}
aplicadas, sin_match = 0, []
for lot in lots:
    num = lot['numero_lote']
    for idx, b in enumerate(lot.get('boundaries_official') or []):
        if (b.get('colinda') or '').strip():
            continue
        key = (num, (b.get('label') or '').upper(), round(float(b.get('distance') or -1), 2))
        if key in PLAN:
            colinda, serv = PLAN[key]
            por_lote.setdefault(num, []).append((idx, colinda, serv))
            aplicadas += 1
        else:
            sin_match.append(key)

print(f'aristas vacias cubiertas por la tabla: {aplicadas}')
if sin_match:
    print('SIN entrada en tabla (no se tocan):')
    for k in sin_match:
        print('  ', k)

if not APPLY:
    print('\nDRY-RUN: no se escribio nada. Reejecuta con --apply.')
    raise SystemExit(0)

json.dump({' | '.join(map(str, k)): {'colinda': v[0], 'es_servidumbre': v[1]} for k, v in PLAN.items()},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'colindas_aplicadas.json'), 'w'),
          ensure_ascii=False, indent=1)

ok = 0
for num in sorted(por_lote, key=int):
    lot = next(l for l in lots if l['numero_lote'] == num)
    bounds = json.loads(json.dumps(lot['boundaries_official']))
    for idx, colinda, serv in por_lote[num]:
        bounds[idx]['colinda'] = colinda
        if serv:
            bounds[idx]['es_servidumbre'] = True
    req('POST', 'rpc/set_lot_official_values_as_admin', {
        'p_lot_id': lot['id'],
        'p_admin_id': ACTOR,
        'p_boundaries_official': bounds,
        'p_verify': False,
        'p_source': 'plano-n264.pdf / colindantes resueltos del plano (aplicar_colindas.py)',
    }, {'Prefer': 'return=minimal'})
    ok += 1
print(f'\nOK: {ok} lotes actualizados.')

chk = req('GET', f'lots?project_id=eq.{PROJECT_ID}&select=numero_lote,boundaries_official')
total = vacios = servs = 0
for r in chk:
    for b in (r.get('boundaries_official') or []):
        total += 1
        if not (b.get('colinda') or '').strip():
            vacios += 1
        if b.get('es_servidumbre'):
            servs += 1
print(f'verificacion BD: {total} aristas | colinda vacio: {vacios} | es_servidumbre: {servs}')
