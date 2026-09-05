"""Deslindes por lote desde la geometria, replicando getBoundaries/getCardinalDirection
del front (verificado: reproduce exacto lo que muestra el panel)."""
import math, json, os, urllib.request

def _env(key, path='/Users/matiasignacio/Developer/plotify/apps/web/.env'):
    for line in open(path):
        if line.startswith(key+'='): return line.split('=',1)[1].strip()
    raise SystemExit('falta '+key)

URL=_env('NEXT_PUBLIC_SUPABASE_URL'); KEY=_env('SUPABASE_SERVICE_ROLE_KEY')
H={'apikey':KEY,'Authorization':f'Bearer {KEY}'}

def get(path):
    r=urllib.request.Request(URL+'/rest/v1/'+path, headers=H)
    with urllib.request.urlopen(r) as x: return json.loads(x.read())

def bearing(p1,p2):
    lat1=math.radians(p1[1]); lat2=math.radians(p2[1]); dLon=math.radians(p2[0]-p1[0])
    y=math.sin(dLon)*math.cos(lat2)
    x=math.cos(lat1)*math.sin(lat2)-math.sin(lat1)*math.cos(lat2)*math.cos(dLon)
    return (math.degrees(math.atan2(y,x))+360)%360

CARD=['NORTE','NORORIENTE','ORIENTE','SURORIENTE','SUR','SURPONIENTE','PONIENTE','NORPONIENTE','NORTE']
def cardinal(b): return CARD[round(b/45)]

def ring(geom):
    t=geom['type']; c=geom['coordinates']
    if t=='Polygon': return c[0]
    if t=='MultiPolygon': return c[0][0]
    if t=='LineString': return c
    if t=='MultiLineString': return c[0]
    return []

def meters(lat):
    p=math.radians(lat)
    return (111132.92-559.82*math.cos(2*p)+1.175*math.cos(4*p),
            111412.84*math.cos(p)-93.5*math.cos(3*p))

def dist(p1,p2,mlat,mlon):
    return math.hypot((p2[0]-p1[0])*mlon,(p2[1]-p1[1])*mlat)

def inside(pt, rng):
    x,y=pt; n=len(rng); ins=False; j=n-1
    for i in range(n):
        xi,yi=rng[i][0],rng[i][1]; xj,yj=rng[j][0],rng[j][1]
        if ((yi>y)!=(yj>y)) and (x < (xj-xi)*(y-yi)/((yj-yi) or 1e-15)+xi): ins=not ins
        j=i
    return ins

def boundaries_for(rng, others, mlat, mlon):
    pts=rng[:-1] if len(rng)>1 and rng[0]==rng[-1] else rng[:]
    cx=sum(p[0] for p in pts)/len(pts); cy=sum(p[1] for p in pts)/len(pts)
    out=[]
    for i in range(len(pts)):
        p1=pts[i]; p2=pts[(i+1)%len(pts)]
        d=dist(p1,p2,mlat,mlon)
        if d<=0.01: continue
        sb=bearing(p1,p2)
        mid=((p1[0]+p2[0])/2,(p1[1]+p2[1])/2)
        cm=bearing((cx,cy),mid)
        n1=(sb+90)%360; n2=(sb+270)%360
        d1=min(abs(n1-cm),360-abs(n1-cm)); d2=min(abs(n2-cm),360-abs(n2-cm))
        nb=n1 if d1<d2 else n2
        # sondear hacia afuera para ver que lote colinda
        colinda=''
        for off in (1.5,3.0,5.0):
            dx=math.sin(math.radians(nb))*off/mlon; dy=math.cos(math.radians(nb))*off/mlat
            probe=(mid[0]+dx, mid[1]+dy)
            hit=[num for num,r in others if inside(probe,r)]
            if hit: colinda=f'Lote {hit[0]}'; break
        out.append({'label':cardinal(nb),'distance':round(d,2),
                    'description':f'{cardinal(nb)} en {round(d,2):.2f} m','colinda':colinda})
    return out
