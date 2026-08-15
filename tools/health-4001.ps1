$ErrorActionPreference = 'Stop'
try {
  $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri "http://127.0.0.1:4001/health"
  Write-Host ("STATUS {0}" -f $r.StatusCode)
  Write-Host $r.Content
} catch {
  Write-Host ("ERROR {0}" -f $_.Exception.Message)
  exit 1
}
