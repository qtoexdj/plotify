import assert from 'node:assert/strict'
import test from 'node:test'

import { assertRedacted, redact } from './redact.mjs'

test('redacts credentials and sensitive document content while preserving identifiers', () => {
  const input = {
    authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
    cookie: 'sb-access-token=secret',
    signedUrl: 'https://storage.example/object?token=secret',
    email: 'persona@example.com',
    phone: '+56 9 1234 5678',
    documentText: 'texto privado de una escritura',
    projectId: 'project-123',
    digest: `sha256:${'a'.repeat(64)}`,
    errorCode: 'TENANT_MISMATCH',
  }
  const result = redact(input)
  assert.equal(result.authorization, '[REDACTED]')
  assert.equal(result.cookie, '[REDACTED]')
  assert.equal(result.signedUrl, '[REDACTED]')
  assert.equal(result.email, '[REDACTED]')
  assert.equal(result.phone, '[REDACTED]')
  assert.equal(result.documentText, '[REDACTED]')
  assert.equal(result.projectId, input.projectId)
  assert.equal(result.digest, input.digest)
  assert.equal(result.errorCode, input.errorCode)
  assert.equal(assertRedacted(result), result)
})

test('redacts secrets embedded in otherwise safe strings', () => {
  const result = redact({
    message: 'request failed for persona@example.com with Bearer top.secret.value',
    location: 'https://example.test/file?signature=private',
  })
  assert.doesNotMatch(JSON.stringify(result), /persona@example|top\.secret|signature=private/)
})
