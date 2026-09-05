#!/usr/bin/env python3
"""Deja los lotes de N264 VERIFICADOS con las cifras oficiales del plano.

Escribe por lote:
  - area_official_m2      <- SUPERFICIE TOTAL del plano (util + servidumbre)
  - superficie_neta_m2    <- SUPERFICIE UTIL
  - servidumbre_m2        <- SERVIDUMBRE
  - servidumbre_ancho_m   <- ANCHO (3,0 m) + su etiqueta para la minuta
  - boundaries_official   <- deslindes derivados de la geometria (rumbo, distancia, colindante)
  - verified_status='verified_override' + verified_at/by

Fuente de las cifras: plano-n264.pdf, "CUADRO DE SUPERFICIES SITUACION PROPUESTA".
Transcripcion validada contra los totales impresos: servidumbre 20.076,7 m2 y
superficie total 462.000,0 m2 calzan exacto.

Uso:  python3 verificar_lotes_n264.py            (dry-run)
      python3 verificar_lotes_n264.py --apply
"""
import json, os, sys, urllib.request
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plano_lotes import DATA

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ID = os.environ.get('PROJECT_ID', '11c3def3-5503-45bc-9a37-fe83f732460f')
ACTOR = os.environ.get('ACTOR_USER_ID', '4778854b-6dfd-4aad-8c9a-bd9f92bbb460')
ENV = os.environ.get('ENV_FILE', '/Users/matiasignacio/Developer/plotify/apps/web/.env')
APPLY = '--apply' in sys.argv

def env(k):
    for line in open(ENV):
        if line.startswith(k + '='): return line.split('=', 1)[1].strip()
    raise SystemExit(f'falta {k} en {ENV}')

URL, KEY = env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def req(method, path, body=None, extra=None):
    r = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
                               data=json.dumps(body).encode() if body is not None else None,
                               headers={**H, **(extra or {})})
    with urllib.request.urlopen(r) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None

proj = req('GET', f'projects?id=eq.{PROJECT_ID}&select=id,name,organization_id')
if not proj: raise SystemExit('proyecto no encontrado')
proj = proj[0]
rows = req('GET', f'lots?project_id=eq.{PROJECT_ID}&select=id,numero_lote,geometry_id,area_official_m2,verified_status')
by_num = {r['numero_lote']: r for r in rows}
deslindes = json.load(open(os.path.join(HERE, 'deslindes.json')))

faltan = [n for n in DATA if str(n) not in by_num]
if faltan: raise SystemExit(f'lotes del plano sin fila en BD: {faltan}; abortado')

verificables, solo_cifras = [], []
for n, (util, serv, total, largo, ancho) in sorted(DATA.items()):
    lot = by_num[str(n)]
    payload = {
        'area_official_m2': total,
        'superficie_neta_m2': util,
        'servidumbre_m2': serv,
        'servidumbre_ancho_m': ancho,
        'servidumbre_ancho_label': f'{ancho:.1f} m'.replace('.', ','),
    }
    bounds = deslindes.get(str(n))
    if bounds and lot['geometry_id']:
        payload['boundaries_official'] = bounds
        # can_activate_project_sales exige perimetro oficial > 0; se usa la suma
        # de los deslindes para que cuadre exactamente con ellos.
        payload['perimeter_official_m'] = round(sum(b['distance'] for b in bounds), 2)
        payload['verified_status'] = 'verified_override'
        payload['verified_at'] = datetime.now(timezone.utc).isoformat()
        payload['verified_by'] = ACTOR
        verificables.append((lot, n, payload))
    else:
        # Sin geometria no hay deslindes: se cargan las cifras y queda en draft.
        solo_cifras.append((lot, n, payload))

print(f"proyecto: {proj['name']}")
print(f"lotes a VERIFICAR (cifras + deslindes): {len(verificables)}")
print(f"lotes solo con cifras (sin geometria, quedan en draft): {[n for _, n, _ in solo_cifras]}")
if not APPLY:
    ej = verificables[0]
    print(f"\nejemplo lote {ej[1]}: total {ej[2]['area_official_m2']} m2, "
          f"servidumbre {ej[2]['servidumbre_m2']} m2, perimetro {ej[2]['perimeter_official_m']} m, "
          f"{len(ej[2]['boundaries_official'])} deslindes")
    for b in ej[2]['boundaries_official']:
        print(f"    {b['label']:<12} {b['distance']:>7.2f} m  {b['colinda'] or '(sin colindante detectado)'}")
    print('\nDRY-RUN: no se escribio nada. Reejecuta con --apply.')
    raise SystemExit(0)

ok = 0
for lot, n, payload in verificables + solo_cifras:
    # Via RPC: trg_guard_legal_fields revierte en silencio los campos legales
    # escritos sin contexto de admin, por eso no sirve un PATCH directo.
    req('POST', 'rpc/set_lot_official_values_as_admin', {
        'p_lot_id': lot['id'],
        'p_admin_id': ACTOR,
        'p_area_official_m2': payload['area_official_m2'],
        'p_superficie_neta_m2': payload['superficie_neta_m2'],
        'p_servidumbre_m2': payload['servidumbre_m2'],
        'p_servidumbre_ancho_m': payload['servidumbre_ancho_m'],
        'p_servidumbre_ancho_label': payload['servidumbre_ancho_label'],
        'p_perimeter_official_m': payload.get('perimeter_official_m'),
        'p_boundaries_official': payload.get('boundaries_official'),
        'p_verify': 'boundaries_official' in payload,
        'p_source': 'plano-n264.pdf / CUADRO DE SUPERFICIES SITUACION PROPUESTA',
    }, {'Prefer': 'return=minimal'})
    ok += 1
print(f'\nOK: {ok} lotes escritos con auditoria.')

chk = req('GET', f'lots?project_id=eq.{PROJECT_ID}&select=numero_lote,area_official_m2,superficie_neta_m2,servidumbre_m2,verified_status,boundaries_official,perimeter_official_m')
st = sum(r['area_official_m2'] or 0 for r in chk)
su = sum(r['superficie_neta_m2'] or 0 for r in chk)
ss = sum(r['servidumbre_m2'] or 0 for r in chk)
ver = sum(1 for r in chk if (r['verified_status'] or '').startswith('verified'))
con_desl = sum(1 for r in chk if r['boundaries_official'])
print(f"superficie total {st:,.1f}  (plano 462.000,0)")
print(f"superficie util  {su:,.1f}  (plano 441.923,3)")
print(f"servidumbre      {ss:,.1f}  (plano 20.076,7)")
print(f"verificados      {ver}/{len(chk)}   con deslindes: {con_desl}")
fallos = [r['numero_lote'] for r in chk if r['area_official_m2'] is None]
if fallos: print('SIN area_official_m2:', fallos)
gate = req('POST', 'rpc/can_activate_project_sales', {'p_project_id': PROJECT_ID})
print(f"can_activate_project_sales -> {gate}")
