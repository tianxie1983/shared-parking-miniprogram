param(
  [string]$url,
  [string]$proj
)

if (-not $url) {
  Write-Host "[SKIP] empty url"
  exit 0
}

# regex: match a single-quoted http(s)://... token inside the JS source
$re = "'https?://[^'']*'"

# Default: patch all 3 mini programs. If $proj is given, patch only that one.
$projects = if ($proj) {
  @($proj)
} else {
  @(
    "C:\Users\Administrator\WorkBuddy\Claw\共享停车小程序-用户版",
    "C:\Users\Administrator\WorkBuddy\Claw\共享停车小程序商家端",
    "C:\Users\Administrator\WorkBuddy\Claw\共享停车小程序"
  )
}

foreach ($p in $projects) {
  $files = @(
    (Join-Path $p "app.js"),
    (Join-Path $p "utils\api.js")
  )
  foreach ($f in $files) {
    if (-not (Test-Path $f)) {
      Write-Host "[SKIP] $f (not found)"
      continue
    }
    try {
      $content = Get-Content -Raw -Encoding UTF8 $f
      $updated = $content -replace $re, "'$url'"
      Set-Content -Path $f -Value $updated -Encoding UTF8 -NoNewline
      Write-Host "[OK]   $f -> $url"
    }
    catch {
      Write-Host "[FAIL] $f : $_"
    }
  }
}
