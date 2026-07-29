import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STORAGE_REPAIR_REQUIRED } from '../src/app/api/projects/[id]/files/route'

const root = resolve(process.cwd())

function source(path: string) {
  try {
    return readFileSync(resolve(root, path), 'utf8')
  } catch {
    return ''
  }
}

function record(failures: string[], name: string, assertion: () => void | Promise<void>) {
  return Promise.resolve()
    .then(assertion)
    .catch((error) => {
      if (error instanceof Error) {
        failures.push(`${name}: ${error.message}`)
        return
      }
      throw error
    })
}

describe('project file gateway security contract (RED)', () => {
  it('aggregates URL auth, bounded upload and atomic-reference gaps', async () => {
    const failures: string[] = []
    const routePath = 'src/app/api/projects/[id]/files/route.ts'
    const route = source(routePath)

    await record(failures, 'loadable fail-closed route', () => {
      expect(route).toContain('export async function POST')
      expect(route).not.toContain('Project file gateway is not implemented')
    })

    await record(failures, 'legacy unscoped writer removed', () => {
      expect(source('src/app/api/uploads/project-files/route.ts')).toBe('')
    })

    await record(failures, 'session and URL resource resolve before multipart', () => {
      const authIndex = route.indexOf('session.auth.getUser')
      const multipartIndex = route.indexOf('request.formData')
      expect(authIndex).toBeGreaterThanOrEqual(0)
      expect(multipartIndex).toBeGreaterThan(authIndex)
      expect(route).toMatch(/params[\s\S]*id|projectId[\s\S]*params|params[\s\S]*projectId/)
    })

    await record(failures, 'one bounded allowlisted upload', () => {
      expect(route).toMatch(/MAX_.*SIZE|byteLimit|content-length/i)
      expect(route).toMatch(/legal|signature.evidence/i)
      expect(route).toMatch(/one|single|files?\.length\s*[!=>]+\s*1/i)
    })

    await record(failures, 'opaque response and generic foreign result', () => {
      expect(route).toMatch(/fileId/)
      expect(route).toMatch(/RESOURCE_NOT_FOUND/)
      expect(route).not.toMatch(/\b(path|storage_path)\s*:/)
    })

    await record(failures, 'metadata reference and audit converge', () => {
      expect(route).toMatch(/commit_project_file_with_reference|atomic[\s\S]*reference/i)
      expect(route).toMatch(/STORAGE_REPAIR_REQUIRED|repair_required/)
      expect(route).toMatch(/audit/i)
    })

    await record(failures, 'signature evidence freezes case and ready generation', () => {
      expect(route).toMatch(/signature.evidence/i)
      expect(route).toMatch(/case[\s\S]*generation|generation[\s\S]*case/i)
      expect(route).toMatch(/ready/)
    })

    const onboardingAndProjectSources = [
      'src/components/projects/onboarding/ProjectMediaStep.tsx',
      'src/app/(dashboard)/onboarding/new/page.tsx',
      'src/lib/services/projects.service.ts',
      'src/app/api/projects/route.ts',
      'src/app/api/projects/[id]/route.ts',
    ]
      .map(source)
      .join('\n')

    await record(failures, 'callers use fileId without best-effort path metadata', () => {
      expect(onboardingAndProjectSources).toContain('fileId')
      expect(onboardingAndProjectSources).not.toMatch(
        /ProjectLegalDocumentUploadMetadata|registerProjectLegalDocuments|storage_path|Promise\.allSettled/
      )
    })

    expect(failures, STORAGE_REPAIR_REQUIRED).toEqual([])
  })
})
