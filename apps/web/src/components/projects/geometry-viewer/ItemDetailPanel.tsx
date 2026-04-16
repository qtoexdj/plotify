import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tree02Icon, Road02Icon } from '@hugeicons/core-free-icons'
import type { LotDetails, ViewerFeature } from '@/types/viewer.types'
import type { LotUpdateInput } from '@/lib/validations/lot-update.schema'
import { LotInfoView } from '@/components/projects/viewer/LotInfoView'
import { LotEditForm } from '@/components/projects/viewer/LotEditForm'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { LotReservationForm } from '@/components/projects/LotReservationForm'

interface ItemDetailPanelProps {
    projectId: string
    selectedFeature: ViewerFeature
    lotDetails: LotDetails | null
    allFeatures: ViewerFeature[]
    onClose: () => void
    onUpdateLot: (id: string, data: LotUpdateInput) => Promise<boolean>
    onLotUpdated?: () => void
}

export function ItemDetailPanel({
    projectId,
    selectedFeature,
    lotDetails,
    allFeatures,
    // onClose,
    onUpdateLot,
    onLotUpdated
}: ItemDetailPanelProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [reservationMode, setReservationMode] = useState<'reservation' | 'direct_sale' | null>(null)

    if (!selectedFeature) return null

    // Determine geometry type
    const geometryType = selectedFeature.properties.geometry_type

    // ─── LOT VIEW Logic ───
    if (geometryType === 'lot' && lotDetails) {

        // Mode: EDIT
        if (isEditing) {
            return (
                <div className="space-y-4">
                    <LotEditForm
                        lotDetails={lotDetails}
                        geometry={selectedFeature.geometry}
                        onSave={async (data) => {
                            const { estado, ...updateData } = data
                            const success = await onUpdateLot(lotDetails.id, updateData)
                            if (success) setIsEditing(false)
                        }}
                        onCancel={() => setIsEditing(false)}
                    />
                </div>
            )
        }

        // Mode: INFO (READ ONLY)
        return (
            <>
                <LotInfoView
                    projectId={projectId}
                    lotDetails={lotDetails}
                    geometry={selectedFeature.geometry}
                    allFeatures={allFeatures}
                    onEditClick={() => setIsEditing(true)}
                    onOpenReservation={(mode) => setReservationMode(mode)}
                    onLotUpdated={onLotUpdated}
                />

                {/* Reservation Dialog */}
                <Dialog open={!!reservationMode} onOpenChange={(open) => !open && setReservationMode(null)}>
                    <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle>
                                {reservationMode === 'reservation' ? 'Reservar Lote' : 'Venta Directa'} - Lote {lotDetails.numero_lote}
                            </DialogTitle>
                        </DialogHeader>
                        {reservationMode && (
                            <LotReservationForm
                                projectId={projectId}
                                lotId={lotDetails.id}
                                lotNumber={lotDetails.numero_lote}
                                mode={reservationMode} // 'reservation' | 'direct_sale'
                                initialReservationValue={lotDetails.valor_reserva || 0}
                                onSuccess={() => setReservationMode(null)} // Refresh will be handled by parent/realtime
                                onCancel={() => setReservationMode(null)}
                            />
                        )}
                    </DialogContent>
                </Dialog>
            </>
        )
    }

    // ─── INFRASTRUCTURE View ───
    return (
        <div className="space-y-4">
            <div className={cn(
                "text-center p-6 rounded-xl border",
                geometryType === 'road' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-violet-500/10 border-violet-500/20'
            )}>
                <div className="flex justify-center mb-3">
                    <div className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-xl",
                        geometryType === 'road' ? 'bg-amber-500/20' : 'bg-violet-500/20'
                    )}>
                        {geometryType === 'road' ? (
                            <HugeiconsIcon icon={Road02Icon} className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                        ) : (
                            <HugeiconsIcon icon={Tree02Icon} className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                        )}
                    </div>
                </div>
                <p className="text-sm font-medium text-sidebar-foreground/70 uppercase tracking-wide">
                    {geometryType === 'road' ? 'Infraestructura' : 'Área Común'}
                </p>
                <p className="text-2xl font-bold text-sidebar-foreground mt-1">
                    {geometryType === 'road' ? 'Camino Interior' : 'Área Verde'}
                </p>
            </div>
        </div>
    )
}

// Utility for conditional classes
import { cn } from '@/lib/utils'
