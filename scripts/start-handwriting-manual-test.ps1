[CmdletBinding()]
param(
    [switch]$PreflightOnly
)

$ErrorActionPreference = 'Stop'
$Repository = 'takami0928/otsukai'
$AllowedOrigin = 'https://takami0928.github.io'
$ExpectedHostname = 'takami0928.github.io'
$WorkerName = 'otsukai-handwriting-import'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$WorkerConfig = Join-Path $RepoRoot 'worker/wrangler.toml'
$StopCommand =
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-handwriting-manual-test.ps1'
$stateChanged = $false

Set-Location $RepoRoot

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
}

function Get-CheckedOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $output = & $Command @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
    return ($output | Out-String).Trim()
}

function Get-RepositoryVariables {
    $json = Get-CheckedOutput -Command 'gh' -Arguments @(
        'variable', 'list', '--repo', $Repository, '--json', 'name,value'
    )
    return @($json | ConvertFrom-Json)
}

function Get-VariableValue {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Variables,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $variable = $Variables |
        Where-Object { $_.name -eq $Name } |
        Select-Object -First 1

    if ($null -ne $variable) {
        return [string]$variable.value
    }

    return ''
}

function Set-RepositoryVariable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    Invoke-Checked -Command 'gh' -Arguments @(
        'variable', 'set', $Name, '--body', $Value, '--repo', $Repository
    )
}

function Deploy-Worker {
    param([Parameter(Mandatory = $true)][bool]$DiagnosticsEnabled)

    $diagnosticValue = if ($DiagnosticsEnabled) { 'true' } else { 'false' }
    Invoke-Checked -Command 'npx.cmd' -Arguments @(
        'wrangler', 'deploy',
        '--config', $WorkerConfig,
        '--var', "ALLOWED_ORIGINS:$AllowedOrigin",
        '--var', "DIAGNOSTIC_MODE:$diagnosticValue",
        '--strict'
    )
}

function Start-PagesDeployment {
    $existingRunsJson = Get-CheckedOutput -Command 'gh' -Arguments @(
        'run', 'list',
        '--workflow', 'deploy.yml',
        '--branch', 'main',
        '--event', 'workflow_dispatch',
        '--limit', '20',
        '--repo', $Repository,
        '--json', 'databaseId'
    )
    $existingRunIds = @(
        @($existingRunsJson | ConvertFrom-Json) |
            ForEach-Object { [string]$_.databaseId }
    )
    $dispatchedAt = [DateTimeOffset]::UtcNow.AddMinutes(-1)
    Invoke-Checked -Command 'gh' -Arguments @(
        'workflow', 'run', 'deploy.yml',
        '--ref', 'main',
        '--repo', $Repository
    )

    $runId = $null
    for ($attempt = 0; $attempt -lt 30 -and -not $runId; $attempt += 1) {
        Start-Sleep -Seconds 2
        $runsJson = Get-CheckedOutput -Command 'gh' -Arguments @(
            'run', 'list',
            '--workflow', 'deploy.yml',
            '--branch', 'main',
            '--event', 'workflow_dispatch',
            '--limit', '10',
            '--repo', $Repository,
            '--json', 'databaseId,createdAt'
        )
        $run = @($runsJson | ConvertFrom-Json) |
            Where-Object {
                $existingRunIds -notcontains [string]$_.databaseId -and
                [DateTimeOffset]::Parse($_.createdAt) -ge $dispatchedAt
            } |
            Sort-Object {
                [DateTimeOffset]::Parse($_.createdAt)
            } -Descending |
            Select-Object -First 1
        if ($run) {
            $runId = [string]$run.databaseId
        }
    }
    if (-not $runId) {
        throw 'Could not determine the dispatched GitHub Pages run ID.'
    }
    Invoke-Checked -Command 'gh' -Arguments @(
        'run', 'watch', $runId,
        '--repo', $Repository,
        '--exit-status'
    )
    $runJson = Get-CheckedOutput -Command 'gh' -Arguments @(
        'run', 'view', $runId,
        '--repo', $Repository,
        '--json', 'status,conclusion,url'
    )
    $run = $runJson | ConvertFrom-Json
    if ($run.status -ne 'completed' -or $run.conclusion -ne 'success') {
        throw "GitHub Pages run $runId did not succeed."
    }
    return $runId
}

function Restore-SafeState {
    Write-Warning 'Attempting to restore the public feature flags and Worker diagnostics to OFF.'
    foreach ($variableName in @(
        'VITE_HANDWRITING_IMPORT_ENABLED',
        'VITE_HANDWRITING_DIAGNOSTICS_ENABLED'
    )) {
        try {
            Set-RepositoryVariable -Name $variableName -Value 'false'
        }
        catch {
            Write-Warning (
                "Could not restore $variableName to false: " +
                $_.Exception.Message
            )
        }
    }
    try {
        $null = Start-PagesDeployment
    }
    catch {
        Write-Warning "Pages rollback did not complete: $($_.Exception.Message)"
    }
    try {
        Deploy-Worker -DiagnosticsEnabled $false
    }
    catch {
        Write-Warning "Worker diagnostic rollback did not complete: $($_.Exception.Message)"
    }
    Write-Warning "Run this recovery command if needed: $StopCommand"
}

try {
    foreach ($command in @('git', 'gh', 'npx.cmd')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Required command is unavailable: $command"
        }
    }
    if (-not (Test-Path -LiteralPath $WorkerConfig)) {
        throw "Worker configuration is missing: $WorkerConfig"
    }
    if ((Get-CheckedOutput -Command 'git' -Arguments @(
        'branch', '--show-current'
    )) -ne 'main') {
        throw 'Run the manual test only from main.'
    }
    if (Get-CheckedOutput -Command 'git' -Arguments @(
        'status', '--porcelain'
    )) {
        throw 'The working tree must be clean.'
    }
    Invoke-Checked -Command 'git' -Arguments @('fetch', 'origin', 'main')
    $headSha = Get-CheckedOutput -Command 'git' -Arguments @(
        'rev-parse', 'HEAD'
    )
    $originMainSha = Get-CheckedOutput -Command 'git' -Arguments @(
        'rev-parse', 'origin/main'
    )
    if ($headSha -ne $originMainSha) {
        throw 'Local main is not the latest origin/main.'
    }

    Invoke-Checked -Command 'gh' -Arguments @('auth', 'status')
    Write-Host 'Cloudflare account:'
    Invoke-Checked -Command 'npx.cmd' -Arguments @('wrangler', 'whoami')

    $configText = Get-Content -Raw -LiteralPath $WorkerConfig
    $workerNameMatch = [regex]::Match(
        $configText,
        '(?m)^\s*name\s*=\s*"([^"]+)"\s*$'
    )
    $originMatch = [regex]::Match(
        $configText,
        '(?m)^\s*ALLOWED_ORIGINS\s*=\s*"([^"]+)"\s*$'
    )
    if (
        -not $workerNameMatch.Success -or
        $workerNameMatch.Groups[1].Value -ne $WorkerName
    ) {
        throw "Unexpected Worker name. Expected: $WorkerName"
    }
    if (
        -not $originMatch.Success -or
        $originMatch.Groups[1].Value -ne $AllowedOrigin
    ) {
        throw "ALLOWED_ORIGINS must be exactly $AllowedOrigin"
    }

    $currentDeploymentJson = Get-CheckedOutput -Command 'npx.cmd' -Arguments @(
        'wrangler', 'deployments', 'status',
        '--config', $WorkerConfig,
        '--json'
    )
    $currentDeployment = $currentDeploymentJson | ConvertFrom-Json
    $currentVersion = @($currentDeployment.versions) |
        Where-Object { $_.percentage -eq 100 } |
        Select-Object -First 1
    if (-not $currentDeployment.id -or -not $currentVersion) {
        throw "Existing Worker deployment was not found: $WorkerName"
    }

    $secretJson = Get-CheckedOutput -Command 'npx.cmd' -Arguments @(
        'wrangler', 'secret', 'list', '--config', $WorkerConfig
    )
    $secretNames = @(
        ($secretJson | ConvertFrom-Json) |
            ForEach-Object { [string]$_.name }
    )
    foreach ($requiredSecret in @(
        'GEMINI_API_KEY',
        'TURNSTILE_SECRET_KEY'
    )) {
        if ($secretNames -notcontains $requiredSecret) {
            throw "Required Worker Secret is missing: $requiredSecret"
        }
    }

    $variables = Get-RepositoryVariables
    foreach ($requiredVariable in @(
        'VITE_HANDWRITING_IMPORT_ENDPOINT',
        'VITE_TURNSTILE_SITE_KEY'
    )) {
        if (
            [string]::IsNullOrWhiteSpace(
                (Get-VariableValue -Variables $variables -Name $requiredVariable)
            )
        ) {
            throw "Required Repository Variable is missing: $requiredVariable"
        }
    }
    if (
        (Get-VariableValue `
            -Variables $variables `
            -Name 'VITE_HANDWRITING_IMPORT_ENABLED') -ne 'false'
    ) {
        throw 'VITE_HANDWRITING_IMPORT_ENABLED must be false before starting.'
    }
    $diagnosticsVariable = Get-VariableValue `
        -Variables $variables `
        -Name 'VITE_HANDWRITING_DIAGNOSTICS_ENABLED'
    if (
        -not [string]::IsNullOrWhiteSpace($diagnosticsVariable) -and
        $diagnosticsVariable -ne 'false'
    ) {
        throw (
            'VITE_HANDWRITING_DIAGNOSTICS_ENABLED must be false ' +
            'before starting.'
        )
    }

    $widgetJson = Get-CheckedOutput -Command 'npx.cmd' -Arguments @(
        'wrangler', 'turnstile', 'widget', 'list', '--json'
    )
    $widgets = @($widgetJson | ConvertFrom-Json)
    $widget = $widgets |
        Where-Object { $_.name -eq $WorkerName } |
        Select-Object -First 1
    if (-not $widget) {
        throw "Turnstile widget was not found: $WorkerName"
    }
    $domains = @($widget.domains)
    if (
        $domains.Count -ne 1 -or
        $domains[0] -ne $ExpectedHostname
    ) {
        throw "Turnstile hostname must be exactly $ExpectedHostname"
    }

    Write-Host "Worker: $WorkerName"
    Write-Host "Current Worker deployment ID: $($currentDeployment.id)"
    Write-Host "Current Worker version: $($currentVersion.version_id)"
    Write-Host "Origin: $AllowedOrigin"
    Write-Host "Turnstile hostname: $ExpectedHostname"
    Write-Host 'Worker Secrets: required names are present (values not read).'

    if ($PreflightOnly) {
        Write-Host ''
        Write-Host 'MANUAL TEST PREFLIGHT PASSED' -ForegroundColor Green
        Write-Host 'No Worker, Repository Variable, or Pages state was changed.'
        return
    }

    $stateChanged = $true
    Deploy-Worker -DiagnosticsEnabled $true
    $deploymentJson = Get-CheckedOutput -Command 'npx.cmd' -Arguments @(
        'wrangler', 'deployments', 'status',
        '--config', $WorkerConfig,
        '--json'
    )
    $deployment = $deploymentJson | ConvertFrom-Json
    $version = @($deployment.versions) |
        Where-Object { $_.percentage -eq 100 } |
        Select-Object -First 1
    if (-not $version) {
        throw 'A 100% Worker version was not found after deployment.'
    }

    Set-RepositoryVariable `
        -Name 'VITE_HANDWRITING_DIAGNOSTICS_ENABLED' `
        -Value 'true'
    Set-RepositoryVariable `
        -Name 'VITE_HANDWRITING_IMPORT_ENABLED' `
        -Value 'true'
    $pagesRunId = Start-PagesDeployment

    $manualUrl =
        'https://takami0928.github.io/otsukai/?handwritingDiagnostics=1#/create'
    $tailCommand =
        "npx.cmd wrangler tail $WorkerName --config worker/wrangler.toml --format pretty --method POST --version-id $($version.version_id)"

    Write-Host ''
    Write-Host 'MANUAL TEST IS ENABLED' -ForegroundColor Yellow
    Write-Host "Worker deployment ID: $($deployment.id)"
    Write-Host "Worker version: $($version.version_id)"
    Write-Host "Pages run: $pagesRunId"
    Write-Host "Manual verification URL: $manualUrl"
    Write-Host ''
    Write-Host 'Start Worker tail in a separate terminal:'
    Write-Host $tailCommand -ForegroundColor Cyan
    Write-Host ''
    Write-Host 'MANDATORY OFF RESTORE COMMAND:' -ForegroundColor Red
    Write-Host $StopCommand -ForegroundColor Red
}
catch {
    Write-Warning $_.Exception.Message
    if ($stateChanged) {
        Restore-SafeState
    }
    throw
}
