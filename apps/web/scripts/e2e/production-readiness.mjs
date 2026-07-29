#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, relative, resolve } from 'node:path'

const TARGETS = new Set(['local', 'live'])
const SCENARIOS = new Set(['all', 'six-sheets', 'avatar-boundary', 'rollout-smoke'])
const VIEWPORTS = Object.freeze([
  { id: '320x568', width: 320, height: 568, textZoom: 1 },
  { id: '375x667', width: 375, height: 667, textZoom: 1 },
  { id: '769x880', width: 769, height: 880, textZoom: 1 },
  { id: '1440x900', width: 1440, height: 900, textZoom: 1 },
  { id: '320x568-zoom-200', width: 320, height: 568, textZoom: 2 },
])
const SHEET_REGISTRY = Object.freeze([
  { id: 'operations', testId: 'sheet-operations' },
  { id: 'sidebar', testId: 'sheet-sidebar' },
  { id: 'legal-editor', testId: 'sheet-legal-editor' },
  { id: 'lots', testId: 'sheet-lots' },
  { id: 'geometry-viewer', testId: 'sheet-geometry-viewer' },
  { id: 'mesa', testId: 'sheet-mesa' },
])

function usage() {
  return [
    'Usage: production-readiness.mjs --target <local|live> --scenario <all|six-sheets|avatar-boundary|rollout-smoke> --output <directory>',
    '       [--base-url <url>] [--target-fingerprint <sha256>] [--approval-evidence <path> --deployment-manifest <path>] [--headed]',
  ].join('\n')
}

function exitWith(message, exitCode = 2) {
  process.stderr.write(`production-readiness: ${message}\n`)
  process.exitCode = exitCode
}

function parseArguments(arguments_) {
  const options = { headed: false }
  const valueOptions = new Set([
    '--target',
    '--scenario',
    '--output',
    '--base-url',
    '--target-fingerprint',
    '--approval-evidence',
    '--deployment-manifest',
  ])

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--') continue
    if (argument === '--headed') {
      options.headed = true
      continue
    }
    if (!valueOptions.has(argument)) {
      return { error: `unknown argument ${JSON.stringify(argument)}` }
    }
    const value = arguments_[index + 1]
    if (!value || value.startsWith('--')) return { error: `missing value for ${argument}` }
    options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
    index += 1
  }

  if (!TARGETS.has(options.target)) return { error: 'target must be local or live' }
  if (!SCENARIOS.has(options.scenario)) return { error: 'scenario is invalid' }
  if (!options.output) return { error: 'output is required' }
  if (options.target === 'live' && (!options.approvalEvidence || !options.deploymentManifest)) {
    return { error: 'LIVE_APPROVAL_REQUIRED' }
  }
  if (Boolean(options.approvalEvidence) !== Boolean(options.deploymentManifest)) {
    return { error: 'approval evidence and deployment manifest must be supplied together' }
  }
  return { options }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`
}

function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
}

function assertRegistry() {
  const ids = new Set(SHEET_REGISTRY.map(({ id }) => id))
  const aliases = new Set(SHEET_REGISTRY.map(({ testId }) => testId))
  if (SHEET_REGISTRY.length !== 6 || ids.size !== 6 || aliases.size !== 6) {
    throw new Error('sheet registry requires exactly six unique IDs and aliases')
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8'))
  } catch (error) {
    throw new Error(`${label} is unreadable: ${error.message}`)
  }
}

function validateLiveEvidence(options) {
  const manifest = readJson(options.deploymentManifest, 'deployment manifest')
  const approval = readJson(options.approvalEvidence, 'approval evidence')
  const manifestDigest = digest(manifest)
  const expectedTarget = options.targetFingerprint ?? manifest.targetFingerprint
  const actionSet = approval.actionSet ?? approval.actions
  if (
    approval.manifestDigest !== manifestDigest ||
    approval.targetFingerprint !== expectedTarget ||
    approval.releaseSha !== manifest.releaseSha ||
    !Array.isArray(actionSet) ||
    !actionSet.includes(options.scenario)
  ) {
    throw new Error('LIVE_APPROVAL_MISMATCH')
  }
  return { manifest, approval, manifestDigest, expectedTarget }
}

async function freePort() {
  return await new Promise((accept, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => (error ? reject(error) : accept(port)))
    })
  })
}

async function waitForUrl(url, child) {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) throw new Error('local web server exited before readiness')
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status === 200) return
    } catch {
      // The server has not bound the port yet.
    }
    await new Promise((accept) => setTimeout(accept, 250))
  }
  throw new Error(`local web server did not become ready: ${url}`)
}

async function startLocalServer(output) {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const logPath = resolve(output, 'server.log')
  mkdirSync(dirname(logPath), { recursive: true })
  writeFileSync(logPath, '', { mode: 0o600 })
  const nextBin = resolve('node_modules/next/dist/bin/next')
  const child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PLOTIFY_E2E_FIXTURES: '1',
      PLOTIFY_E2E_DIST_DIR: '.next-e2e',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const append = (chunk) => {
    const redacted = String(chunk)
      .replace(/(authorization|cookie|token|secret)=?[^\s]*/gi, '$1=[REDACTED]')
      .slice(0, 20_000)
    writeFileSync(logPath, redacted, { flag: 'a' })
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  await waitForUrl(`${baseUrl}/e2e/sheets`, child)
  return { baseUrl, child, logPath }
}

async function liveSnapshot(baseUrl) {
  const response = await fetch(`${baseUrl}/api/health`, { redirect: 'error' })
  const body = await response.text()
  return digest({ status: response.status, body })
}

function safeNetworkUrl(value) {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return '[invalid-url]'
  }
}

async function runSixSheets({ baseUrl, headed, output, network }) {
  const [{ chromium }, { default: AxeBuilder }] = await Promise.all([
    import('playwright'),
    import('@axe-core/playwright'),
  ])
  const browser = await chromium.launch({ headless: !headed })
  const results = []
  const failures = []

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      const consoleErrors = []
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
          consoleErrors.push({ type: message.type(), text: message.text().slice(0, 500) })
        }
      })
      page.on('pageerror', (error) => {
        consoleErrors.push({ type: 'pageerror', text: error.message.slice(0, 500) })
      })
      page.on('response', (response) => {
        if (response.status() >= 400) {
          network.requests.push({
            method: response.request().method(),
            url: safeNetworkUrl(response.url()),
            status: response.status(),
          })
        }
      })

      await page.goto(`${baseUrl}/e2e/sheets`, { waitUntil: 'networkidle' })
      if (viewport.textZoom === 2) {
        await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
      }

      for (const sheet of SHEET_REGISTRY) {
        const trigger = page.getByTestId(`open-sheet-${sheet.id}`)
        await trigger.click()
        const panel = page.getByTestId(sheet.testId)
        try {
          await panel.waitFor({ state: 'visible', timeout: 10_000 })
          // Radix marks the dialog visible before its CSS entrance transform settles.
          // Measure the final geometry, not an in-flight animation frame.
          await page.waitForTimeout(250)
        } catch {
          await page.screenshot({
            path: resolve(output, `debug-${viewport.id}-${sheet.id}.png`),
            fullPage: true,
          })
          const bodyText = (await page.locator('body').innerText()).slice(0, 500)
          const active = await page.getByTestId('active-sheet').textContent()
          throw new Error(
            `sheet ${sheet.id} did not open at ${viewport.id}; active=${active}; console=${JSON.stringify(consoleErrors)}; page=${JSON.stringify(bodyText)}`
          )
        }
        const box = await panel.boundingBox()
        const bodies = panel.locator('[data-slot="sheet-body"]')
        const title = panel.locator('[data-slot="sheet-title"]')
        const description = panel.locator('[data-slot="sheet-description"]')
        const bodyMetrics = await bodies.evaluate((element) => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          overflowY: getComputedStyle(element).overflowY,
        }))
        const bodyCount = await bodies.count()
        const titleText = await title.textContent()
        const titleCount = await title.count()
        const descriptionText = await description.textContent()
        const descriptionCount = await description.count()
        const controls = await panel
          .locator('button, input, [role="button"]')
          .evaluateAll((elements) =>
            elements.map((element) => {
              const rectangle = element.getBoundingClientRect()
              return {
                name:
                  element.getAttribute('aria-label') ||
                  element.textContent?.trim().slice(0, 80) ||
                  element.tagName,
                width: rectangle.width,
                height: rectangle.height,
                compact:
                  element.getAttribute('data-compact-nontouch') === 'documented-spaced-exception',
              }
            })
          )
        const smallTargets = controls.filter((control) =>
          control.compact
            ? control.width < 24 || control.height < 24
            : control.width < 44 || control.height < 44
        )
        const axe = await new AxeBuilder({ page })
          .include(`[data-testid="${sheet.testId}"]`)
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
        const seriousAxe = axe.violations
          .filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))
          .map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            helpUrl: violation.helpUrl,
            targets: violation.nodes.map((node) => node.target),
          }))

        await page.keyboard.press('Tab')
        const focusInside = await panel.evaluate((element) =>
          element.contains(document.activeElement)
        )
        const screenshotName = `${viewport.id}-${sheet.id}.png`
        await page.screenshot({
          path: resolve(output, 'screenshots', screenshotName),
          fullPage: false,
        })
        if (viewport.id === '320x568' && sheet.id === 'operations') {
          await page.screenshot({ path: resolve(output, 'probe.png'), fullPage: false })
        }
        await page.keyboard.press('Escape')
        await panel.waitFor({ state: 'detached' })
        const focusRestored = await trigger.evaluate(async (element) => {
          for (let attempt = 0; attempt < 20; attempt += 1) {
            if (element === document.activeElement) return true
            await new Promise((accept) => setTimeout(accept, 25))
          }
          return false
        })

        const assertions = {
          viewport:
            Boolean(box) &&
            box.x >= -1 &&
            box.y >= -1 &&
            box.x + box.width <= viewport.width + 1 &&
            box.y + box.height <= viewport.height + 1,
          oneScrollBody: bodyCount === 1,
          scrollable:
            bodyMetrics.scrollHeight > bodyMetrics.clientHeight &&
            ['auto', 'scroll'].includes(bodyMetrics.overflowY),
          title: titleCount === 1 && Boolean(titleText),
          description: descriptionCount === 1 && Boolean(descriptionText),
          targets: smallTargets.length === 0,
          focusInside,
          focusRestored,
          axe: seriousAxe.length === 0,
        }
        const failed = Object.entries(assertions)
          .filter(([, passed]) => !passed)
          .map(([name]) => name)
        if (failed.length > 0) {
          failures.push({
            code: 'viewport',
            sheet: sheet.id,
            viewport: viewport.id,
            failed,
            smallTargets,
            seriousAxe,
          })
        }
        results.push({
          sheet: sheet.id,
          viewport: viewport.id,
          assertions,
          screenshot: `screenshots/${screenshotName}`,
          axeCriticalSerious: seriousAxe,
        })
      }

      if (consoleErrors.length > 0) {
        failures.push({ code: 'console', viewport: viewport.id, entries: consoleErrors })
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }

  return { results, failures }
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2))
  if (parsed.error) {
    const prefix = parsed.error === 'LIVE_APPROVAL_REQUIRED' ? 'AssertionError: ' : ''
    exitWith(`${prefix}${parsed.error}\n${usage()}`)
    return
  }

  const { options } = parsed
  assertRegistry()
  const output = resolve(process.env.INIT_CWD ?? process.cwd(), options.output)
  mkdirSync(resolve(output, 'screenshots'), { recursive: true })
  const startedAt = new Date().toISOString()
  const livePre = options.target === 'live' ? validateLiveEvidence(options) : null
  let server = null
  let baseUrl = options.baseUrl
  if (!baseUrl && options.target === 'local') {
    server = await startLocalServer(output)
    baseUrl = server.baseUrl
  }
  if (!baseUrl) throw new Error('base URL is required for live runs')

  const network = {
    schemaVersion: 1,
    target: options.target,
    scenario: options.scenario,
    redacted: true,
    requests: [],
    manifestPre: livePre?.manifestDigest ?? null,
    attestationPre: livePre ? await liveSnapshot(baseUrl) : null,
    manifestPost: null,
    attestationPost: null,
  }
  const failures = []
  const checks = []

  try {
    if (options.scenario === 'all' || options.scenario === 'six-sheets') {
      const sixSheets = await runSixSheets({
        baseUrl,
        headed: options.headed,
        output,
        network,
      })
      checks.push({ id: 'six-sheets', results: sixSheets.results })
      failures.push(...sixSheets.failures)
    }

    if (options.scenario === 'all' || options.scenario === 'avatar-boundary') {
      checks.push({
        id: 'avatar-boundary',
        status: options.target === 'local' ? 'covered-by-web-security-suite' : 'approval-bound',
      })
    }
    if (options.scenario === 'all' || options.scenario === 'rollout-smoke') {
      checks.push({
        id: 'rollout-smoke',
        status: options.target === 'local' ? 'non-mutating-local' : 'approval-bound',
      })
    }

    if (livePre) {
      const livePost = validateLiveEvidence(options)
      network.manifestPost = livePost.manifestDigest
      network.attestationPost = await liveSnapshot(baseUrl)
      if (
        network.manifestPre !== network.manifestPost ||
        network.attestationPre !== network.attestationPost
      ) {
        failures.push({ code: 'LIVE_TARGET_DRIFT' })
      }
    }
  } finally {
    if (server?.child) {
      server.child.kill('SIGTERM')
      await new Promise((accept) => {
        const timer = setTimeout(accept, 3_000)
        server.child.once('exit', () => {
          clearTimeout(timer)
          accept()
        })
      })
    }
  }

  const report = {
    schemaVersion: 1,
    target: options.target,
    scenario: options.scenario,
    startedAt,
    finishedAt: new Date().toISOString(),
    targetFingerprint:
      options.targetFingerprint ?? livePre?.expectedTarget ?? digest({ target: 'local' }),
    registry: SHEET_REGISTRY,
    viewports: VIEWPORTS,
    redacted: true,
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    checks,
    failures,
    artifacts: {
      probe: 'probe.png',
      network: 'network.json',
      serverLog: server?.logPath ? relative(output, server.logPath) : null,
    },
  }
  atomicJson(resolve(output, 'network.json'), network)
  atomicJson(resolve(output, 'report.json'), report)
  if (failures.length > 0) {
    exitWith(`AssertionError: viewport matrix failed (${failures.length} findings)`, 1)
  } else {
    process.stdout.write(
      `production-readiness: PASS ${checks.length} checks, ${VIEWPORTS.length} viewports, ${SHEET_REGISTRY.length} sheets\n`
    )
  }
}

main().catch((error) => {
  exitWith(error instanceof Error ? error.message : String(error), 1)
})

export { SHEET_REGISTRY, VIEWPORTS, digest, parseArguments }
