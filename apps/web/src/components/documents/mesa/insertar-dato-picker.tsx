'use client'

import { AtSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type { InsertableVariable, VariableTokenJson } from '@/lib/documents/matriz-types'

/**
 * Picker "Insertar dato" (SDD 010 T015, FR-009, research D6): buscador con
 * nombres humanos del catálogo agrupado por categoría, sobre las
 * `insertable_variables` que llegan embebidas en la respuesta del caso.
 * Operable por botón y por el atajo `@` dentro del editor; la inserción
 * crea un dato ligado al expediente con la etiqueta del catálogo.
 */

export type GrupoInsertable = {
  categoria: string
  categoriaLabel: string
  variables: InsertableVariable[]
}

/** Agrupa el catálogo por categoría conservando el orden del servidor. */
export function insertablesAgrupados(variables: InsertableVariable[]): GrupoInsertable[] {
  const grupos: GrupoInsertable[] = []
  const porCategoria = new Map<string, GrupoInsertable>()
  for (const variable of variables) {
    let grupo = porCategoria.get(variable.category)
    if (!grupo) {
      grupo = {
        categoria: variable.category,
        categoriaLabel: variable.category_label || MESA_TEXT.categoriaSinNombre,
        variables: [],
      }
      porCategoria.set(variable.category, grupo)
      grupos.push(grupo)
    }
    grupo.variables.push(variable)
  }
  return grupos
}

/** Atributos del nodo de dato insertado: clave + etiqueta del catálogo. */
export function atributosDeDato(variable: InsertableVariable): VariableTokenJson['attrs'] {
  return { variableKey: variable.key, label: variable.label, format: null }
}

type InsertarDatoPickerProps = {
  variables: InsertableVariable[]
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  onInsertar: (variable: InsertableVariable) => void
}

export function InsertarDatoPicker({
  variables,
  abierto,
  onAbiertoChange,
  onInsertar,
}: InsertarDatoPickerProps) {
  const grupos = insertablesAgrupados(variables)
  if (grupos.length === 0) return null

  return (
    <Popover open={abierto} onOpenChange={onAbiertoChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <AtSign />
          {MESA_TEXT.insertarDato}
        </Button>
      </PopoverTrigger>
      <PopoverContent data-testid="insertar-dato-picker" align="end" className="w-80 p-0 font-sans">
        <Command>
          <CommandInput placeholder={MESA_TEXT.buscarDato} />
          <CommandList>
            <CommandEmpty>{MESA_TEXT.sinResultadosDatos}</CommandEmpty>
            {grupos.map((grupo) => (
              <CommandGroup key={grupo.categoria} heading={grupo.categoriaLabel}>
                {grupo.variables.map((variable) => (
                  <CommandItem
                    key={variable.key}
                    value={`${variable.label} ${grupo.categoriaLabel}`}
                    onSelect={() => {
                      onInsertar(variable)
                      onAbiertoChange(false)
                    }}
                  >
                    {variable.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
