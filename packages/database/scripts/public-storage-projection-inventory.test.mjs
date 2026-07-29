import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectPublicStorageProjection } from './public-storage-projection-inventory.mjs'

test('detects signed URLs and raw Storage authority outside internal adapters', () => {
  const result = inspectPublicStorageProjection({
    files: [
      {
        path: 'apps/web/src/components/example.tsx',
        source: 'return { signedURL, storagePath }',
      },
    ],
    allowlist: [],
  })
  assert.equal(result.clean, false)
  assert.equal(result.findings[0].code, 'SIGNED_STORAGE_AUTHORITY_PROJECTED')
})

test('allows only an explicitly classified internal gateway adapter', () => {
  const result = inspectPublicStorageProjection({
    files: [
      {
        path: 'apps/web/src/app/api/files/[fileId]/route.ts',
        source: 'service.storage.from(file.bucket).download(file.objectName)',
      },
    ],
    allowlist: ['apps/web/src/app/api/files/[fileId]/route.ts'],
  })
  assert.deepEqual(result, { clean: true, findings: [] })
})
