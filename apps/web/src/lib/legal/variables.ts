export interface LegalVariable {
  key: string
  label: string
  value: string | null
  source: 'project_legal_data' | 'geometry' | 'database' | 'manual'
  required: boolean
}

// Función de utilidad requerida por el test T061 para filtrar variables requeridas pendientes
export function filterPendingLegalVariables(variables: LegalVariable[]): LegalVariable[] {
  return variables.filter((v) => v.required && (v.value === null || v.value === ''))
}
