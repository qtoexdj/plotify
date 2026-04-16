
import { describe, it, expect } from 'vitest'
import { getBoundariesWithNeighbors } from '@/lib/geometry/utils'

describe('Lote 24 Regression Test - Contract V4', () => {
    it('should assign is_partial: true for the fused segment with neighbor 11', () => {
        const degFactor = 111132

        // Lote objetivo (cara izquierda fragmentada en 2 tramos colineales)
        const targetCoords = [
            [0, 0],
            [0.0001, 0],
            [0.0001, -35.9 / degFactor],
            [0, -35.9 / degFactor],
            [0, -30.3 / degFactor], // punto de quiebre CAD
            [0, 0]
        ]

        // Lote Vecino 11 (A la izquierda, cara de 50 metros)
        const neighbor11 = {
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [-0.0000001, 10 / degFactor],
                    [-0.0000001, -40 / degFactor],
                    [-0.001, -40 / degFactor],
                    [-0.001, 10 / degFactor],
                    [-0.0000001, 10 / degFactor]
                ]]
            },
            properties: {
                geometry_type: 'lot',
                lot_id: '11',
                numero_lote: '11'
            }
        }

        const result = getBoundariesWithNeighbors(targetCoords, [neighbor11], 'target')
        const poniente = result.find(r => r.direction === 'Poniente')

        expect(poniente).toBeDefined()
        // La distancia debe ser ~35.9m
        expect(poniente!.distance).toBeGreaterThan(35)

        // Verificación de METADATA estructurada
        expect(poniente!.neighbors).toHaveLength(1)
        expect(poniente!.neighbors[0].name).toBe('lote 11')
        expect(poniente!.neighbors[0].is_partial).toBe(true) // 35.9m < 50m - 0.5m
    })

    it('should assign is_partial: false when the shared length is the total neighbor edge', () => {
        const degFactor = 111132

        // Lote objetivo (Cara de 10m)
        const targetCoords = [
            [0, 0],
            [0.0001, 0],
            [0.0001, -10 / degFactor],
            [0, -10 / degFactor],
            [0, 0]
        ]

        // Lote Vecino (Cara de 10.2m -> Diferencia 0.2m < 0.5m)
        const neighbor = {
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [-0.0000001, 0.1 / degFactor],
                    [-0.0000001, -10.1 / degFactor],
                    [-0.001, -10.1 / degFactor],
                    [-0.001, 0.1 / degFactor],
                    [-0.0000001, 0.1 / degFactor]
                ]]
            },
            properties: {
                geometry_type: 'lot',
                lot_id: '99',
                numero_lote: '99'
            }
        }

        const result = getBoundariesWithNeighbors(targetCoords, [neighbor], 'target')
        const poniente = result.find(r => r.direction === 'Poniente')

        expect(poniente!.neighbors[0].is_partial).toBe(false)
    })
})
