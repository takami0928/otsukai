[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ScriptsDirectory = $PSScriptRoot
$StartScript = Join-Path $ScriptsDirectory 'start-handwriting-manual-test.ps1'
$StopScript = Join-Path $ScriptsDirectory 'stop-handwriting-manual-test.ps1'

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
    -Expected '$pagesRunId = Start-PagesDeployment' `
    -MinimumIndex $preflightIndex

$stopText = Get-Content -Raw -LiteralPath $StopScript
foreach ($expectedStopOperation in @(
    "'VITE_HANDWRITING_IMPORT_ENABLED'",
    "'VITE_HANDWRITING_DIAGNOSTICS_ENABLED'",
    "Set-RepositoryVariable -Name `$variableName -Value 'false'",
    'Deploy-WorkerDiagnosticsOff',
    '$pagesRunId = Start-PagesDeployment'
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
