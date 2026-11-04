param(
    [Parameter(Mandatory=$true)][string]$RuntimeDirectory,
    [string]$Python = 'python'
)
$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath($RuntimeDirectory)
$environmentPath = Join-Path $runtime '.venv-inspect'
$runnerPath = Join-Path $environmentPath 'Scripts/python.exe'
if (-not (Test-Path -LiteralPath $runnerPath)) {
    & $Python -m venv $environmentPath
    if ($LASTEXITCODE -ne 0) { throw 'Creazione ambiente Inspect non riuscita.' }
}
& $runnerPath -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements-inspect.txt')
if ($LASTEXITCODE -ne 0) { throw 'Installazione Inspect non riuscita.' }
Write-Host 'Inspect pronto. Riapri Benchmark e confronti.'
