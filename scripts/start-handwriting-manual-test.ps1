[CmdletBinding()]
param(
    [switch]$PreflightOnly
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$CliPath = Join-Path $RepoRoot 'scripts/handwriting-manual-test.mjs'

if (-not (Get-Command 'node' -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required.'
}

$commandName = if ($PreflightOnly) { 'preflight' } else { 'start' }
& node $CliPath $commandName
exit $LASTEXITCODE
