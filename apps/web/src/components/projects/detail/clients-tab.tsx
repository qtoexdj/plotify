
'use client'

import { useMemo } from 'react'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserIcon } from '@hugeicons/core-free-icons'
import type { LotWithRecord } from './types'

interface ClientsTabProps {
    lots: LotWithRecord[]
}

interface Client {
    run: string
    nombre: string
    direccion: string
    telefono: string
    email: string
    lotes_comprados: number
    total_gasto: number
}

export function ClientsTab({ lots }: ClientsTabProps) {
    const clients = useMemo(() => {
        const clientsMap = new Map<string, Client>()

        lots.forEach(lot => {
            const record = lot.lot_records
            if (!record || !record.cliente_run) return

            const run = record.cliente_run
            const existing = clientsMap.get(run)

            if (existing) {
                existing.lotes_comprados += 1
                existing.total_gasto += record.valor || 0
            } else {
                clientsMap.set(run, {
                    run,
                    nombre: record.cliente_nombre || 'Sin nombre',
                    direccion: record.cliente_direccion || '—',
                    telefono: record.cliente_telefono || '—',
                    email: record.cliente_email || '—',
                    lotes_comprados: 1,
                    total_gasto: record.valor || 0
                })
            }
        })

        return Array.from(clientsMap.values())
    }, [lots])

    const currencyFormatter = new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
    })

    return (
        <Card>
            <CardHeader>
                <CardTitle>Clientes del Proyecto</CardTitle>
                <CardDescription>
                    Clientes compradores asociados a este proyecto (basado en fichas de lotes)
                </CardDescription>
            </CardHeader>
            <CardContent>
                {clients.length === 0 ? (
                    <div className="text-center py-12 text-gray-600">
                        <HugeiconsIcon icon={UserIcon} className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p>No hay clientes registrados en los lotes</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>RUN</TableHead>
                                <TableHead>Contacto</TableHead>
                                <TableHead className="text-center">Lotes</TableHead>
                                <TableHead className="text-right">Inversión Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {clients.map((client) => (
                                <TableRow key={client.run}>
                                    <TableCell className="font-medium">{client.nombre}</TableCell>
                                    <TableCell>{client.run}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col text-sm">
                                            <span>{client.email}</span>
                                            <span className="text-gray-500">{client.telefono}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="outline">{client.lotes_comprados}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {currencyFormatter.format(client.total_gasto)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
