import { describe, expect, it } from 'vitest'
import { createProjectSchema, projectPatchSchema } from '@/lib/validations/project.schema'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const valid = { name: 'Proyecto', region: 'RM', comuna: 'Paine', total_lotes: 4 }

describe('atomic project boundary', () => {
  it.each([0, -1, 1.5, 101])('rejects invalid lot count %s', (total_lotes) => {
    const parsed = createProjectSchema.safeParse({ ...valid, total_lotes })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain('PROJECT_LOT_COUNT_LIMIT')
  })

  it('accepts integer boundaries and rejects protected PATCH fields', () => {
    expect(createProjectSchema.safeParse({ ...valid, total_lotes: 1 }).success).toBe(true)
    expect(createProjectSchema.safeParse({ ...valid, total_lotes: 100 }).success).toBe(true)
    expect(projectPatchSchema.safeParse({ name: 'Nuevo' }).success).toBe(true)
    expect(projectPatchSchema.safeParse({ organization_id: crypto.randomUUID() }).success).toBe(
      false
    )
    expect(projectPatchSchema.safeParse({ total_lotes: 2 }).success).toBe(false)
  })

  it('uses the atomic RPC and contains no delete rollback', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/services/projects.service.ts'), 'utf8')
    const createProjectBody = source.slice(
      source.indexOf('export async function createProject('),
      source.indexOf('export async function deleteProject(')
    )
    expect(createProjectBody).toContain("rpc('create_project_with_lots'")
    expect(createProjectBody).not.toContain("from('projects').delete")
  })
})
