param([string]$RuntimeApplication = (Join-Path $env:LOCALAPPDATA 'PiSuite\app'))

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Reinstalla-PiSuite.ps1')

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$installed = $RuntimeApplication
$windowsApplication = 'C:\Users\User Name\PiSuite\app'
$command = '"C:\Python313\pythonw.exe" "' + $windowsApplication + '\suite.py" --home "C:\Users\User Name\PiSuite\data"'
Assert-True (Test-ApplicationCommand $command $windowsApplication) 'Base interpreter with the installed suite entry point must be recognized.'
Assert-True (-not (Test-ApplicationCommand 'python.exe "C:\Elsewhere\suite.py"' $windowsApplication)) 'An unrelated Python process must not be recognized.'
Assert-True (-not (Test-ApplicationCommand ('python.exe -c "print(''' + $windowsApplication + '\suite.py'')"') $windowsApplication)) 'A development -c process must not be recognized.'
Assert-True (-not (Test-ApplicationCommand ('python.exe "' + $windowsApplication + '\suite.py.bak"') $windowsApplication)) 'Matching must require an exact entry point.'
Assert-True (Test-ApplicationCommand ('node.exe "' + $windowsApplication + '\adapter.mjs" job.json') $windowsApplication) 'Installed Node entry points must be recognized.'

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('pi-suite-reinstall-test-' + [Guid]::NewGuid().ToString('N'))
$Source = Join-Path $testRoot 'source'
$Destination = Join-Path $testRoot 'installed'
$ValidateOnly = $false
$NoLaunch = $true
$sourceFiles = @(Get-ApplicationFiles $PSScriptRoot)
$application = Join-Path $Destination 'app'
$dataFile = Join-Path $Destination 'data\keep.json'
try {
    New-Item -ItemType Directory -Force -Path $Source, $application, (Split-Path $dataFile) | Out-Null
    foreach ($file in $sourceFiles) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $Source $file) }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Install.ps1') -Destination $Source
    foreach ($folder in @('suite-ui', 'skills')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $folder) -Destination $Source -Recurse }
    foreach ($manifest in @('package.json', 'package-lock.json', 'requirements-ast.txt')) {
        Copy-Item -LiteralPath (Join-Path $Source $manifest) -Destination $application
    }
    [IO.File]::WriteAllText((Join-Path $application 'old-version.txt'), 'previous application')
    [IO.File]::WriteAllText($dataFile, '{"preserved":true}')
    $dataHash = (Get-FileHash -LiteralPath $dataFile).Hash
    foreach ($runtime in @('.venv', 'node_modules')) {
        New-Item -ItemType Junction -Path (Join-Path $application $runtime) -Target (Join-Path $installed $runtime) | Out-Null
    }

    $ValidateOnly = $true
    Invoke-Reinstallation
    Assert-True (Test-Path -LiteralPath (Join-Path $application 'old-version.txt')) 'Validation modified the application.'
    Assert-True (@(Get-ChildItem -LiteralPath $Destination -Directory -Filter 'app-precedente-*').Count -eq 0) 'Validation created a backup.'
    $ValidateOnly = $false
    Invoke-Reinstallation
    Assert-True (Test-Path -LiteralPath (Join-Path $application 'suite.py')) 'Fresh application was not installed.'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $application 'old-version.txt'))) 'The old application was not replaced.'
    $backupFolder = @(Get-ChildItem -LiteralPath $Destination -Directory -Filter 'app-precedente-*')[0].FullName
    Assert-True (Test-Path -LiteralPath (Join-Path $backupFolder 'old-version.txt')) 'Old application backup is missing.'
    Assert-True ((Get-FileHash -LiteralPath $dataFile).Hash -eq $dataHash) 'Data changed during reinstallation.'
    foreach ($runtime in @('.venv', 'node_modules')) {
        Assert-True ((Get-Item -LiteralPath (Join-Path $application $runtime)).LinkType -eq 'Junction') 'Runtime junction was not preserved.'
    }

    $backend = Join-Path $application 'suite.py'
    $backendHash = (Get-FileHash -LiteralPath $backend).Hash
    [IO.File]::WriteAllText((Join-Path $Source 'suite.py'), 'raise RuntimeError("Intentional rollback test")')
    $failed = $false
    try { Invoke-Reinstallation } catch { $failed = $true }
    Assert-True $failed 'A broken backend was unexpectedly accepted.'
    Assert-True ((Get-FileHash -LiteralPath $backend).Hash -eq $backendHash) 'Rollback did not restore the previous application.'
    Assert-True ((Get-FileHash -LiteralPath $dataFile).Hash -eq $dataHash) 'Rollback modified data.'
    Test-ApplicationRuntime $application
    Write-Host 'Reinstall tests passed: process identification, validation only, app replacement, runtime preservation, unchanged data and rollback.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $testRoot) {
        foreach ($junction in @(Get-ChildItem -LiteralPath $Destination -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            foreach ($runtime in @('.venv', 'node_modules')) {
                $candidate = Join-Path $_.FullName $runtime
                if (Test-Path -LiteralPath $candidate) { Get-Item -LiteralPath $candidate }
            }
        })) {
            if ($junction.LinkType -eq 'Junction') { [IO.Directory]::Delete($junction.FullName) }
        }
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}