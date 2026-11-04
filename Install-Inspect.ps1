# Host adapter: the module owns the Inspect dependency and installation procedure.
$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot 'node_modules/pi-suite-benchmarks/Install-Inspect.ps1'
if (-not (Test-Path -LiteralPath $installer)) { throw 'Modulo benchmark assente. Esegui npm ci nella cartella della suite.' }
$suitePython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $suitePython)) { $suitePython = (Get-Command python -ErrorAction Stop).Source }
& $installer -RuntimeDirectory $PSScriptRoot -Python $suitePython
