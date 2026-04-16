
import { calculatePolygonArea, calculateDistance } from './utils';

// --- UTM Implementation (WGS84 / SIRGAS 2000) ---
// Simplified Transverse Mercator for Zone 19S (Central Chile)
// Constants for WGS84
const a = 6378137.0; // Semi-major axis
const f = 1 / 298.257223563; // Flattening
const k0 = 0.9996; // Scale factor at central meridian

function toUTM(lat: number, lon: number): { x: number, y: number, zone: number } {
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;

    const zone = Math.floor((lon + 180) / 6) + 1;
    const centralMeridian = (zone - 1) * 6 - 180 + 3;
    const lon0Rad = centralMeridian * Math.PI / 180;

    // Re-implementation using Karney/Snyder algebraic formulation which is standard
    const phi = latRad;
    const lambda = lonRad;
    const lambda0 = lon0Rad;

    const ep2 = (Math.sqrt(a * a - (a * (1 - f)) ** 2) / (a * (1 - f))) ** 2;
    const N = a / Math.sqrt(1 - (2 * f - f * f) * Math.sin(phi) ** 2);
    const T = Math.tan(phi) ** 2;
    const C = ep2 * Math.cos(phi) ** 2;
    const A_ = (lambda - lambda0) * Math.cos(phi);

    const x = k0 * N * (A_ + (1 - T + C) * A_ ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A_ ** 5 / 120) + 500000;

    const M = a * ((1 - (2 * f - f * f) / 4 - 3 * (2 * f - f * f) ** 2 / 64 - 5 * (2 * f - f * f) ** 3 / 256) * phi
        - (3 * (2 * f - f * f) / 8 + 3 * (2 * f - f * f) ** 2 / 32 + 45 * (2 * f - f * f) ** 3 / 1024) * Math.sin(2 * phi)
        + (15 * (2 * f - f * f) ** 2 / 256 + 45 * (2 * f - f * f) ** 3 / 1024) * Math.sin(4 * phi)
        - (35 * (2 * f - f * f) ** 3 / 3072) * Math.sin(6 * phi));

    const y = k0 * (M + N * Math.tan(phi) * (A_ ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A_ ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A_ ** 6 / 720));

    return { x, y: (lat < 0 ? 10000000 + y : y), zone };
}

function calculateShoelaceArea(coords: { x: number, y: number }[]): number {
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
        const j = (i + 1) % coords.length;
        area += coords[i].x * coords[j].y;
        area -= coords[j].x * coords[i].y;
    }
    return Math.abs(area / 2.0);
}

function calculatePerimeter(coords: { x: number, y: number }[]): number {
    let perim = 0;
    for (let i = 0; i < coords.length; i++) {
        const j = (i + 1) % coords.length;
        const dx = coords[j].x - coords[i].x;
        const dy = coords[j].y - coords[i].y;
        perim += Math.sqrt(dx * dx + dy * dy);
    }
    return perim;
}

// --- ANALYSIS ---

function compare(coords: number[][], name: string) {
    console.log(`\n=== Analyzing: ${name} ===`);
    console.log(`Vertex Count: ${coords.length}`);

    // 1. Geodesic (Current Plotify)
    const geoArea = calculatePolygonArea(coords);

    // Geodesic Perimeter
    let geoPerim = 0;
    for (let i = 0; i < coords.length - 1; i++) { // assume closed or handle closing
        geoPerim += calculateDistance(coords[i], coords[i + 1]);
    }
    // Check if closed
    if (calculateDistance(coords[0], coords[coords.length - 1]) > 0.01) {
        geoPerim += calculateDistance(coords[coords.length - 1], coords[0]);
    }

    // 2. UTM (Planar / SAC Reference)
    const utmCoords = coords.map(p => toUTM(p[1], p[0]));
    const utmArea = calculateShoelaceArea(utmCoords);
    const utmPerim = calculatePerimeter(utmCoords);
    const zone = utmCoords[0].zone;

    console.log(`Coordinates Sample: [${coords[0][0]}, ${coords[0][1]}] -> UTM Zone ${zone} [${utmCoords[0].x.toFixed(2)}, ${utmCoords[0].y.toFixed(2)}]`);

    // 3. Comparison
    const areaDiff = geoArea - utmArea;
    const areaDiffPct = (areaDiff / utmArea) * 100;

    const perimDiff = geoPerim - utmPerim;
    const perimDiffPct = (perimDiff / utmPerim) * 100;

    console.log(`\nCOMPARISON TABLE:`);
    console.log(`| Metric    | Geodesic (Plotify) | UTM (CAD/SAG) | Diff      | % Error |`);
    console.log(`|-----------|--------------------|---------------|-----------|---------|`);
    console.log(`| Area      | ${geoArea.toFixed(4)} m²   | ${utmArea.toFixed(4)} m²| ${areaDiff.toFixed(4)} | ${areaDiffPct.toFixed(4)}% |`);
    console.log(`| Perimeter | ${geoPerim.toFixed(4)} m      | ${utmPerim.toFixed(4)} m     | ${perimDiff.toFixed(4)} | ${perimDiffPct.toFixed(4)}% |`);

    // Diagnosis
    console.log(`\nDIAGNOSIS:`);
    if (Math.abs(areaDiffPct) > 0.1) {
        console.log(`⚠️  Significant Area Discrepancy (>0.1%). likely due to UTM Scale Factor Distortion.`);
        console.log(`    UTM projects the curved earth onto a flat cylinder. Distances are scaled by factor K.`);
        console.log(`    Center of zone K=0.9996 (-0.04% error). Edge of zone K>1.0.`);
        console.log(`    Plotify (Geodesic) is actually MORE accurate for Surface Area on the ground.`);
        console.log(`    SAG/CBR typically mandate UTM Planarian Area, effectively "forcing" the distortion error.`);
    } else {
        console.log(`✅  Discrepancy is minimal. Geodesic matches Planar within tolerance.`);
    }
}

// Case A: 100x100m Square in Santiago
const startLat = -33.45;
const startLon = -70.66;
const offsetLat = 100 / 111132;
const offsetLon = 100 / (111320 * Math.cos(startLat * Math.PI / 180));

const square = [
    [startLon, startLat],
    [startLon + offsetLon, startLat],
    [startLon + offsetLon, startLat + offsetLat],
    [startLon, startLat + offsetLat],
    [startLon, startLat]
];

// Case B: Irregular "L" Shape
const polyL = [
    [startLon, startLat],
    [startLon + offsetLon * 2, startLat],
    [startLon + offsetLon * 2, startLat + offsetLat],
    [startLon + offsetLon, startLat + offsetLat],
    [startLon + offsetLon, startLat + offsetLat * 2],
    [startLon, startLat + offsetLat * 2],
    [startLon, startLat]
];

compare(square, "Santiago 100x100m Square");
compare(polyL, "Santiago Irregular L-Shape");

