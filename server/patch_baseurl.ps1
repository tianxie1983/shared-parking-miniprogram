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

# 默认：仅修补本项目的 miniprogram（本脚本位于 server/，miniprogram 为同级目录）。
# 若显式传入 $proj（目录路径），则仅修补该目录。
if ($proj) {
  $projects = @($proj)
} else {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $root     = Split-Path -Parent $scriptDir
  $projects = @(Join-Path $root "miniprogram")
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
