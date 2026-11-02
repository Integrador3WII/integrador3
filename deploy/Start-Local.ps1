param([switch]$Demo)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    $composeArgs = @('compose')
    $localConfig = Join-Path $projectRoot 'apps/admin-web/.env.local'
    if (!$Demo -and (Test-Path -LiteralPath $localConfig)) {
        $composeArgs += @('--env-file', $localConfig)
    }
    if ($Demo) {
        # An explicit empty file prevents Compose from loading a root .env.
        $composeArgs += @('--env-file', (Join-Path $PSScriptRoot 'demo.env'))
    }
    & docker @composeArgs up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo construir o iniciar TextilFlow en Docker.' }
    Write-Host 'TextilFlow disponible en http://localhost:8080'
} finally {
    Pop-Location
}
