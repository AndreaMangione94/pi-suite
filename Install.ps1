param([string]$Destination = (Join-Path $env:LOCALAPPDATA 'PiSuite'), [switch]$ValidateOnly, [switch]$NoIntegration, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
function Require-Winget {
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { throw 'Installa App Installer dal Microsoft Store e riapri Install.cmd: serve winget per le dipendenze mancanti.' }
}
function Run-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Operazione non riuscita: $Program (exit $LASTEXITCODE)" }
}
function Test-NodeVersion {
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { return $false }
    $versionText = & node.exe --version
    if ($LASTEXITCODE -ne 0) { return $false }
    return ([version]$versionText.TrimStart('v')) -ge [version]'22.19.0'
}
try {
    if ($ValidateOnly) {
        foreach ($name in @('node.exe','git.exe','py.exe')) { if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "Manca $name" } }
        if (-not (Test-NodeVersion)) { throw 'Serve Node >= 22.19' }
        Run-Checked 'py.exe' @('-3.13','-c','import sys; print(sys.version)')
        Write-Host 'Prerequisiti disponibili; nessuna installazione eseguita.'
        exit 0
    }
    Write-Host 'Pi Suite - installazione locale' -ForegroundColor Green
    $nodeOK = Test-NodeVersion
    if (-not $nodeOK) { Require-Winget; Run-Checked 'winget.exe' @('install','--id','OpenJS.NodeJS.LTS','--exact','--accept-package-agreements','--accept-source-agreements'); Refresh-Path }
    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { Require-Winget; Run-Checked 'winget.exe' @('install','--id','Git.Git','--exact','--accept-package-agreements','--accept-source-agreements'); Refresh-Path }
    $pythonOK = $false
    if (Get-Command py.exe -ErrorAction SilentlyContinue) { & py.exe -3.13 -c 'import sys' 2>$null; $pythonOK = $LASTEXITCODE -eq 0 }
    if (-not $pythonOK) { Require-Winget; Run-Checked 'winget.exe' @('install','--id','Python.Python.3.13','--exact','--scope','user','--accept-package-agreements','--accept-source-agreements'); Refresh-Path }
    $appRoot = Join-Path $Destination 'app'
    $dataRoot = Join-Path $Destination 'data'
    $binRoot = Join-Path $Destination 'bin'
    New-Item -ItemType Directory -Force -Path $appRoot,$dataRoot,$binRoot | Out-Null
    $files = @('suite_byok.py','byok-format.mjs','byok-network.mjs','models.schema.json','models.config.example.json','models.config.example.yaml','models.custom.example.json','GUIDA-BYOK.md','LICENSE','THIRD-PARTY-NOTICES.md','suite_evidence.py','suite_evidence_cli.py','evidence-tools.mjs','GUIDA-CONOSCENZA-E-GRAFI.md','adapter.mjs','suite.py','suite_asis.py','suite_sources.py','suite_graph.py','suite_cli.py','suite-extension.ts','suite-delegation.ts','suite-child.ts','delegation-core.mjs','connected-sources.mjs','GUIDA-FONTI-AS-IS.md','package.json','package-lock.json','requirements-ast.txt','README-SUITE.md','RESOCONTO-E-PRIMO-AVVIO.md','VERIFICA-SUITE.md','MEMORY.md','Start-Suite.ps1','pi.cmd','Pi-Suite.cmd')
    $files += @('suite_workspace.py','suite_benchmarks.py','suite_inspect.py','benchmark-catalog.json','requirements-inspect.txt','Install-Inspect.ps1','GUIDA-BENCHMARK.md')
    $files += @('suite_document_graph.py','document-graph-tools.mjs','evidence-reading.mjs')
    foreach ($name in $files) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $appRoot $name) -Force }
    foreach ($name in @('skills','suite-ui')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $appRoot -Recurse -Force }
    Push-Location $appRoot
    try {
        Run-Checked 'npm.cmd' @('ci','--omit=dev','--no-audit','--no-fund')
        if (-not (Test-Path -LiteralPath (Join-Path $appRoot '.venv\Scripts\python.exe'))) { Run-Checked 'py.exe' @('-3.13','-m','venv','.venv') }
        $python = Join-Path $appRoot '.venv\Scripts\python.exe'
        Run-Checked $python @('-m','pip','install','--no-deps','-r','requirements-ast.txt')
        Run-Checked $python @('-c','import graphify.extract,tree_sitter')
        Run-Checked $python @('suite_evidence_cli.py','--self-check')
        Run-Checked $python @('-c','import suite_document_graph')
        Run-Checked 'node.exe' @('--check','adapter.mjs')
        Run-Checked 'node.exe' @('--check','document-graph-tools.mjs')
        Run-Checked 'node.exe' @('--check','evidence-reading.mjs')
    } finally { Pop-Location }
    # The user-level command only points at this installation; no existing Pi files are changed.
    $launcher = '@echo off' + "`r`n" + 'setlocal' + "`r`n" + 'set "PI_SUITE_HOME=%~dp0..\data"' + "`r`n" + 'call "%~dp0..\app\pi.cmd" %*' + "`r`n"
    [IO.File]::WriteAllText((Join-Path $binRoot 'pi.cmd'), $launcher, [Text.Encoding]::Default)
    if (-not $NoIntegration) {
    $userPath = [Environment]::GetEnvironmentVariable('Path','User')
    if (($userPath -split ';') -notcontains $binRoot) { [Environment]::SetEnvironmentVariable('Path',"$binRoot;$userPath",'User') }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Pi Suite.lnk'))
    $shortcut.TargetPath = 'powershell.exe'
    $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $appRoot 'Start-Suite.ps1') + '" -DataDirectory "' + $dataRoot + '"'
    $shortcut.WorkingDirectory = $appRoot
    $shortcut.Description = 'Pi Suite - modelli, subagenti e grafo locale'
    $shortcut.Save()
    }
    Write-Host 'Installazione completata. Apri Pi Suite dal desktop oppure usa pi suite in un nuovo terminale.' -ForegroundColor Green
    if (-not $NoLaunch) { & (Join-Path $appRoot 'Start-Suite.ps1') -DataDirectory $dataRoot }
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
