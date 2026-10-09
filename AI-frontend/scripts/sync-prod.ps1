# 把本机已构建的前端 dist 同步到生产。
# 用法：powershell -File AI-frontend/scripts/sync-prod.ps1
# 改完并 git push 之后，也可以只 SSH 执行：ai-update frontend
# 后端不要从 Windows 传 JAR，SSH 执行：ai-update backend

param(
  [switch]$Backend,
  [switch]$SkipBuild,
  [string]$PemPath = ""
)

$ErrorActionPreference = "Stop"
$FrontendRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$pem = $PemPath
if (-not $pem) {
  $pem = Join-Path $env:TEMP "deploy-scene.pem"
  $src = "E:\Quark\新建文件夹\Scene.pem"
  if (Test-Path $src) { Copy-Item $src $pem -Force }
}
if (-not (Test-Path $pem)) { throw "找不到 SSH 私钥，请用 -PemPath 指定" }

$ssh = "C:\Windows\System32\OpenSSH\ssh.exe"
$scp = "C:\Windows\System32\OpenSSH\scp.exe"
$env:HOME = $env:TEMP
$opts = @("-i", $pem, "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL", "-o", "ConnectTimeout=25", "-o", "ServerAliveInterval=20")
$hostName = "root@121.43.177.236"

Push-Location $FrontendRoot
try {
  if (-not $SkipBuild) {
    Write-Host "building frontend..."
    npm run build-only
    if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }
  }
  if (Test-Path dist.tgz) { Remove-Item dist.tgz -Force }
  & "$env:SystemRoot\System32\tar.exe" -czf dist.tgz -C dist .
} finally {
  Pop-Location
}

$tgz = Join-Path $FrontendRoot "dist.tgz"
Write-Host "uploading dist.tgz..."
& $scp @opts $tgz "${hostName}:/tmp/fe-dist.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp dist failed" }

& $ssh @opts $hostName "ai-update frontend-tarball /tmp/fe-dist.tgz && rm -f /tmp/fe-dist.tgz"
if ($LASTEXITCODE -ne 0) { throw "remote frontend deploy failed" }

if ($Backend) {
  Write-Host "updating backend on server via git+maven..."
  & $ssh @opts $hostName "ai-update backend"
  if ($LASTEXITCODE -ne 0) { throw "remote backend deploy failed" }
}

Write-Host "done. open http://121.43.177.236/"
