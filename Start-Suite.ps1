param([string]$DataDirectory = '')
$ErrorActionPreference = 'Stop'
if (-not $DataDirectory) {
    if ($env:PI_SUITE_HOME) { $DataDirectory = $env:PI_SUITE_HOME }
    elseif (Test-Path -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'data')) { $DataDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'data' }
    else { $DataDirectory = Join-Path $PSScriptRoot 'suite-data' }
}
$python = Join-Path $PSScriptRoot '.venv\Scripts\pythonw.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Dipendenze assenti. Esegui Install.cmd.' }
$env:PI_SUITE_HOME = $DataDirectory
$arguments = '"' + (Join-Path $PSScriptRoot 'suite.py') + '" --home "' + $DataDirectory + '"'
Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
