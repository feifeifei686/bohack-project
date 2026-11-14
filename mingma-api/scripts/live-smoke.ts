import { createApp } from '../src/app.ts'
import { readConfig } from '../src/config.ts'
import { successSchema, type Operation } from '../src/schemas.ts'
import { readFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import assert from 'node:assert/strict'

const config = readConfig()
if (!config.apiKey || config.apiKey === 'simulation-only' || config.baseUrl !== 'https://api.deepseek.com') {
  throw new Error('Live smoke requires the official DeepSeek provider and a configured local key')
}
// Only the four synthetic examples are sent. No document or environment file is uploaded.
const app = createApp({ ...config, host: '127.0.0.1' })
await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
const report: unknown[] = []
try {
  for (const operation of ['clarify', 'requirements', 'review', 'explain'] as Operation[]) {
    const body = await readFile(new URL(`../examples/${operation}.json`, import.meta.url), 'utf8')
    const response = await fetch(`${base}/api/ai/${operation}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}) },
      body, signal: AbortSignal.timeout(config.timeoutMs + 5000),
    })
    const value = await response.json()
    if (!response.ok) {
      report.push({ operation, status: response.status, code: value.error?.code, requestId: value.requestId })
      process.exitCode = 1
      break
    }
    const parsed = successSchema(operation).safeParse(value)
    if (!parsed.success) { report.push({ operation, status: response.status, schemaPassed: false }); process.exitCode = 1; break }
    let caseChecks: Record<string, unknown> = {}
    if (operation === 'requirements') {
      assert.ok(value.data.requirements.some((item: { origin: string }) => item.origin === 'user'))
      assert.ok(value.data.requirements.every((item: { room: string }) => item.room === '厨房'))
      caseChecks = { requirementCount: value.data.requirements.length, userEvidencePresent: true, roomMatches: true }
    } else if (operation === 'review') {
      const statuses = Object.fromEntries(value.data.findings.map((item: { requirementId: string; status: string }) => [item.requirementId, item.status]))
      assert.equal(statuses.K02, 'partial', 'The sample dishwasher plan omits supply/drainage/power explanations')
      assert.equal(statuses.K05, 'responded', 'The sample explicitly responds to closed storage')
      const submitted = JSON.parse(body)
      for (const item of submitted.requirements) for (const pending of item.pending) assert.ok(value.data.siteChecks.includes(pending))
      caseChecks = { findingStatuses: statuses, inputPendingPreserved: true }
    } else if (operation === 'explain') {
      assert.ok(value.data.explanations.some((item: { questions: string[] }) => item.questions.length > 0))
      caseChecks = { explanationCount: value.data.explanations.length, followUpQuestionsPresent: true }
    } else {
      caseChecks = { factCount: value.data.facts.length, questionCount: value.data.questions.length, readyForDraft: value.data.readyForDraft }
    }
    report.push({ operation, status: response.status, schemaPassed: true, caseChecks, requiresHumanConfirmation: value.meta.requiresHumanConfirmation, model: value.meta.model, usage: value.meta.usage, durationMs: value.meta.durationMs, warningsCount: value.data.warnings.length })
  }
} catch (error) {
  report.push({ error: error instanceof Error ? error.name : 'UnknownError', message: 'Smoke test stopped; request details omitted' })
  process.exitCode = 1
} finally {
  app.closeAllConnections()
  await new Promise<void>(resolve => app.close(() => resolve()))
  process.stdout.write(JSON.stringify({ mode: 'live', at: new Date().toISOString(), results: report }, null, 2) + '\n')
}
