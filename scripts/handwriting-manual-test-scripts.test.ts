import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const scriptsDirectory = dirname(fileURLToPath(import.meta.url))
const readScript = (name: string) =>
  readFileSync(join(scriptsDirectory, name), 'utf8')

describe('handwriting manual-test PowerShell scripts', () => {
  it('avoids statement keywords after return in every script', () => {
    const violations = readdirSync(scriptsDirectory)
      .filter((name) => name.endsWith('.ps1'))
      .filter((name) =>
        /\breturn\s+(?:if|foreach|switch)\b/i.test(readScript(name)),
      )

    expect(violations).toEqual([])
  })

  it('uses an explicit null check when reading a Repository Variable', () => {
    const script = readScript('start-handwriting-manual-test.ps1')

    expect(script).toContain('if ($null -ne $variable)')
    expect(script).toContain('return [string]$variable.value')
    expect(script).toContain("return ''")
  })

  it('ends PreflightOnly before every state-changing operation', () => {
    const script = readScript('start-handwriting-manual-test.ps1')
    const preflightGate = script.indexOf('if ($PreflightOnly)')

    expect(script).toContain('[switch]$PreflightOnly')
    expect(preflightGate).toBeGreaterThan(-1)
    expect(
      script.indexOf('$stateChanged = $true', preflightGate + 1),
    ).toBeGreaterThan(preflightGate)
    expect(
      script.indexOf(
        'Deploy-Worker -DiagnosticsEnabled $true',
        preflightGate + 1,
      ),
    ).toBeGreaterThan(preflightGate)
    expect(
      script
        .slice(preflightGate + 1)
        .search(
          /-Name 'VITE_HANDWRITING_DIAGNOSTICS_ENABLED' `\r?\n\s+-Value 'true'/,
        ) + preflightGate + 1,
    ).toBeGreaterThan(preflightGate)
    expect(
      script
        .slice(preflightGate + 1)
        .search(
          /-Name 'VITE_HANDWRITING_IMPORT_ENABLED' `\r?\n\s+-Value 'true'/,
        ) + preflightGate + 1,
    ).toBeGreaterThan(preflightGate)
    expect(
      script.indexOf('$pagesRunId = Start-PagesDeployment', preflightGate + 1),
    ).toBeGreaterThan(preflightGate)
  })

  it('keeps the normal enable path and the stop-script OFF path', () => {
    const startScript = readScript('start-handwriting-manual-test.ps1')
    const stopScript = readScript('stop-handwriting-manual-test.ps1')
    const pagesScript = readScript('handwriting-manual-test-pages.ps1')

    expect(startScript).toContain('MANUAL TEST IS ENABLED')
    expect(startScript).toContain('Deploy-Worker -DiagnosticsEnabled $true')
    expect(startScript).toContain(
      '$pagesRunId = Start-PagesDeployment -Repository $Repository',
    )
    expect(startScript).toContain('-ExpectedEnabled $true')
    expect(stopScript).toContain(
      "Set-RepositoryVariable -Name $variableName -Value 'false'",
    )
    expect(stopScript).toContain('Deploy-WorkerDiagnosticsOff')
    expect(stopScript).toContain(
      '$pagesRunId = Start-PagesDeployment -Repository $Repository',
    )
    expect(stopScript).toContain('-ExpectedEnabled $false')
    expect(startScript).toContain(
      ". $PagesHelpers",
    )
    expect(stopScript).toContain(
      ". $PagesHelpers",
    )
    expect(pagesScript.match(/function Start-PagesDeployment/g)).toHaveLength(1)
  })

  it('selects Pages runs without reading or parsing timestamps', () => {
    const startScript = readScript('start-handwriting-manual-test.ps1')
    const stopScript = readScript('stop-handwriting-manual-test.ps1')
    const pagesScript = readScript('handwriting-manual-test-pages.ps1')

    for (const script of [startScript, stopScript, pagesScript]) {
      expect(script).not.toMatch(/createdAt|DateTimeOffset/)
    }
    expect(pagesScript).toContain("'--json', 'databaseId'")
    expect(pagesScript).toContain(
      '$ExistingRunIds -notcontains $runId',
    )
    expect(pagesScript).not.toContain('Sort-Object')
  })

  it('verifies the public ON bundle before announcing success', () => {
    const script = readScript('start-handwriting-manual-test.ps1')
    const verification = script.indexOf('-ExpectedEnabled $true')
    const enabledMessage = script.indexOf('MANUAL TEST IS ENABLED')

    expect(verification).toBeGreaterThan(-1)
    expect(enabledMessage).toBeGreaterThan(verification)
    expect(script).toContain('Restore-SafeState')
    expect(script).toMatch(
      /catch\s*\{[\s\S]*if\s*\(\$stateChanged\)[\s\S]*Restore-SafeState/,
    )
  })

  it('prints a completed tail command with the deployed version ID', () => {
    const script = readScript('start-handwriting-manual-test.ps1')

    expect(script).toContain('--version-id $($version.version_id)')
    expect(script).not.toMatch(/--version-id\s+</)
  })
})
