# Optional scoring environment, separate from the operational harness.
$ErrorActionPreference = 'Stop'
$runnerPath = Join-Path $PSScriptRoot '.venv-inspect/Scripts/python.exe'
$suitePython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $suitePython)) { $suitePython = (Get-Command python -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $runnerPath)) {
    & $suitePython -m venv (Join-Path $PSScriptRoot '.venv-inspect')
    if ($LASTEXITCODE -ne 0) { throw 'Creazione ambiente Inspect non riuscita.' }
}
& $runnerPath -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements-inspect.txt')
if ($LASTEXITCODE -ne 0) { throw 'Installazione Inspect non riuscita.' }
Write-Host "Inspect pronto. Riapri Benchmark e confronti. Nessuna impostazione dell'harness modificata."
