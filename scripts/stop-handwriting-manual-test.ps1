[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Repository = 'takami0928/otsukai'
$AllowedOrigin = 'https://takami0928.github.io'
$WorkerName = 'otsukai-handwriting-import'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$WorkerConfig = Join-Path $RepoRoot 'worker/wrangler.toml'

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

function Deploy-WorkerDiagnosticsOff {
    Invoke-Checked -Command 'npx.cmd' -Arguments @(
        'wrangler', 'deploy',
        '--config', $WorkerConfig,
        '--var', "ALLOWED_ORIGINS:$AllowedOrigin",
        '--var', 'DIAGNOSTIC_MODE:false',
        '--strict'
    )
}

function Confirm-PublicFeatureIsOff {
    param([Parameter(Mandatory = $true)][string]$PagesRunId)

    $publicUrl =
        "https://takami0928.github.io/otsukai/?offcheck=$PagesRunId"
    $page = Invoke-WebRequest `
        -UseBasicParsing `
        -Uri $publicUrl `
        -Headers @{ 'Cache-Control' = 'no-cache' }
    if ($page.StatusCode -ne 200) {
        throw "Public Pages returned HTTP $($page.StatusCode)."
    }
    $scriptMatch = [regex]::Match(
        $page.Content,
        '<script[^>]+src="([^"]+\.js)"'
    )
    if (-not $scriptMatch.Success) {
        throw 'The deployed JavaScript asset was not found.'
    }
    $assetUrl = [Uri]::new(
        [Uri]'https://takami0928.github.io',
        $scriptMatch.Groups[1].Value
    ).AbsoluteUri
    $asset = Invoke-WebRequest `
        -UseBasicParsing `
        -Uri $assetUrl `
        -Headers @{ 'Cache-Control' = 'no-cache' }
    if ($asset.StatusCode -ne 200) {
        throw "The deployed bundle returned HTTP $($asset.StatusCode)."
    }
    $bundle = $asset.Content
    if (
        $bundle -notmatch
            'VITE_HANDWRITING_IMPORT_ENABLED\s*:\s*"false"' -or
        $bundle -notmatch
            'VITE_HANDWRITING_DIAGNOSTICS_ENABLED\s*:\s*"false"'
    ) {
        throw 'The public bundle does not contain both OFF flags.'
    }
    return $scriptMatch.Groups[1].Value
}

$failures = [System.Collections.Generic.List[string]]::new()
$pagesRunId = $null
$workerDeployment = $null
foreach ($variableName in @(
    'VITE_HANDWRITING_IMPORT_ENABLED',
    'VITE_HANDWRITING_DIAGNOSTICS_ENABLED'
)) {
    try {
        Set-RepositoryVariable -Name $variableName -Value 'false'
    }
    catch {
        $failures.Add(
            "Could not restore $variableName to false: $($_.Exception.Message)"
        )
    }
}

try {
    $pagesRunId = Start-PagesDeployment
}
catch {
    $failures.Add(
        "Pages OFF deployment did not complete: $($_.Exception.Message)"
    )
}

$canDeployWorker = $true
try {
    if (-not (Test-Path -LiteralPath $WorkerConfig)) {
        throw "Worker configuration is missing: $WorkerConfig"
    }
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
    if ((Get-CheckedOutput -Command 'git' -Arguments @(
        'branch', '--show-current'
    )) -ne 'main') {
        throw 'Worker OFF deployment requires the main branch.'
    }
    if (Get-CheckedOutput -Command 'git' -Arguments @(
        'status', '--porcelain'
    )) {
        throw 'Worker OFF deployment requires a clean working tree.'
    }
    $existingDeploymentJson = Get-CheckedOutput `
        -Command 'npx.cmd' `
        -Arguments @(
            'wrangler', 'deployments', 'status',
            '--config', $WorkerConfig,
            '--json'
        )
    $existingDeployment = $existingDeploymentJson | ConvertFrom-Json
    $existingVersion = @($existingDeployment.versions) |
        Where-Object { $_.percentage -eq 100 } |
        Select-Object -First 1
    if (-not $existingDeployment.id -or -not $existingVersion) {
        throw "Existing Worker deployment was not found: $WorkerName"
    }
}
catch {
    $canDeployWorker = $false
    $failures.Add($_.Exception.Message)
}

if ($canDeployWorker) {
    try {
        Deploy-WorkerDiagnosticsOff
        $deploymentJson = Get-CheckedOutput -Command 'npx.cmd' -Arguments @(
            'wrangler', 'deployments', 'status',
            '--config', $WorkerConfig,
            '--json'
        )
        $workerDeployment = $deploymentJson | ConvertFrom-Json
    }
    catch {
        $failures.Add(
            "Worker diagnostic OFF deployment failed: $($_.Exception.Message)"
        )
    }
}

if ($pagesRunId) {
    try {
        $assetPath = Confirm-PublicFeatureIsOff -PagesRunId $pagesRunId
    }
    catch {
        $failures.Add(
            "Public OFF verification failed: $($_.Exception.Message)"
        )
    }
}

try {
    $variablesJson = Get-CheckedOutput -Command 'gh' -Arguments @(
        'variable', 'list', '--repo', $Repository, '--json', 'name,value'
    )
    $variables = @($variablesJson | ConvertFrom-Json)
    foreach ($offVariable in @(
        'VITE_HANDWRITING_IMPORT_ENABLED',
        'VITE_HANDWRITING_DIAGNOSTICS_ENABLED'
    )) {
        $variable = $variables |
            Where-Object { $_.name -eq $offVariable } |
            Select-Object -First 1
        if (-not $variable -or [string]$variable.value -ne 'false') {
            throw (
                'Repository Variable was not restored to false: ' +
                $offVariable
            )
        }
    }
    foreach ($requiredVariable in @(
        'VITE_HANDWRITING_IMPORT_ENDPOINT',
        'VITE_TURNSTILE_SITE_KEY'
    )) {
        $variable = $variables |
            Where-Object { $_.name -eq $requiredVariable } |
            Select-Object -First 1
        if (
            -not $variable -or
            [string]::IsNullOrWhiteSpace($variable.value)
        ) {
            throw "Required Repository Variable is missing: $requiredVariable"
        }
    }
}
catch {
    $failures.Add(
        "Repository Variable verification failed: $($_.Exception.Message)"
    )
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Warning $_ }
    throw 'Manual test OFF restore did not complete every required check.'
}

$activeVersion = @($workerDeployment.versions) |
    Where-Object { $_.percentage -eq 100 } |
    Select-Object -First 1

Write-Host ''
Write-Host 'MANUAL TEST IS OFF' -ForegroundColor Green
Write-Host "Pages run: $pagesRunId"
Write-Host "Public bundle: $assetPath"
Write-Host 'VITE_HANDWRITING_IMPORT_ENABLED=false'
Write-Host 'VITE_HANDWRITING_DIAGNOSTICS_ENABLED=false'
Write-Host 'Endpoint Variable: present'
Write-Host 'Turnstile Site Key Variable: present'
Write-Host "Worker: $WorkerName"
Write-Host "Worker deployment ID: $($workerDeployment.id)"
Write-Host "Worker version: $($activeVersion.version_id)"
Write-Host 'Worker DIAGNOSTIC_MODE=false'
