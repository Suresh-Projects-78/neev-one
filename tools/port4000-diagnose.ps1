$ErrorActionPreference = 'Stop'

Write-Host '--- LISTENERS (Get-NetTCPConnection) ---'
$conns = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
if ($conns) {
  $conns | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize | Out-String | Write-Host
  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($p in $pids) {
    try {
      $proc = Get-Process -Id $p -ErrorAction Stop
      Write-Host ("PID {0} => {1}" -f $p, $proc.ProcessName)
    } catch {
      Write-Host ("PID {0} => (process not accessible)" -f $p)
    }
  }
} else {
  Write-Host 'No listeners detected on 4000.'
}

Write-Host ''
Write-Host '--- EXCLUDED PORT RANGES (netsh ipv4) ---'
$raw = netsh interface ipv4 show excludedportrange protocol=tcp
$lines = $raw | Where-Object { $_ -and $_.Trim() -match '^[0-9]' }
$entries = foreach ($line in $lines) {
  $parts = $line.Trim() -split ' +'
  if ($parts.Length -ge 2) {
    [pscustomobject]@{ Start = [int]$parts[0]; End = [int]$parts[1] }
  }
}
$hits = $entries | Where-Object { $_.Start -le 4000 -and $_.End -ge 4000 }
if ($hits) {
  Write-Host 'Port 4000 is inside an excluded range:'
  $hits | Format-Table -AutoSize | Out-String | Write-Host
} else {
  Write-Host 'Port 4000 is NOT in excluded ranges.'
}
