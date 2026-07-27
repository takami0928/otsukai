[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ScriptsDirectory = $PSScriptRoot
$StartScript = Join-Path $ScriptsDirectory 'start-handwriting-manual-test.ps1'
$StopScript = Join-Path $ScriptsDirectory 'stop-handwriting-manual-test.ps1'
$PagesScript = Join-Path `
    $ScriptsDirectory `
    'handwriting-manual-test-pages.ps1'

function Assert-Equal {
    param(
        [AllowNull()]
        [object]$Actual,
        [AllowNull()]
        [object]$Expected,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    if ($Actual -ne $Expected) {
        throw (
            "$Message Expected '$Expected', but received '$Actual'."
        )
    }
}

function Assert-ContainsAfter {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Text,
        [Parameter(Mandatory = $true)]
        [string]$Expected,
        [Parameter(Mandatory = $true)]
        [int]$MinimumIndex
    )

    $index = $Text.IndexOf(
        $Expected,
        $MinimumIndex + 1,
        [StringComparison]::Ordinal
    )
    if ($index -le $MinimumIndex) {
        throw (
            "Expected '$Expected' after index $MinimumIndex, " +
            "but found index $index."
        )
    }
}

$scriptAsts = @{}
foreach ($scriptFile in Get-ChildItem -LiteralPath $ScriptsDirectory -Filter '*.ps1') {
    $tokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
        $scriptFile.FullName,
        [ref]$tokens,
        [ref]$parseErrors
    )
    if ($parseErrors.Count -gt 0) {
        $messages = @($parseErrors | ForEach-Object { $_.Message }) -join '; '
        throw "$($scriptFile.Name) has parse errors: $messages"
    }
    $scriptAsts[$scriptFile.Name] = $ast

    $scriptText = Get-Content -Raw -LiteralPath $scriptFile.FullName
    if ($scriptText -match '(?im)\breturn\s+(if|foreach|switch)\b') {
        throw "$($scriptFile.Name) contains a statement after return."
    }
}

$startAst = $scriptAsts['start-handwriting-manual-test.ps1']
$getVariableFunction = $startAst.Find(
    {
        param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -eq 'Get-VariableValue'
    },
    $true
)
if ($null -eq $getVariableFunction) {
    throw 'Get-VariableValue was not found.'
}
Invoke-Expression $getVariableFunction.Extent.Text
. $PagesScript

$presentVariables = @(
    [pscustomobject]@{ name = 'PRESENT'; value = 'configured' }
)
Assert-Equal `
    -Actual (Get-VariableValue -Variables $presentVariables -Name 'PRESENT') `
    -Expected 'configured' `
    -Message 'An existing Repository Variable must be returned.'
Assert-Equal `
    -Actual (Get-VariableValue -Variables $presentVariables -Name 'MISSING') `
    -Expected '' `
    -Message 'A missing Repository Variable must return an empty string.'

$falseVariables = @(
    [pscustomobject]@{ name = 'FLAG'; value = 'false' }
)
Assert-Equal `
    -Actual (Get-VariableValue -Variables $falseVariables -Name 'FLAG') `
    -Expected 'false' `
    -Message 'The string false must not be treated as a missing variable.'

$emptyVariables = @(
    [pscustomobject]@{ name = 'EMPTY'; value = '' }
)
Assert-Equal `
    -Actual (Get-VariableValue -Variables $emptyVariables -Name 'EMPTY') `
    -Expected '' `
    -Message 'An existing empty Repository Variable must return an empty string.'

$existingRunIds = @('100')
Assert-Equal `
    -Actual (
        Select-NewWorkflowRunId `
            -ExistingRunIds $existingRunIds `
            -Runs @([pscustomobject]@{ databaseId = '200' })
    ) `
    -Expected '200' `
    -Message 'The first new workflow run ID must be selected.'
Assert-Equal `
    -Actual (
        Select-NewWorkflowRunId `
            -ExistingRunIds $existingRunIds `
            -Runs @(
                [pscustomobject]@{ databaseId = '300' }
                [pscustomobject]@{ databaseId = '200' }
                [pscustomobject]@{ databaseId = '100' }
            )
    ) `
    -Expected '300' `
    -Message 'Input order must be preserved when multiple runs are new.'
Assert-Equal `
    -Actual (
        Select-NewWorkflowRunId `
            -ExistingRunIds $existingRunIds `
            -Runs @([pscustomobject]@{ databaseId = '100' })
    ) `
    -Expected $null `
    -Message 'No run ID must be returned when every run already existed.'
Assert-Equal `
    -Actual (
        Select-NewWorkflowRunId `
            -ExistingRunIds $existingRunIds `
            -Runs @(
                [pscustomobject]@{
                    databaseId = '201'
                    createdAt = 'not-a-date'
                }
            )
    ) `
    -Expected '201' `
    -Message 'An invalid createdAt string must not affect run selection.'
Assert-Equal `
    -Actual (
        Select-NewWorkflowRunId `
            -ExistingRunIds $existingRunIds `
            -Runs @(
                [pscustomobject]@{
                    databaseId = '202'
                    createdAt = [DateTime]::UtcNow
                }
            )
    ) `
    -Expected '202' `
    -Message 'A DateTime createdAt value must not affect run selection.'
Assert-Equal `
    -Actual (
        Select-NewWorkflowRunId `
            -ExistingRunIds $existingRunIds `
            -Runs @([pscustomobject]@{ databaseId = '203' })
    ) `
    -Expected '203' `
    -Message 'A run without createdAt must be selected by ID only.'

$script:runListCallCount = 0
$script:checkedCalls = @()
$script:returnNewRun = $true
function Start-Sleep {
    param([int]$Seconds)
}
function Get-CheckedOutput {
    param(
        [string]$Command,
        [string[]]$Arguments
    )

    if ($Arguments[0] -eq 'run' -and $Arguments[1] -eq 'list') {
        $script:runListCallCount += 1
        if ($script:runListCallCount -eq 1) {
            return '[{"databaseId":"100"}]'
        }
        if (-not $script:returnNewRun) {
            return '[{"databaseId":"100"}]'
        }
        return '[{"databaseId":"200"},{"databaseId":"100"}]'
    }
    if ($Arguments[0] -eq 'run' -and $Arguments[1] -eq 'view') {
        return (
            '{"status":"completed","conclusion":"success",' +
            '"url":"https://example.invalid/run"}'
        )
    }
    throw "Unexpected Get-CheckedOutput call: $($Arguments -join ' ')"
}
function Invoke-Checked {
    param(
        [string]$Command,
        [string[]]$Arguments
    )

    $script:checkedCalls += [pscustomobject]@{
        Command = $Command
        Arguments = [string[]]$Arguments
    }
}

$mockPagesRunId = Start-PagesDeployment -Repository 'example/repository'
Assert-Equal `
    -Actual $mockPagesRunId `
    -Expected '200' `
    -Message 'Start-PagesDeployment must return the newly detected run ID.'
$watchCall = $script:checkedCalls |
    Where-Object {
        $_.Arguments[0] -eq 'run' -and
        $_.Arguments[1] -eq 'watch'
    } |
    Select-Object -First 1
if ($null -eq $watchCall) {
    throw 'The mocked Pages deployment did not call gh run watch.'
}
Assert-Equal `
    -Actual $watchCall.Arguments[2] `
    -Expected '200' `
    -Message 'gh run watch must receive the newly detected run ID.'

$script:runListCallCount = 0
$script:returnNewRun = $false
$runDetectionFailed = $false
try {
    $null = Start-PagesDeployment -Repository 'example/repository'
}
catch {
    $runDetectionFailed =
        $_.Exception.Message -match 'Could not determine the dispatched'
}
if (-not $runDetectionFailed) {
    throw 'Pages deployment must fail safely when no new run ID appears.'
}

$script:publicBundle = @'
const env = {
  VITE_HANDWRITING_IMPORT_ENABLED: "true",
  VITE_HANDWRITING_DIAGNOSTICS_ENABLED: "true",
  VITE_HANDWRITING_IMPORT_ENDPOINT: "https://worker.example.invalid/",
  VITE_TURNSTILE_SITE_KEY: "public-site-key"
}
'@
function Invoke-WebRequest {
    param(
        [switch]$UseBasicParsing,
        [string]$Uri,
        [hashtable]$Headers
    )

    if ($Uri -match '\.js$') {
        return [pscustomobject]@{
            StatusCode = 200
            Content = $script:publicBundle
        }
    }
    return [pscustomobject]@{
        StatusCode = 200
        Content = '<script type="module" src="/otsukai/assets/index-test.js"></script>'
    }
}

Assert-Equal `
    -Actual (
        Confirm-PublicHandwritingFlags `
            -PagesRunId '200' `
            -ExpectedEnabled $true
    ) `
    -Expected '/otsukai/assets/index-test.js' `
    -Message 'The ON bundle must pass public verification.'
$script:publicBundle = @'
const env = {
  VITE_HANDWRITING_IMPORT_ENABLED: "false",
  VITE_HANDWRITING_DIAGNOSTICS_ENABLED: "false"
}
'@
Assert-Equal `
    -Actual (
        Confirm-PublicHandwritingFlags `
            -PagesRunId '201' `
            -ExpectedEnabled $false
    ) `
    -Expected '/otsukai/assets/index-test.js' `
    -Message 'The OFF bundle must pass public verification.'
$onMismatchRejected = $false
try {
    $null = Confirm-PublicHandwritingFlags `
        -PagesRunId '202' `
        -ExpectedEnabled $true
}
catch {
    $onMismatchRejected = $true
}
if (-not $onMismatchRejected) {
    throw 'The enabled state must reject a public bundle with OFF flags.'
}

$preflightParameter = $startAst.ParamBlock.Parameters |
    Where-Object { $_.Name.VariablePath.UserPath -eq 'PreflightOnly' } |
    Select-Object -First 1
if ($null -eq $preflightParameter) {
    throw 'The PreflightOnly switch parameter was not found.'
}

$startText = Get-Content -Raw -LiteralPath $StartScript
$preflightIndex = $startText.IndexOf(
    'if ($PreflightOnly)',
    [StringComparison]::Ordinal
)
if ($preflightIndex -lt 0) {
    throw 'The PreflightOnly completion gate was not found.'
}
Assert-ContainsAfter `
    -Text $startText `
    -Expected '$stateChanged = $true' `
    -MinimumIndex $preflightIndex
Assert-ContainsAfter `
    -Text $startText `
    -Expected 'Deploy-Worker -DiagnosticsEnabled $true' `
    -MinimumIndex $preflightIndex
Assert-ContainsAfter `
    -Text $startText `
    -Expected "-Name 'VITE_HANDWRITING_IMPORT_ENABLED'" `
    -MinimumIndex $preflightIndex
Assert-ContainsAfter `
    -Text $startText `
    -Expected '-Value ''true''' `
    -MinimumIndex $preflightIndex
Assert-ContainsAfter `
    -Text $startText `
    -Expected '$pagesRunId = Start-PagesDeployment -Repository $Repository' `
    -MinimumIndex $preflightIndex

$stopText = Get-Content -Raw -LiteralPath $StopScript
$pagesText = Get-Content -Raw -LiteralPath $PagesScript
foreach ($textEntry in @(
    [pscustomobject]@{ Name = 'start'; Text = $startText }
    [pscustomobject]@{ Name = 'stop'; Text = $stopText }
    [pscustomobject]@{ Name = 'pages'; Text = $pagesText }
)) {
    if ($textEntry.Text -match 'createdAt|DateTimeOffset') {
        throw "$($textEntry.Name) script must not inspect workflow timestamps."
    }
}

$onVerificationIndex = $startText.IndexOf(
    '-ExpectedEnabled $true',
    [StringComparison]::Ordinal
)
$enabledMessageIndex = $startText.IndexOf(
    'MANUAL TEST IS ENABLED',
    [StringComparison]::Ordinal
)
if (
    $onVerificationIndex -lt 0 -or
    $enabledMessageIndex -le $onVerificationIndex
) {
    throw 'The ON bundle must be verified before the enabled message.'
}
if (
    $startText -notmatch
        '(?s)catch\s*\{.*if\s*\(\$stateChanged\).*Restore-SafeState'
) {
    throw 'Start failures must enter the safe restoration path.'
}
if ($startText -match '--version-id\s+<') {
    throw 'The displayed tail command must not contain a version placeholder.'
}
if ($startText -notmatch '--version-id \$\(\$version\.version_id\)') {
    throw 'The displayed tail command must include the deployed version ID.'
}

foreach ($expectedStopOperation in @(
    "'VITE_HANDWRITING_IMPORT_ENABLED'",
    "'VITE_HANDWRITING_DIAGNOSTICS_ENABLED'",
    "Set-RepositoryVariable -Name `$variableName -Value 'false'",
    'Deploy-WorkerDiagnosticsOff',
    '$pagesRunId = Start-PagesDeployment -Repository $Repository',
    '-ExpectedEnabled $false'
)) {
    if (
        $stopText.IndexOf(
            $expectedStopOperation,
            [StringComparison]::Ordinal
        ) -lt 0
    ) {
        throw "The stop script lost required behavior: $expectedStopOperation"
    }
}

Write-Host 'POWERSHELL MANUAL TEST SCRIPT TESTS PASSED'
