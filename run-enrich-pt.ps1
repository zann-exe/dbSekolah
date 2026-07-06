# ============================================================
#  PT Enrichment Runner — runs without agent supervision
#  Auto-restarts on crash, runs validation after completion
#  Usage: .\run-enrich-pt.ps1 [-Concurrency N] [-Batch N] [-Offset N]
# ============================================================

param(
    [int]$Concurrency = 0,
    [int]$Batch = 0,
    [int]$Offset = 0,
    [int]$MaxRestarts = 50,
    [int]$RestartDelay = 10
)

$LogFile = "enrich-pt-run.log"
$RestartCount = 0

function Write-Log {
    param([string]$Msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $Msg"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PT Enrichment Runner"
Write-Host "  Started: $(Get-Date)"
Write-Host "  Log: $LogFile"
Write-Host "============================================" -ForegroundColor Cyan

Write-Log "=== Enrichment run started ==="

# Build node args
$nodeArgs = @("build/enrich-pt.js")
if ($Concurrency -gt 0) { $nodeArgs += "--concurrency=$Concurrency" }
if ($Batch -gt 0) { $nodeArgs += "--batch=$Batch" }
if ($Offset -gt 0) { $nodeArgs += "--offset=$Offset" }

while ($RestartCount -lt $MaxRestarts) {
    $RestartCount++
    Write-Host ""
    Write-Host "[Attempt $RestartCount/$MaxRestarts] Running enrich-pt.js..." -ForegroundColor Yellow
    Write-Log "Attempt $RestartCount - starting node"

    # Run node directly — output streams in real-time to console AND log
    & node @nodeArgs 2>&1 | ForEach-Object {
        Write-Host $_
        Write-Log $_
    }
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "Enrichment completed successfully!" -ForegroundColor Green
        Write-Log "Enrichment completed successfully"

        # Run validation — output streams in real-time
        Write-Host ""
        Write-Host "Running validation..." -ForegroundColor Cyan
        Write-Log "Starting validation"
        & npm run validate-pt 2>&1 | ForEach-Object {
            Write-Host $_
            Write-Log $_
        }
        $valExit = $LASTEXITCODE

        if ($valExit -eq 0) {
            Write-Host ""
            Write-Host "============================================" -ForegroundColor Green
            Write-Host "  ALL DONE! Validation passed."
            Write-Host "  Finished: $(Get-Date)"
            Write-Host "============================================" -ForegroundColor Green
            Write-Log "Validation PASSED - all done"
            exit 0
        } else {
            Write-Host ""
            Write-Host "============================================" -ForegroundColor Red
            Write-Host "  VALIDATION FAILED (exit $valExit)"
            Write-Host "  Enrichment data is saved. Check errors above."
            Write-Host "============================================" -ForegroundColor Red
            Write-Log "Validation FAILED (exit $valExit)"
            exit $valExit
        }
    }

    Write-Host ""
    Write-Host "Script exited with code $exitCode. Waiting ${RestartDelay}s before retry..." -ForegroundColor Yellow
    Write-Log "Exited with code $exitCode, waiting ${RestartDelay}s"
    Start-Sleep -Seconds $RestartDelay
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host "  Max restarts ($MaxRestarts) reached."
Write-Host "  Run again later when API is more stable."
Write-Host "  Progress is cached - resume anytime."
Write-Host "============================================" -ForegroundColor Red
Write-Log "Max restarts reached, giving up"
exit 1
