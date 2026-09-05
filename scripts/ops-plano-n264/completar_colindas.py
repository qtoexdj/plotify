#!/usr/bin/env python3
"""Completa los colindantes vacios en lots.boundaries_official del proyecto N264
para que los textos de deslindes se generen completos (deslinde-generator.ts /
compose_deslindes_text), y marca es_servidumbre en las aristas del corredor
interno de servidumbre de transito.

Fuente de los colindantes: plano-n264.pdf.
  - Vecino lote: sondeo geometrico con los poligonos activos del proyecto
    (mismo criterio del front: midpoint + normal exterior, probe 1.5-12 m).
  - Hueco del Lote 21 (sin geometria, omitido a proposito): aristas hacia el
    hueco de los lotes 15, 19, 20 y 22 -> "Lote 21".
  - Exteriores: etiquetas impresas en el plano:
    "Julia Gredoy" (lado poniente, sector suroeste), "Resto Fundo Los Maquis"
    (norte/nororiente), "Lote 263, subdivisión colindante" (este),
    "Lote N-XX, subdivisión colindante" (frente sur, predios N 73..N 82),
    "Servidumbre Existente" y "Camino de Acceso" (sector sur-este).

es_servidumbre=true solo en aristas del corredor interno (distancia al
poligono vecino entre 0.5 y 9 m), que es la servidumbre del cuadro de
superficies (6,0 m totales, 3,0 m por lote).

Uso:  python3 completar_colindas.py            (dry-run)
      python3 completar_colindas.py --apply
"""
import json, math, os, sys, urllib.request

PROJECT_ID = '11c3def3-5503-45bc-9a37-fe83f732460f'
ACTOR = os.environ.get('ACTOR_USER_ID', '4778854b-6dfd-4aad-8c9a-bd9f92bbb460')
ENV = os.environ.get('ENV_FILE', '/Users/matiasignacio/Developer/plotify/apps/web/.env')
APPLY = '--apply' in sys.argv

# Lotes con frente sur al fan N73-N82 y su colindante segun el plano
# (divisorias leidas del plano; "y" = arista frente a dos predios).
SUR_N = {
    '1':  'Lote 73 y Lote 74',
    '2':  'Lote 75',
    '3':  'Lote 76',
    '12': 'Lote 77',
    '13': 'Lote 78',
    '16': 'Lote 79 y Lote 80',
    '17': 'Lote 80 y Lote 81',
    '18': 'Lote 82',
}
# Lotes cuyo lado hacia el corredor interno colinda con el Lote 21 (sin geometria)
HUECO_21 = {'15', '19', '20', '22'}


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


# ---------- geometria (espejo de calcular_deslindes.py / front) ----------

def ring(geom):
    t = geom['type']; c = geom['coordinates']
    if t == 'Polygon': return c[0]
    if t == 'MultiPolygon': return c[0][0]
    return []


def meters(lat):
    p = math.radians(lat)
    return (111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p),
            111412.84 * math.cos(p) - 93.5 * math.cos(3 * p))


def dist(p1, p2, mlat, mlon):
    return math.hypot((p2[0] - p1[0]) * mlon, (p2[1] - p1[1]) * mlat)


def inside(pt, rng):
    x, y = pt; n = len(rng); ins = False; j = n - 1
    for i in range(n):
        xi, yi = rng[i][0], rng[i][1]; xj, yj = rng[j][0], rng[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - y) or 1e-15) + xi):
            ins = not ins
        j = i
    return ins


def point_to_ring_dist(pt, rng, mlat, mlon):
    """Distancia aproximada en metros de pt al contorno rng (segmentos)."""
    best = float('inf')
    for i in range(len(rng) - 1):
        ax, ay = rng[i][0] * mlon, rng[i][1] * mlat
        bx, by = rng[i + 1][0] * mlon, rng[i + 1][1] * mlat
        px, py = pt[0] * mlon, pt[1] * mlat
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        tt = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        d = math.hypot(px - (ax + tt * dx), py - (ay + tt * dy))
        best = min(best, d)
    return best


# ---------- datos ----------

print('Descargando datos...')
proj = req('GET', f'projects?id=eq.{PROJECT_ID}&select=id,name,organization_id')[0]
lots = req('GET', f'lots?project_id=eq.{PROJECT_ID}&select=id,numero_lote,boundaries_official,servidumbre_m2')
geos = req('GET', f'geometries?import_id=eq.139fa82c-1ce0-44bd-bd0a-a7ff5d68efce&select=id,lot_id,name,geometry,geometry_type,active')

lot_by_id = {l['id']: l for l in lots}
polys = {}      # numero_lote -> ring
roads = []      # lineas de camino/servidumbre dibujadas
for g in geos:
    if g['geometry_type'] == 'lot' and g.get('active') and g.get('lot_id'):
        lot = lot_by_id.get(g['lot_id'])
        if lot:
            polys[lot['numero_lote']] = ring(g['geometry'])
    elif g['geometry_type'] == 'road':
        geom = g['geometry']
        if geom.get('type') == 'LineString':
            roads.append(geom['coordinates'])
print(f'lotes: {len(lots)}  poligonos: {len(polys)}  lineas road: {len(roads)}')

mlat, mlon = None, None
rings = list(polys.values())
if rings:
    lat0 = sum(p[0][1] for p in rings) / len(rings)
    mlat, mlon = meters(lat0)

# eje del loteo (SW->NE) por centroides, para clasificar exteriores
cents = []
for num, rng in polys.items():
    pts = rng[:-1] if len(rng) > 1 and rng[0] == rng[-1] else rng
    cents.append((num, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)))
c_sw = min(cents, key=lambda c: c[1] + c[2])
c_ne = max(cents, key=lambda c: c[1] + c[2])
axis = (c_ne[1] - c_sw[1], c_ne[2] - c_sw[2])
alen = math.hypot(*axis) * 1


def t_axis(x, y):
    """0 = extremo SW del loteo, 1 = extremo NE."""
    v = ((x - c_sw[1]) * axis[0] + (y - c_sw[2]) * axis[1])
    return v / ((alen ** 2) / (alen if alen == 0 else 1) or 1) / alen if alen else 0


def probe(rng_self, mid, nb):
    """Devuelve (numero_lote_vecino, distancia_al_vecino) o (None, None)."""
    for off in (1.5, 3.0, 5.0, 8.0, 12.0):
        dx = math.sin(math.radians(nb)) * off / mlon
        dy = math.cos(math.radians(nb)) * off / mlat
        pt = (mid[0] + dx, mid[1] + dy)
        for num, rng in polys.items():
            if rng is rng_self:
                continue
            if inside(pt, rng):
                d = point_to_ring_dist(mid, rng, mlat, mlon)
                return num, d
    return None, None


def clasificar_exterior(num, mid, nb, label_actual, centroide=None):
    """Colindante exterior segun etiquetas del plano."""
    pos = mid if mid is not None else centroide
    t = t_axis(pos[0], pos[1]) if pos else 0.5
    if 247.5 <= nb < 337.5:          # NW
        return 'Julia Gredoy' if t < 0.32 else 'Resto Fundo Los Maquis'
    if nb >= 337.5 or nb < 67.5:     # N-NE
        return 'Resto Fundo Los Maquis'
    if 67.5 <= nb < 157.5:           # E-SE
        if t > 0.45:
            return 'Lote 263, subdivisión colindante'
        return 'Servidumbre Existente'
    # S-SW: frente sur
    if num in SUR_N:
        return SUR_N[num] + ', subdivisión colindante'
    if t < 0.12:
        return 'Camino de Acceso'
    return 'Camino de Acceso'


# ---------- procesar ----------

cambios = []   # (numero_lote, idx, colinda, es_servidumbre)
for lot in sorted(lots, key=lambda l: int(l['numero_lote']) if l['numero_lote'].isdigit() else 9999):
    num = lot['numero_lote']
    bounds = lot.get('boundaries_official')
    if not bounds:
        continue
    rng = polys.get(num)
    if rng is None:
        print(f'AVISO: lote {num} con boundaries pero sin poligono; se omite completo')
        continue
    for idx, b in enumerate(bounds):
        if (b.get('colinda') or '').strip():
            continue
        label = (b.get('label') or '').upper()
        distancia = b.get('distance')
        colinda, es_serv = None, False
        if rng:
            pts = rng[:-1] if len(rng) > 1 and rng[0] == rng[-1] else rng[:]
            # localizar la arista: reconstruir aristas y matchear por (label, distance)
            best = None
            for i in range(len(pts)):
                p1, p2 = pts[i], pts[(i + 1) % len(pts)]
                d = dist(p1, p2, mlat, mlon)
                if d <= 0.01:
                    continue
                sb = math.degrees(math.atan2(
                    math.sin(math.radians(p2[0] - p1[0])) * math.cos(math.radians(p2[1])),
                    math.cos(math.radians(p1[1])) * math.sin(math.radians(p2[1])) -
                    math.sin(math.radians(p1[1])) * math.cos(math.radians(p2[1])) * math.cos(math.radians(p2[0] - p1[0]))
                )) % 360
                mid = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
                cm = math.degrees(math.atan2(mid[0] - (sum(p[0] for p in pts) / len(pts)),
                                             mid[1] - (sum(p[1] for p in pts) / len(pts)))) % 360
                n1, n2 = (sb + 90) % 360, (sb + 270) % 360
                nb = n1 if min(abs(n1 - cm), 360 - abs(n1 - cm)) < min(abs(n2 - cm), 360 - abs(n2 - cm)) else n2
                card = ['NORTE', 'NORORIENTE', 'ORIENTE', 'SURORIENTE', 'SUR', 'SURPONIENTE', 'PONIENTE', 'NORPONIENTE', 'NORTE'][round(nb / 45)]
                gap = abs(d - (distancia or -1))
                if card == label and gap < 0.5 and (best is None or gap < best[0]):
                    best = (gap, mid, nb)
            if best:
                mid, nb = best[1], best[2]
                vecino, dvec = probe(rng, mid, nb)
                if vecino:
                    colinda = f'Lote {vecino}'
                    es_serv = 0.5 < dvec <= 9.0
                elif num in HUECO_21:
                    colinda = 'Lote 21'
                    es_serv = num in ('19', '15')
                else:
                    colinda = clasificar_exterior(num, mid, nb, label)
        if rng is None:
            print(f'AVISO: lote {num} sin poligono pero con arista vacia ({label}); se omite')
            continue
        if colinda is None:
            # la arista no se pudo localizar en el ring: clasificar por label
            pts_c = rng[:-1] if len(rng) > 1 and rng[0] == rng[-1] else rng[:]
            centroide = (sum(p[0] for p in pts_c) / len(pts_c), sum(p[1] for p in pts_c) / len(pts_c))
            colinda = clasificar_exterior(num, None, {'NORTE': 0, 'NORORIENTE': 45, 'ORIENTE': 90, 'SURORIENTE': 135, 'SUR': 180, 'SURPONIENTE': 225, 'PONIENTE': 270, 'NORPONIENTE': 315}.get(label, 0), label, centroide)
        cambios.append((num, idx, b, colinda, es_serv))

print(f'\naristas a completar: {len(cambios)}')
resumen = {}
for num, idx, b, colinda, es_serv in cambios:
    resumen.setdefault(colinda.split(',')[0], []).append(f"{num}:{b.get('label')}")
for k in sorted(resumen):
    print(f'  {k:<38} {len(resumen[k]):>2}  {", ".join(resumen[k][:10])}{"..." if len(resumen[k])>10 else ""}')

if not APPLY:
    print('\nDRY-RUN: no se escribio nada. Reejecuta con --apply.')
    raise SystemExit(0)

json.dump([{ 'numero_lote': c[0], 'idx': c[1], 'colinda': c[3], 'es_servidumbre': c[4]} for c in cambios],
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'colindas_backup.json')), ensure_ascii=False, indent=1)

por_lote = {}
for num, idx, b, colinda, es_serv in cambios:
    por_lote.setdefault(num, {})[idx] = (colinda, es_serv)

ok = 0
for num, edicts in sorted(por_lote.items(), key=lambda kv: int(kv[0])):
    lot = next(l for l in lots if l['numero_lote'] == num)
    bounds = json.loads(json.dumps(lot['boundaries_official']))
    for idx, (colinda, es_serv) in edicts.items():
        bounds[idx]['colinda'] = colinda
        if es_serv:
            bounds[idx]['es_servidumbre'] = True
    req('POST', 'rpc/set_lot_official_values_as_admin', {
        'p_lot_id': lot['id'],
        'p_admin_id': ACTOR,
        'p_boundaries_official': bounds,
        'p_verify': False,
        'p_source': 'plano-n264.pdf / colindantes exteriores y corredor de servidumbre (completar_colindas.py)',
    }, {'Prefer': 'return=minimal'})
    ok += 1
print(f'\nOK: {ok} lotes actualizados via set_lot_official_values_as_admin (backup en colindas_backup.json).')

chk = req('GET', f'lots?project_id=eq.{PROJECT_ID}&select=numero_lote,boundaries_official')
vacios = 0
total = 0
for r in chk:
    for b in (r.get('boundaries_official') or []):
        total += 1
        if not (b.get('colinda') or '').strip():
            vacios += 1
print(f'verificacion: {total} aristas, {vacios} con colinda vacio')
