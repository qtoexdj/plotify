export type ChileRegion = {
  code: string
  name: string
}

type DpaItem = {
  codigo: string
  nombre: string
  codigo_padre?: string
}

const DPA_BASE_URL = 'https://apis.digital.gob.cl/dpa'

export const CHILE_REGIONS: ChileRegion[] = [
  { code: '15', name: 'Arica y Parinacota' },
  { code: '01', name: 'Tarapacá' },
  { code: '02', name: 'Antofagasta' },
  { code: '03', name: 'Atacama' },
  { code: '04', name: 'Coquimbo' },
  { code: '05', name: 'Valparaíso' },
  { code: '13', name: 'Metropolitana de Santiago' },
  { code: '06', name: "Libertador General Bernardo O'Higgins" },
  { code: '07', name: 'Maule' },
  { code: '16', name: 'Ñuble' },
  { code: '08', name: 'Biobío' },
  { code: '09', name: 'La Araucanía' },
  { code: '14', name: 'Los Ríos' },
  { code: '10', name: 'Los Lagos' },
  { code: '11', name: 'Aysén del General Carlos Ibáñez del Campo' },
  { code: '12', name: 'Magallanes y de la Antártica Chilena' },
]

export const CHILE_COMMUNES_BY_REGION: Record<string, string[]> = {
  '15': ['Arica', 'Camarones', 'Putre', 'General Lagos'],
  '01': ['Iquique', 'Alto Hospicio', 'Pozo Almonte', 'Camiña', 'Colchane', 'Huara', 'Pica'],
  '02': [
    'Antofagasta',
    'Mejillones',
    'Sierra Gorda',
    'Taltal',
    'Calama',
    'Ollagüe',
    'San Pedro de Atacama',
    'Tocopilla',
    'María Elena',
  ],
  '03': [
    'Copiapó',
    'Caldera',
    'Tierra Amarilla',
    'Chañaral',
    'Diego de Almagro',
    'Vallenar',
    'Alto del Carmen',
    'Freirina',
    'Huasco',
  ],
  '04': [
    'La Serena',
    'Coquimbo',
    'Andacollo',
    'La Higuera',
    'Paihuano',
    'Vicuña',
    'Illapel',
    'Canela',
    'Los Vilos',
    'Salamanca',
    'Ovalle',
    'Combarbalá',
    'Monte Patria',
    'Punitaqui',
    'Río Hurtado',
  ],
  '05': [
    'Valparaíso',
    'Casablanca',
    'Concón',
    'Juan Fernández',
    'Puchuncaví',
    'Quintero',
    'Viña del Mar',
    'Rapa Nui',
    'Los Andes',
    'Calle Larga',
    'Rinconada',
    'San Esteban',
    'La Ligua',
    'Cabildo',
    'Papudo',
    'Petorca',
    'Zapallar',
    'Quillota',
    'Calera',
    'Hijuelas',
    'La Cruz',
    'Nogales',
    'San Antonio',
    'Algarrobo',
    'Cartagena',
    'El Quisco',
    'El Tabo',
    'Santo Domingo',
    'San Felipe',
    'Catemu',
    'Llay-Llay',
    'Panquehue',
    'Putaendo',
    'Santa María',
    'Quilpué',
    'Limache',
    'Olmué',
    'Villa Alemana',
  ],
  '13': [
    'Santiago',
    'Cerrillos',
    'Cerro Navia',
    'Conchalí',
    'El Bosque',
    'Estación Central',
    'Huechuraba',
    'Independencia',
    'La Cisterna',
    'La Florida',
    'La Granja',
    'La Pintana',
    'La Reina',
    'Las Condes',
    'Lo Barnechea',
    'Lo Espejo',
    'Lo Prado',
    'Macul',
    'Maipú',
    'Ñuñoa',
    'Pedro Aguirre Cerda',
    'Peñalolén',
    'Providencia',
    'Pudahuel',
    'Quilicura',
    'Quinta Normal',
    'Recoleta',
    'Renca',
    'San Joaquín',
    'San Miguel',
    'San Ramón',
    'Vitacura',
    'Puente Alto',
    'Pirque',
    'San José de Maipo',
    'Colina',
    'Lampa',
    'Tiltil',
    'San Bernardo',
    'Buin',
    'Calera de Tango',
    'Paine',
    'Melipilla',
    'Alhué',
    'Curacaví',
    'María Pinto',
    'San Pedro',
    'Talagante',
    'El Monte',
    'Isla de Maipo',
    'Padre Hurtado',
    'Peñaflor',
  ],
  '06': [
    'Rancagua',
    'Codegua',
    'Coinco',
    'Coltauco',
    'Doñihue',
    'Graneros',
    'Las Cabras',
    'Machalí',
    'Malloa',
    'Mostazal',
    'Olivar',
    'Peumo',
    'Pichidegua',
    'Quinta de Tilcoco',
    'Rengo',
    'Requínoa',
    'San Vicente',
    'Pichilemu',
    'La Estrella',
    'Litueche',
    'Marchihue',
    'Navidad',
    'Paredones',
    'San Fernando',
    'Chépica',
    'Chimbarongo',
    'Lolol',
    'Nancagua',
    'Palmilla',
    'Peralillo',
    'Placilla',
    'Pumanque',
    'Santa Cruz',
  ],
  '07': [
    'Talca',
    'Constitución',
    'Curepto',
    'Empedrado',
    'Maule',
    'Pelarco',
    'Pencahue',
    'Río Claro',
    'San Clemente',
    'San Rafael',
    'Cauquenes',
    'Chanco',
    'Pelluhue',
    'Curicó',
    'Hualañé',
    'Licantén',
    'Molina',
    'Rauco',
    'Romeral',
    'Sagrada Familia',
    'Teno',
    'Vichuquén',
    'Linares',
    'Colbún',
    'Longaví',
    'Parral',
    'Retiro',
    'San Javier',
    'Villa Alegre',
    'Yerbas Buenas',
  ],
  '16': [
    'Chillán',
    'Bulnes',
    'Chillán Viejo',
    'El Carmen',
    'Pemuco',
    'Pinto',
    'Quillón',
    'San Ignacio',
    'Yungay',
    'Quirihue',
    'Cobquecura',
    'Coelemu',
    'Ninhue',
    'Portezuelo',
    'Ránquil',
    'Treguaco',
    'San Carlos',
    'Coihueco',
    'Ñiquén',
    'San Fabián',
    'San Nicolás',
  ],
  '08': [
    'Concepción',
    'Coronel',
    'Chiguayante',
    'Florida',
    'Hualqui',
    'Lota',
    'Penco',
    'San Pedro de la Paz',
    'Santa Juana',
    'Talcahuano',
    'Tomé',
    'Hualpén',
    'Lebu',
    'Arauco',
    'Cañete',
    'Contulmo',
    'Curanilahue',
    'Los Álamos',
    'Tirúa',
    'Los Ángeles',
    'Antuco',
    'Cabrero',
    'Laja',
    'Mulchén',
    'Nacimiento',
    'Negrete',
    'Quilaco',
    'Quilleco',
    'San Rosendo',
    'Santa Bárbara',
    'Tucapel',
    'Yumbel',
    'Alto Biobío',
  ],
  '09': [
    'Temuco',
    'Carahue',
    'Cunco',
    'Curarrehue',
    'Freire',
    'Galvarino',
    'Gorbea',
    'Lautaro',
    'Loncoche',
    'Melipeuco',
    'Nueva Imperial',
    'Padre Las Casas',
    'Perquenco',
    'Pitrufquén',
    'Pucón',
    'Saavedra',
    'Teodoro Schmidt',
    'Toltén',
    'Vilcún',
    'Villarrica',
    'Cholchol',
    'Angol',
    'Collipulli',
    'Curacautín',
    'Ercilla',
    'Lonquimay',
    'Los Sauces',
    'Lumaco',
    'Purén',
    'Renaico',
    'Traiguén',
    'Victoria',
  ],
  '14': [
    'Valdivia',
    'Corral',
    'Lanco',
    'Los Lagos',
    'Máfil',
    'Mariquina',
    'Paillaco',
    'Panguipulli',
    'La Unión',
    'Futrono',
    'Lago Ranco',
    'Río Bueno',
  ],
  '10': [
    'Puerto Montt',
    'Calbuco',
    'Cochamó',
    'Fresia',
    'Frutillar',
    'Los Muermos',
    'Llanquihue',
    'Maullín',
    'Puerto Varas',
    'Castro',
    'Ancud',
    'Chonchi',
    'Curaco de Vélez',
    'Dalcahue',
    'Puqueldón',
    'Queilén',
    'Quellón',
    'Quemchi',
    'Quinchao',
    'Osorno',
    'Puerto Octay',
    'Purranque',
    'Puyehue',
    'Río Negro',
    'San Juan de la Costa',
    'San Pablo',
    'Chaitén',
    'Futaleufú',
    'Hualaihué',
    'Palena',
  ],
  '11': [
    'Coyhaique',
    'Lago Verde',
    'Aysén',
    'Cisnes',
    'Guaitecas',
    'Cochrane',
    'O’Higgins',
    'Tortel',
    'Chile Chico',
    'Río Ibáñez',
  ],
  '12': [
    'Punta Arenas',
    'Laguna Blanca',
    'Río Verde',
    'San Gregorio',
    'Cabo de Hornos',
    'Antártica',
    'Porvenir',
    'Primavera',
    'Timaukel',
    'Natales',
    'Torres del Paine',
  ],
}

const REGION_NAME_BY_CODE = new Map(CHILE_REGIONS.map((region) => [region.code, region.name]))

function normalizeLocationName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/region|del|de la|de los|de|gral\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function findRegionCode(regionName?: string | null) {
  if (!regionName) return CHILE_REGIONS[0]?.code ?? ''
  const normalized = normalizeLocationName(regionName)
  return (
    CHILE_REGIONS.find((region) => normalizeLocationName(region.name) === normalized)?.code ??
    CHILE_REGIONS.find((region) => normalizeLocationName(region.name).includes(normalized))?.code ??
    ''
  )
}

export function mapDpaRegions(items: DpaItem[]) {
  return items
    .filter((item) => item.codigo && item.nombre)
    .map((item) => ({
      code: item.codigo,
      name: REGION_NAME_BY_CODE.get(item.codigo) ?? item.nombre,
    }))
}

export async function fetchDpaJsonArray(url: string): Promise<DpaItem[]> {
  try {
    const response = await fetch(url)
    if (!response.ok) return []
    const payload = await response.json()
    return Array.isArray(payload) ? payload : []
  } catch {
    return []
  }
}

export async function fetchChileRegions() {
  const regions = await fetchDpaJsonArray(`${DPA_BASE_URL}/regiones`)
  return regions.length > 0 ? mapDpaRegions(regions) : CHILE_REGIONS
}

export async function fetchCommunesByRegion(regionCode: string) {
  const fallbackCommunes = CHILE_COMMUNES_BY_REGION[regionCode] ?? []

  const directCommunes = await fetchDpaJsonArray(`${DPA_BASE_URL}/regiones/${regionCode}/comunas`)
  if (directCommunes.length > 0) return directCommunes.map((item) => item.nombre).sort()

  const provinces = await fetchDpaJsonArray(`${DPA_BASE_URL}/regiones/${regionCode}/provincias`)
  const communesByProvince = await Promise.all(
    provinces.map((province) =>
      fetchDpaJsonArray(`${DPA_BASE_URL}/provincias/${province.codigo}/comunas`)
    )
  )

  const provinceCommunes = Array.from(
    new Set(
      communesByProvince
        .flat()
        .map((item) => item.nombre)
        .filter(Boolean)
    )
  )

  if (provinceCommunes.length > 0) return provinceCommunes.sort()

  const allCommunes = await fetchDpaJsonArray(`${DPA_BASE_URL}/comunas`)
  const filteredCommunes = allCommunes
    .filter(
      (item) => item.codigo?.startsWith(regionCode) || item.codigo_padre?.startsWith(regionCode)
    )
    .map((item) => item.nombre)
    .filter(Boolean)
    .sort()

  return filteredCommunes.length > 0 ? filteredCommunes : fallbackCommunes
}
