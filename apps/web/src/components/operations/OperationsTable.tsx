'use client'

import { useState } from 'react'
import {
    type ColumnDef,
    type ColumnFiltersState,
    type SortingState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { ESTADO_CONFIG } from '@/lib/models/lot.model'
import type { OperationLot } from '@/lib/services/operations.service'
import { LotInfoView } from '../projects/viewer/LotInfoView'
import { LotEditForm } from '../projects/viewer/LotEditForm'

interface OperationsTableProps {
    data: OperationLot[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LotDetailWrapper({ lot, onUpdate }: { lot: OperationLot, onUpdate: (id: string, data: any) => Promise<boolean> }) {
    const [isEditing, setIsEditing] = useState(false)

    if (isEditing) {
        return (
            <div className="space-y-4">
                <LotEditForm
                    lotDetails={lot}
                    geometry={null}
                    onSave={async (data) => {
                        const success = await onUpdate(lot.id, data)
                        if (success) setIsEditing(false)
                    }}
                    onCancel={() => setIsEditing(false)}
                />
            </div>
        )
    }

    return (
        <LotInfoView
            projectId={lot.project_id}
            lotDetails={lot}
            geometry={null}
            allFeatures={[]}
            onEditClick={() => setIsEditing(true)}
            onOpenReservation={() => { }}
        />
    )
}

export function OperationsTable({ data }: OperationsTableProps) {
    const [sorting, setSorting] = useState<SortingState>([])
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
    const [selectedLot, setSelectedLot] = useState<OperationLot | null>(null)
    const [isSheetOpen, setIsSheetOpen] = useState(false)

    const columns: ColumnDef<OperationLot>[] = [
        {
            accessorKey: 'project_name',
            header: 'Proyecto',
        },
        {
            accessorKey: 'numero_lote',
            header: 'Lote',
        },
        {
            accessorKey: 'cliente_nombre',
            header: 'Cliente',
            cell: ({ row }) => {
                const client = row.original.cliente_nombre
                const run = row.original.cliente_run
                return (
                    <div className="flex flex-col">
                        <span className="font-medium">{client || '-'}</span>
                        <span className="text-xs text-muted-foreground">{run}</span>
                    </div>
                )
            }
        },
        {
            accessorKey: 'estado',
            header: 'Estado',
            cell: ({ row }) => {
                const estado = row.original.estado
                const config = ESTADO_CONFIG[estado]
                return (
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${config?.bgClass} ${config?.textClass}`}>
                        {config?.label}
                    </span>
                )
            }
        },
        {
            accessorKey: 'etapa_proceso',
            header: 'Etapa',
            cell: ({ row }) => {
                const etapa = row.original.etapa_proceso
                if (!etapa) return <span className="text-xs text-muted-foreground">-</span>

                // Simple textual representation or mini-step mapping
                const stageLabels: Record<string, string> = {
                    'espera_firma_reserva': 'En Reserva',
                    'reserva_firmada': 'Reserva OK',
                    'espera_firma_escritura': 'A Escritura',
                    'escritura_firmada': 'Escriturado'
                }
                return <span className="text-xs font-medium">{stageLabels[etapa] || etapa}</span>
            }
        }
    ]

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        onColumnFiltersChange: setColumnFilters,
        getFilteredRowModel: getFilteredRowModel(),
        state: {
            sorting,
            columnFilters,
        },
    })

    const handleRowClick = (lot: OperationLot) => {
        setSelectedLot(lot)
        setIsSheetOpen(true)
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <Input
                    placeholder="Filtrar por proyecto..."
                    value={(table.getColumn("project_name")?.getFilterValue() as string) ?? ""}
                    onChange={(event) =>
                        table.getColumn("project_name")?.setFilterValue(event.target.value)
                    }
                    className="max-w-sm"
                />
                <Input
                    placeholder="Filtrar por cliente..."
                    value={(table.getColumn("cliente_nombre")?.getFilterValue() as string) ?? ""}
                    onChange={(event) =>
                        table.getColumn("cliente_nombre")?.setFilterValue(event.target.value)
                    }
                    className="max-w-sm"
                />
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    onClick={() => handleRowClick(row.original)}
                                    className="cursor-pointer hover:bg-muted/50"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    No hay resultados.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                >
                    Anterior
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                >
                    Siguiente
                </Button>
            </div>

            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
                    <SheetHeader className="mb-6">
                        <SheetTitle>Detalles del Lote</SheetTitle>
                    </SheetHeader>
                    {selectedLot && (
                        <LotDetailWrapper
                            lot={selectedLot}
                            onUpdate={async (id, data) => {
                                const { updateLotDetails } = await import('@/actions/lot-process.action')
                                const res = await updateLotDetails(selectedLot.project_id, id, data)
                                if (res.success) {
                                    window.location.reload()
                                }
                                if (!res.success) {
                                    console.error('Update failed:', res.error)
                                }
                                return res.success
                            }}
                        />
                    )}
                </SheetContent>
            </Sheet>
        </div>
    )
}
