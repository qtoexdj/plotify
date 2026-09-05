#!/usr/bin/env python3
"""Carga las cifras oficiales del plano N264 (CUADRO DE SUPERFICIES) en los lotes.

Fuente: plano-n264.pdf, "CUADRO DE SUPERFICIES SITUACION PROPUESTA".
Transcripcion validada contra los totales impresos del propio plano:
  servidumbre 20.076,7 m2 y superficie total 462.000,0 m2 calzan exacto.

Uso:  python3 cargar_plano_n264.py            (dry-run)
      python3 cargar_plano_n264.py --apply    (escribe)
"""
import json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plano_lotes import DATA

PROJECT_ID = os.environ.get('PROJECT_ID', '11c3def3-5503-45bc-9a37-fe83f732460f')
ENV = os.environ.get('ENV_FILE', '/Users/matiasignacio/Developer/plotify/apps/web/.env')
APPLY = '--apply' in sys.argv

def env(key):
    for line in open(ENV):
        if line.startswith(key + '='):
            return line.split('=', 1)[1].strip()
    raise SystemExit(f'falta {key} en {ENV}')

URL = env('NEXT_PUBLIC_SUPABASE_URL')
KEY = env('SUPABASE_SERVICE_ROLE_KEY')
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def req(method, path, body=None, extra=None):
    r = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
                               data=json.dumps(body).encode() if body is not None else None,
                               headers={**H, **(extra or {})})
    with urllib.request.urlopen(r) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None

lots = req('GET', f'projects?id=eq.{PROJECT_ID}&select=id,name,organization_id')
if not lots:
    raise SystemExit('proyecto no encontrado')
proj = lots[0]
rows = req('GET', f'lots?project_id=eq.{PROJECT_ID}&select=id,numero_lote,area_official_m2,servidumbre_m2')
by_num = {r['numero_lote']: r for r in rows}

print(f"proyecto: {proj['name']} ({PROJECT_ID})")
print(f"lotes en BD: {len(rows)}   filas del plano: {len(DATA)}")
faltan = [n for n in DATA if str(n) not in by_num]
sobran = [n for n in by_num if not n.isdigit() or int(n) not in DATA]
if faltan: print('SIN LOTE EN BD:', faltan)
if sobran: print('SIN FILA EN PLANO:', sobran)
if faltan or sobran:
    raise SystemExit('la numeracion no calza; abortado sin escribir')

cambios = []
for n, (util, serv, total, largo, ancho) in sorted(DATA.items()):
    lot = by_num[str(n)]
    payload = {
        'area_official_m2': total,        # superficie del plano (util + servidumbre)
        'superficie_neta_m2': util,       # superficie util
        'servidumbre_m2': serv,
        'servidumbre_ancho_m': ancho,
        'servidumbre_ancho_label': f'{ancho:.1f} m'.replace('.', ','),
    }
    cambios.append((lot['id'], n, payload, lot))

print(f"\n{'lote':>5} {'total m2':>10} {'util m2':>10} {'servid m2':>10} {'ancho':>7}")
for _, n, p, _ in cambios[:5]:
    print(f"{n:>5} {p['area_official_m2']:>10.1f} {p['superficie_neta_m2']:>10.1f} {p['servidumbre_m2']:>10.1f} {p['servidumbre_ancho_label']:>7}")
print(f"  ... ({len(cambios)} lotes en total)")

if not APPLY:
    print('\nDRY-RUN: no se escribio nada. Reejecuta con --apply para aplicar.')
    raise SystemExit(0)

ok = 0
for lot_id, n, payload, prev in cambios:
    req('PATCH', f'lots?id=eq.{lot_id}', payload, {'Prefer': 'return=minimal'})
    req('POST', 'audit_logs', {
        'actor': 'ops:carga-plano-n264',
        'action': 'UPDATE',
        'entity': 'lots',
        'entity_id': lot_id,
        'organization_id': proj['organization_id'],
        'payload': {
            'type': 'official_override',
            'source': 'plano-n264.pdf / CUADRO DE SUPERFICIES SITUACION PROPUESTA',
            'prev': {'area_official_m2': prev.get('area_official_m2'),
                     'servidumbre_m2': prev.get('servidumbre_m2')},
            'next': payload,
        },
    }, {'Prefer': 'return=minimal'})
    ok += 1
print(f'\nOK: {ok} lotes actualizados con auditoria.')

check = req('GET', f'lots?project_id=eq.{PROJECT_ID}&select=numero_lote,area_official_m2,superficie_neta_m2,servidumbre_m2')
st = sum(r['area_official_m2'] or 0 for r in check)
su = sum(r['superficie_neta_m2'] or 0 for r in check)
ss = sum(r['servidumbre_m2'] or 0 for r in check)
print(f"verificacion en BD -> total {st:,.1f} (plano 462.000,0) | util {su:,.1f} | servidumbre {ss:,.1f} (plano 20.076,7)")
