import { calculatePolygonArea, calculateDistance } from './utils'

// --- Reference / Comparison Implementations ---

// WGS84 Ellipsoid constants
const a = 6378137.0
const f = 1 / 298.257223563
const b = a * (1 - f)
// const e2 = f * (2 - f);

// Simple implementation of Vincenty distance (more accurate than Haversine)
function vincentyDistance(p1: number[], p2: number[]): number {
  const lat1 = (p1[1] * Math.PI) / 180
  const lon1 = (p1[0] * Math.PI) / 180
  const lat2 = (p2[1] * Math.PI) / 180
  const lon2 = (p2[0] * Math.PI) / 180
  const L = lon2 - lon1
  const U1 = Math.atan((1 - f) * Math.tan(lat1))
  const U2 = Math.atan((1 - f) * Math.tan(lat2))
  const sinU1 = Math.sin(U1),
    cosU1 = Math.cos(U1)
  const sinU2 = Math.sin(U2),
    cosU2 = Math.cos(U2)

  let lambda = L
  let lambdaP = 2 * Math.PI
  let iterLimit = 100
  let sinSigma = 0,
    cosSigma = 0,
    sigma = 0,
    sinAlpha = 0,
    cosSqAlpha = 0,
    cos2SigmaM = 0
  let C = 0

  while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0) {
    const sinLambda = Math.sin(lambda),
      cosLambda = Math.cos(lambda)
    sinSigma = Math.sqrt(
      cosU2 * sinLambda * (cosU2 * sinLambda) +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
    )
    if (sinSigma === 0) return 0 // co-incident points
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda
    sigma = Math.atan2(sinSigma, cosSigma)
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma
    cosSqAlpha = 1 - sinAlpha * sinAlpha
    cos2SigmaM = cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha
    if (isNaN(cos2SigmaM)) cos2SigmaM = 0 // equatorial line: cosSqAlpha=0 (§6)
    C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha))
    lambdaP = lambda
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)))
  }
  if (iterLimit === 0) return NaN // formula failed to converge

  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b)
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)))

  return b * A * (sigma - deltaSigma)
}

// Projection to UTM (Approximation for Zone 19S - Santiago)
// This lets us calculate "Planar Area" which is usually what deeds expect
// function toUTM_Approx_Zone19S(lon: number, lat: number) {
//     // This is a VERY simplified transverse mercator just to get local meters relative to a center point
//     // Santiago is approx -70.6 deg lon. Zone 19 center is -69.
//     // We can just use a local flat projection centered on the polygon for area estimation.
//     // Local Tangent Plane (Euclidean)
//     const R_earth = 6378137;
//     const lat_rad = lat * Math.PI / 180;
//     const lon_rad = lon * Math.PI / 180;
//
//     // Relative to the first point of the polygon usually
//     // But here just simple spherical projection
//     const x = R_earth * lon_rad * Math.cos(lat_rad); // simple scale
//     const y = R_earth * lat_rad;
//     return { x, y };
// }

function calculatePlanarArea(coords: number[][]): number {
  // 1. Centroid for local projection to minimize distortion
  let sumLon = 0,
    sumLat = 0
  coords.forEach((p) => {
    sumLon += p[0]
    sumLat += p[1]
  })
  const cenLon = sumLon / coords.length
  const cenLat = sumLat / coords.length

  // 2. Project to local plane (meters)
  const R = 6378137
  const points_m = coords.map((p) => {
    const dLat = ((p[1] - cenLat) * Math.PI) / 180
    const dLon = ((p[0] - cenLon) * Math.PI) / 180
    const y = R * dLat
    const x = R * dLon * Math.cos((cenLat * Math.PI) / 180)
    return { x, y }
  })

  // 3. Shoelace formula
  let area = 0
  for (let i = 0; i < points_m.length; i++) {
    const j = (i + 1) % points_m.length
    area += points_m[i].x * points_m[j].y
    area -= points_m[j].x * points_m[i].y
  }
  return Math.abs(area / 2.0)
}

// --- EXPERIMENTS ---

console.log('=== PLOTIFY GEOSPATIAL ENGINE AUDIT ===')
console.log('Comparing src/lib/geometry/utils.ts vs Reference Implementations\n')

// Case 1: 100x100m Square in Santiago
// Center: -33.45, -70.66
// We construct a polygon that is roughly 100m on each side.
// 1 deg lat = 110996m roughly
// 1 deg lon = 92935m roughly (at -33.45)
const startLat = -33.45
const startLon = -70.66
const offsetLat = 100 / 111132 // approx degrees for 100m
const offsetLon = 100 / (111320 * Math.cos((startLat * Math.PI) / 180))

const square = [
  [startLon, startLat],
  [startLon + offsetLon, startLat],
  [startLon + offsetLon, startLat + offsetLat],
  [startLon, startLat + offsetLat],
  [startLon, startLat], // close
]

console.log('TEST CASE 1: ~100x100m Square in Santiago')
const currentArea = calculatePolygonArea(square)
const planarArea = calculatePlanarArea(square)
const currentDistSide1 = calculateDistance(square[0], square[1])
const vincentyDistSide1 = vincentyDistance(square[0], square[1])

console.log(`Current Area: ${currentArea.toFixed(4)} m²`)
console.log(`Planar Area (Ref): ${planarArea.toFixed(4)} m²`)
console.log(
  `Diff Area: ${(currentArea - planarArea).toFixed(4)} m² (${(((currentArea - planarArea) / planarArea) * 100).toFixed(6)}%)`
)

console.log(`Current Dist Side 1: ${currentDistSide1.toFixed(4)} m`)
console.log(`Vincenty Dist Side 1: ${vincentyDistSide1.toFixed(4)} m`)
console.log(`Diff Dist: ${(currentDistSide1 - vincentyDistSide1).toFixed(4)} m\n`)

// Case 2: Larger Polygon (1km x 1km)
// Errors scale with size in some projections
const bigOffsetLat = 1000 / 111132
const bigOffsetLon = 1000 / (111320 * Math.cos((startLat * Math.PI) / 180))

const bigSquare = [
  [startLon, startLat],
  [startLon + bigOffsetLon, startLat],
  [startLon + bigOffsetLon, startLat + bigOffsetLat],
  [startLon, startLat + bigOffsetLat],
  [startLon, startLat],
]

console.log('TEST CASE 2: ~1km x 1km Square in Santiago')
const currentBigArea = calculatePolygonArea(bigSquare)
const planarBigArea = calculatePlanarArea(bigSquare)

console.log(`Current Area: ${currentBigArea.toFixed(4)} m²`)
console.log(`Planar Area (Ref): ${planarBigArea.toFixed(4)} m²`)
console.log(
  `Diff Area: ${(currentBigArea - planarBigArea).toFixed(4)} m² (${(((currentBigArea - planarBigArea) / planarBigArea) * 100).toFixed(6)}%)\n`
)

// Analysis of Radius Consistency
console.log('--- RADIUS CONSISTENCY CHECK ---')
// utils.ts calculatePolygonArea uses 6378137
// utils.ts calculateDistance uses 6371000
const areaRadius = 6378137
const distRadius = 6371000
console.log(`Area Radius: ${areaRadius}`)
console.log(`Dist Radius: ${distRadius}`)
console.log(`Inconsistency %: ${(Math.abs(areaRadius - distRadius) / areaRadius) * 100}%\n`)
