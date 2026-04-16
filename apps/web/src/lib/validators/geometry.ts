import { z } from 'zod'

export const geometryUploadSchema = z.object({
    file: z.custom<File>((v) => v instanceof File || (typeof v === 'object' && v !== null && 'arrayBuffer' in v), {
        message: "Archivo requerido",
    })
        .refine(
            (file) => /\.(kmz|kml)$/i.test(file.name),
            {
                message: "Solo se aceptan archivos .kmz o .kml"
            }
        ),
    projectId: z.string().uuid("ID de proyecto inválido"),
})

export type GeometryUploadInput = z.infer<typeof geometryUploadSchema>
