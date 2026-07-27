import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve('.github', 'workflows', 'deploy.yml'),
  'utf8',
)

describe('Pages manual-test workflow contract', () => {
  it('uses session-scoped workflow inputs and run names', () => {
    expect(workflow).toContain('manual_test_mode:')
    expect(workflow).toContain('manual_test_session_id:')
    expect(workflow).toContain(
      "format('Deploy Pages [manual:{0}]', inputs.manual_test_session_id)",
    )
    expect(workflow).toContain(
      'REPOSITORY_HANDWRITING_IMPORT_ENABLED:',
    )
    expect(workflow).toContain(
      'REPOSITORY_HANDWRITING_DIAGNOSTICS_ENABLED:',
    )
  })

  it('defaults ordinary main and unspecified dispatches to repository mode', () => {
    const modeInputStart = workflow.indexOf('manual_test_mode:')
    const modeInput = workflow.slice(modeInputStart, modeInputStart + 400)

    expect(modeInputStart).toBeGreaterThanOrEqual(0)
    expect(modeInput).toContain('default: repository')
    expect(workflow).toContain(
      "inputs.manual_test_mode || 'repository'",
    )
    expect(workflow).toMatch(/push:\s*\n\s+branches:\s*\n\s+- main/u)
    expect(modeInput).not.toContain('default: manual-on')
  })

  it('generates and uploads the nonsecret deployment manifest', () => {
    expect(workflow).toContain(
      'node scripts/write-handwriting-deployment-state.mjs prepare',
    )
    expect(workflow).toContain(
      'node scripts/write-handwriting-deployment-state.mjs write',
    )
    expect(workflow).toContain('path: ./dist')
  })

  it('does not mutate Repository Variables or inspect a minified bundle', () => {
    expect(workflow).not.toMatch(/gh\s+variable\s+set/u)
    expect(workflow).not.toMatch(
      /grep.*assets|Select-String.*assets|handwriting.*bundle/u,
    )
  })
})
