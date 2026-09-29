#!/usr/bin/env pwsh
# Commit + push dalam satu langkah, supaya tidak ada commit yang tertinggal
# hanya di komputer lokal seperti yang terjadi pada commit installer.
$ErrorActionPreference = 'Stop'
Set-Location 'E:\pressforge'

$msg = $args[0]
if (-not $msg) { Write-Error "Pesan commit wajib diisi"; exit 1 }

git add -A
if (git diff --cached --quiet) { Write-Output "Tidak ada perubahan untuk di-commit."; exit 0 }

git commit -q -m $msg
Write-Output "commit : $(git log --oneline -1)"

$out = "$env:TEMP\pf-push.out"; $err = "$env:TEMP\pf-push.err"
$env:GIT_TERMINAL_PROMPT = '0'
$p = Start-Process -FilePath 'C:\Program Files\Git\cmd\git.exe' -ArgumentList 'push','origin','main' `
  -WorkingDirectory 'E:\pressforge' -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$p.WaitForExit(180000) | Out-Null
Get-Content $err -ErrorAction SilentlyContinue
Get-Content $out -ErrorAction SilentlyContinue
Remove-Item $out,$err -Force -ErrorAction SilentlyContinue

Write-Output "status : $(git status -sb | Select-Object -First 1)"
