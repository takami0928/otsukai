function Select-NewWorkflowRunId {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [string[]]$ExistingRunIds,
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [object[]]$Runs
    )

    foreach ($run in $Runs) {
        if ($null -eq $run) {
            continue
        }

        $runId = [string]$run.databaseId
        if (
            -not [string]::IsNullOrWhiteSpace($runId) -and
            $ExistingRunIds -notcontains $runId
        ) {
            return $runId
        }
    }

    return $null
}

function Start-PagesDeployment {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Repository
    )

    $existingRunsJson = Get-CheckedOutput -Command 'gh' -Arguments @(
        'run', 'list',
        '--workflow', 'deploy.yml',
        '--branch', 'main',
        '--event', 'workflow_dispatch',
        '--limit', '20',
        '--repo', $Repository,
        '--json', 'databaseId'
    )
    $existingRuns = ConvertFrom-Json -InputObject $existingRunsJson
    $existingRunIds = @(
        @($existingRuns) |
            ForEach-Object { [string]$_.databaseId }
    )

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
            '--json', 'databaseId'
        )
        $runs = ConvertFrom-Json -InputObject $runsJson
        $runId = Select-NewWorkflowRunId `
            -ExistingRunIds $existingRunIds `
            -Runs @($runs)
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
    $run = ConvertFrom-Json -InputObject $runJson
    if ($run.status -ne 'completed' -or $run.conclusion -ne 'success') {
        throw "GitHub Pages run $runId did not succeed."
    }

    return $runId
}

function Confirm-PublicHandwritingFlags {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PagesRunId,
        [Parameter(Mandatory = $true)]
        [bool]$ExpectedEnabled
    )

    $checkName = if ($ExpectedEnabled) { 'oncheck' } else { 'offcheck' }
    $publicUrl =
        "https://takami0928.github.io/otsukai/?$checkName=$PagesRunId"
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

    $expectedValue = if ($ExpectedEnabled) { 'true' } else { 'false' }
    $bundle = $asset.Content
    foreach ($flagName in @(
        'VITE_HANDWRITING_IMPORT_ENABLED',
        'VITE_HANDWRITING_DIAGNOSTICS_ENABLED'
    )) {
        $flagPattern =
            [regex]::Escape($flagName) +
            '\s*:\s*"' +
            $expectedValue +
            '"'
        if ($bundle -notmatch $flagPattern) {
            throw (
                "The public bundle does not contain $flagName=" +
                "$expectedValue."
            )
        }
    }

    if ($ExpectedEnabled) {
        foreach ($requiredSetting in @(
            'VITE_HANDWRITING_IMPORT_ENDPOINT',
            'VITE_TURNSTILE_SITE_KEY'
        )) {
            $settingPattern =
                [regex]::Escape($requiredSetting) + '\s*:\s*"[^"]+"'
            if ($bundle -notmatch $settingPattern) {
                throw (
                    'The public bundle is missing required handwriting ' +
                    "setting: $requiredSetting"
                )
            }
        }
    }

    return $scriptMatch.Groups[1].Value
}
