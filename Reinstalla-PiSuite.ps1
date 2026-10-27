param(
    [string]$Destination = (Join-Path $env:LOCALAPPDATA 'PiSuite'),
    [string]$Source = $PSScriptRoot,
    [switch]$ValidateOnly,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'

function Get-ApplicationFiles([string]$Directory) {
    $tokens = $null
    $parseErrors = $null
    $installer = Join-Path $Directory 'Install.ps1'
    $tree = [System.Management.Automation.Language.Parser]::ParseFile($installer, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw 'Install.ps1 non valido: reinstallazione interrotta.' }
    $assignments = $tree.FindAll({
        param($item)
        $item -is [System.Management.Automation.Language.AssignmentStatementAst] -and
        $item.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and
        $item.Left.VariablePath.UserPath -eq 'files'
    }, $true)
    $files = @($assignments | ForEach-Object {
        $_.Right.FindAll({ param($item) $item -is [System.Management.Automation.Language.StringConstantExpressionAst] }, $true) |
            ForEach-Object { $_.Value }
    } | Select-Object -Unique)
    if ($files -notcontains 'suite.py' -or $files -notcontains 'Start-Suite.ps1') {
        throw 'Elenco dei file applicativi non disponibile in Install.ps1.'
    }
    foreach ($file in $files) {
        if ([IO.Path]::GetFileName($file) -ne $file -or -not (Test-Path -LiteralPath (Join-Path $Directory $file) -PathType Leaf)) {
            throw "File sorgente mancante o non valido: $file"
        }
    }
    foreach ($folder in @('suite-ui', 'skills')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Directory $folder) -PathType Container)) {
            throw "Cartella sorgente mancante: $folder"
        }
    }
    return $files
}

function Test-ApplicationCommand([string]$CommandLine, [string]$Application) {
    $entryPoints = @('suite.py', 'suite_cli.py', 'suite_evidence_cli.py', 'adapter.mjs', 'suite-child.ts', 'pi.cmd', 'Pi-Suite.cmd', 'Start-Suite.ps1')
    $arguments = @([regex]::Matches($CommandLine, '"([^"]*)"|(\S+)') | ForEach-Object {
        if ($_.Groups[1].Success) { $_.Groups[1].Value } else { $_.Groups[2].Value }
    })
    if ($arguments -contains '-c' -or $arguments -contains '-Command' -or $arguments -contains '-EncodedCommand') { return $false }
    foreach ($argument in $arguments) {
        foreach ($entry in $entryPoints) {
            if ($argument.Replace('/', '\') -ieq (Join-Path $Application $entry)) { return $true }
        }
    }
    return $false
}

function Get-ApplicationProcesses([string]$Application) {
    $processes = @(Get-CimInstance Win32_Process)
    $selected = @{}
    foreach ($item in $processes) {
        if ($item.ProcessId -ne $PID -and $item.CommandLine -and (Test-ApplicationCommand $item.CommandLine $Application)) {
            $selected[[int]$item.ProcessId] = $item
        }
    }
    do {
        $added = $false
        foreach ($item in $processes) {
            if ($item.ProcessId -ne $PID -and -not $selected.ContainsKey([int]$item.ProcessId) -and $selected.ContainsKey([int]$item.ParentProcessId)) {
                $selected[[int]$item.ProcessId] = $item
                $added = $true
            }
        }
    } while ($added)
    return @($selected.Values)
}

function Stop-ApplicationProcesses([string]$Application) {
    foreach ($item in @(Get-ApplicationProcesses $Application)) {
        $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($item.ProcessId)"
        if (-not $current) { continue }
        if ($current.CreationDate -ne $item.CreationDate) { throw 'Un processo e cambiato durante il controllo. Riprova.' }
        $running = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
        if ($running) {
            Stop-Process -Id $running.Id -ErrorAction Stop
            if (-not $running.WaitForExit(10000)) { throw 'Impossibile arrestare un processo Pi Suite.' }
        }
    }
    if (@(Get-ApplicationProcesses $Application).Count) { throw 'Pi Suite ancora in esecuzione: reinstallazione interrotta.' }
}

function Test-ApplicationRuntime([string]$Application) {
    $python = Join-Path $Application '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $python)) { throw 'Ambiente Python assente: esegui Install.cmd per una prima installazione completa.' }
    if (-not (Test-Path -LiteralPath (Join-Path $Application 'node_modules\@earendil-works\pi-coding-agent\package.json'))) {
        throw 'Dipendenze Node assenti: esegui Install.cmd per una prima installazione completa.'
    }
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js non disponibile nel PATH.' }
    & $python -c 'import graphify.extract, tree_sitter'
    if ($LASTEXITCODE -ne 0) { throw 'Le dipendenze Python non sono utilizzabili.' }
}

function Invoke-Reinstallation {
    $sourceRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
    $targetRoot = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
    $application = Join-Path $targetRoot 'app'
    $data = Join-Path $targetRoot 'data'
    if ($sourceRoot -ieq $targetRoot -or $sourceRoot.StartsWith($targetRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or $targetRoot.StartsWith($sourceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'La sorgente e la destinazione devono essere cartelle separate.'
    }
    $files = @(Get-ApplicationFiles $sourceRoot)
    Test-ApplicationRuntime $application
    foreach ($manifest in @('package.json', 'package-lock.json', 'requirements-ast.txt')) {
        $old = Join-Path $application $manifest
        if (-not (Test-Path -LiteralPath $old) -or (Get-FileHash -LiteralPath $old).Hash -ne (Get-FileHash -LiteralPath (Join-Path $sourceRoot $manifest)).Hash) {
            throw "Dipendenze cambiate ($manifest). Serve l'installazione completa con Install.cmd."
        }
    }
    $processes = @(Get-ApplicationProcesses $application)
    if ($ValidateOnly) {
        Write-Host "Verifica riuscita: $($files.Count) file applicativi; $($processes.Count) processi Pi Suite da arrestare."
        Write-Host "Dati conservati: $data"
        return
    }

    $suffix = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $staging = Join-Path $targetRoot ('app-nuova-' + $suffix)
    $backup = Join-Path $targetRoot ('app-precedente-' + $suffix)
    $oldMoved = $false
    $newMoved = $false
    try {
        New-Item -ItemType Directory -Path $staging | Out-Null
        foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination (Join-Path $staging $file) }
        foreach ($folder in @('suite-ui', 'skills')) { Copy-Item -LiteralPath (Join-Path $sourceRoot $folder) -Destination $staging -Recurse }
        foreach ($extra in @('skills', 'suite-ui')) {
            $oldFolder = Join-Path $application $extra
            if (Test-Path -LiteralPath $oldFolder) {
                foreach ($oldFile in @(Get-ChildItem -LiteralPath $oldFolder -File -Recurse)) {
                    $relative = $oldFile.FullName.Substring($application.Length + 1)
                    $newFile = Join-Path $staging $relative
                    if (-not (Test-Path -LiteralPath $newFile)) {
                        New-Item -ItemType Directory -Force -Path (Split-Path $newFile) | Out-Null
                        Copy-Item -LiteralPath $oldFile.FullName -Destination $newFile
                    }
                }
            }
        }
        & node.exe --check (Join-Path $staging 'suite-ui\app.js')
        if ($LASTEXITCODE -ne 0) { throw 'I sorgenti JavaScript non sono validi.' }
        Write-Host 'Arresto Pi Suite e sostituisco i file applicativi...'
        Stop-ApplicationProcesses $application
        Move-Item -LiteralPath $application -Destination $backup
        $oldMoved = $true
        Move-Item -LiteralPath $staging -Destination $application
        $newMoved = $true
        foreach ($runtime in @('.venv', 'node_modules')) {
            Move-Item -LiteralPath (Join-Path $backup $runtime) -Destination (Join-Path $application $runtime)
        }
        $python = Join-Path $application '.venv\Scripts\python.exe'
        Push-Location $application
        try {
            & $python -c 'import suite; assert callable(suite.Suite.save_connection)'
            if ($LASTEXITCODE -ne 0) { throw 'Verifica del nuovo backend non riuscita.' }
            & $python (Join-Path $application 'suite_evidence_cli.py') --self-check
            if ($LASTEXITCODE -ne 0) { throw 'Verifica delle dipendenze non riuscita.' }
        } finally { Pop-Location }
    } catch {
        $failure = $_
        if ($oldMoved) {
            foreach ($runtime in @('.venv', 'node_modules')) {
                $moved = Join-Path $application $runtime
                if ($newMoved -and (Test-Path -LiteralPath $moved)) { Move-Item -LiteralPath $moved -Destination (Join-Path $backup $runtime) }
            }
            if ($newMoved) { Move-Item -LiteralPath $application -Destination (Join-Path $targetRoot ('app-non-riuscita-' + $suffix)) }
            Move-Item -LiteralPath $backup -Destination $application
            Write-Host 'Ripristinata la precedente applicazione. I dati non sono stati modificati.' -ForegroundColor Yellow
        }
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
        throw $failure
    }

    Write-Host 'Reinstallazione completata. Configurazioni, progetti e chiavi conservati.' -ForegroundColor Green
    Write-Host "Backup applicazione: $backup"
    if (-not $NoLaunch) {
        $pythonWindowless = Join-Path $application '.venv\Scripts\pythonw.exe'
        $arguments = '"' + (Join-Path $application 'suite.py') + '" --home "' + $data + '"'
        Start-Process -FilePath $pythonWindowless -ArgumentList $arguments -WorkingDirectory $application
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    try { Invoke-Reinstallation }
    catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
}