import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve('.github', 'workflows', 'deploy.yml'),
  'utf8',
)
const verificationWorkflow = readFileSync(
  resolve('.github', 'workflows', 'verify-pr.yml'),
  'utf8',
)

describe('Pages manual-test workflow contract', () => {
  it('uses session-scoped workflow inputs and run names', () => {
    expect(workflow).toContain('commit_sha:')
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

  it('has no automatic Production trigger and requires an immutable input', () => {
    const modeInputStart = workflow.indexOf('manual_test_mode:')
    const modeInput = workflow.slice(modeInputStart, modeInputStart + 400)

    expect(modeInputStart).toBeGreaterThanOrEqual(0)
    expect(modeInput).toContain('default: repository')
    expect(workflow).not.toMatch(/\n\s+push:/u)
    expect(workflow).not.toContain('workflow_run:')
    expect(workflow).toMatch(/commit_sha:\s*\n[\s\S]*?required: true/u)
    expect(workflow).toContain('^[0-9a-f]{40}$')
    expect(workflow).toContain('ref: ${{ inputs.commit_sha }}')
    expect(workflow).toContain('git rev-parse HEAD')
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

  it('retains a Production Environment while documenting its external protection', () => {
    expect(workflow).toContain('environment:')
    expect(workflow).toContain('name: github-pages')
    expect(workflow).toContain('external GitHub Environment')
    expect(workflow).toContain('pages: write')
    expect(workflow).toContain('id-token: write')
  })
})

describe('non-Production staging artifact workflow contract', () => {
  it('checks out and names the artifact with the exact pull request head SHA', () => {
    expect(verificationWorkflow).toContain(
      'ref: ${{ github.event.pull_request.head.sha }}',
    )
    expect(verificationWorkflow).toContain(
      'SOURCE_COMMIT_SHA: ${{ github.event.pull_request.head.sha }}',
    )
    expect(verificationWorkflow).toContain('git rev-parse HEAD')
    expect(verificationWorkflow).toContain(
      'name: cloudflare-pages-root-${{ github.event.pull_request.head.sha }}',
    )
    expect(verificationWorkflow).toContain(
      'node scripts/write-staging-artifact-metadata.mjs',
    )
  })

  it('builds the root target with normal optional features off', () => {
    expect(verificationWorkflow).toContain('BUILD_TARGET: cloudflare-pages')
    expect(verificationWorkflow).toMatch(/BASE_PATH: \/(?:\r?\n)/u)
    expect(verificationWorkflow).toContain("VITE_PRODUCT_PHOTOS_ENABLED: 'false'")
    expect(verificationWorkflow).toContain("VITE_LIVE_REQUESTS_ENABLED: 'false'")
    expect(verificationWorkflow).toContain("VITE_MANUAL_VALIDATION_ENABLED: 'false'")
  })

  it('uses read-only permissions and cannot deploy or chain into Production', () => {
    expect(verificationWorkflow).toMatch(/permissions:\s*\n\s+contents: read/u)
    expect(verificationWorkflow).not.toContain('pull_request_target:')
    expect(verificationWorkflow).not.toContain('workflow_run:')
    expect(verificationWorkflow).not.toContain('actions/deploy-pages')
    expect(verificationWorkflow).not.toContain('cloudflare/pages-action')
    expect(verificationWorkflow).not.toContain('secrets.')
    expect(verificationWorkflow).toContain('persist-credentials: false')
  })
})
